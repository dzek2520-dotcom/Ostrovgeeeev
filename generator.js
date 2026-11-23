/**
 * generator.js — процедурный генератор каталога катаклизмов (1000+ записей).
 *
 * Что делает этот файл:
 *  Строит ПОЛНЫЙ каталог по формуле
 *     КАТАКЛИЗМ = архетип × модификатор × масштаб × зона × побочный эффект × длительность
 *  детерминированно (фиксированный seed), поэтому у сервера, тестов и скрипта
 *  проверки всегда один и тот же каталог с одними и теми же id.
 *
 *  Алгоритм:
 *   1. Каждый архетип сам попадает в каталог «как есть» (id = архетип).
 *   2. Для каждого архетипа генерируется VARIANTS_PER_ARCHETYPE вариантов:
 *      - выбирается модификатор, допустимый по категории (или без него, ~15%);
 *      - выбирается масштаб (ненормальный в ~85% случаев, чтобы имена различались);
 *      - выбирается зона из допустимой группы архетипа;
 *      - выбирается побочный эффект (или без него, ~35%);
 *      - выбирается длительность.
 *      Ключ комбинации и итоговое название обязаны быть уникальными.
 *   3. Эффекты складываются: эффекты архетипа + модификатора + побочного эффекта,
 *      все числа умножаются на интенсивность масштаба (скейлинг в scaleFx).
 *   4. Название собирается с согласованием рода: «Мощное Огненное Землетрясение …»
 *      (прилагательное берётся в форме рода архетипа).
 *   5. Описание формируется автоматически из описания архетипа + свойств модификатора
 *      + побочного эффекта + масштаба и зоны.
 */
import { ARCHETYPES } from './archetypes.js';
import { ZONES, ZONE_GROUPS, SCALES, MODIFIERS, SIDE_EFFECTS, DURATIONS } from './modifiers.js';
import { mulberry32, weightedPick, pick } from './rng.js';

/** Сколько вариантов порождается на один архетип. */
export const VARIANTS_PER_ARCHETYPE = 10;
/** Фиксированный seed каталога (менять нельзя — иначе поменяются id). */
export const CATALOG_SEED = 20260619;

/** Индекс форм по роду: m, f, n, p → 0..3. */
const GENDER_IDX = { m: 0, f: 1, n: 2, p: 3 };

/** Поля эффекта, которые масштабируются интенсивностью. */
const SCALE_UP = ['dps', 'v', 'rate', 'dmg', 'hps', 'pull'];

/**
 * Глубокая копия эффекта с масштабированием интенсивности.
 * Числовые «силовые» поля умножаются на k; частота (every) делится на k;
 * количество (n) умножается и округляется (минимум 1); sm тянется к 1 при k<1.
 * Отрицательный v (убыль) тоже усиливается.
 * @param {Object} fx исходный эффект
 * @param {number} k множитель интенсивности
 * @returns {Object} новый эффект
 */
export function scaleFx(fx, k) {
  const o = { ...fx };
  if (o.push) o.push = [o.push[0] * k, o.push[1] * k];
  for (const key of SCALE_UP) if (typeof o[key] === 'number') o[key] = +(o[key] * k).toFixed(3);
  if (typeof o.every === 'number') o.every = +Math.max(0.3, o.every / k).toFixed(2);
  if (typeof o.n === 'number') o.n = Math.max(1, Math.round(o.n * k));
  if (typeof o.p === 'number') o.p = Math.min(1, +(o.p * k).toFixed(3));
  if (typeof o.sm === 'number') o.sm = +Math.max(0.3, 1 - (1 - o.sm) * k).toFixed(3);
  if (typeof o.r === 'number') o.r = +(o.r * (0.8 + 0.2 * k)).toFixed(2);
  return o;
}

/**
 * Объединяет массивы тегов без повторов.
 * @param {...string[]} lists списки тегов
 * @returns {string[]}
 */
function union(...lists) {
  return [...new Set(lists.flat())];
}

/**
 * Собирает название с согласованием рода прилагательных.
 * @param {Object} arch архетип
 * @param {Object} scale масштаб
 * @param {Object|null} mod модификатор
 * @param {Object} zone зона
 * @param {Object|null} side побочный эффект
 * @returns {string}
 */
function buildName(arch, scale, mod, zone, side, withZone) {
  const gi = GENDER_IDX[arch.g];
  const parts = [];
  if (scale.forms) parts.push(scale.forms[gi]);
  if (mod) parts.push(mod.forms[gi].toLowerCase());
  // Первое слово — с заглавной, остальные уже в нижнем регистре, кроме названия архетипа
  const adj = parts.length ? parts.join(' ') : '';
  const base = adj ? arch.name.toLowerCase() : arch.name;
  let name = adj ? `${adj} ${base}` : base;
  if (adj) name = name.charAt(0).toUpperCase() + name.slice(1);
  if (withZone) name += ` ${zone.text}`;
  if (side) name += ` ${side.text}`;
  return name;
}

/**
 * Строит одну запись каталога.
 * @param {string} id идентификатор записи
 * @param {Object} arch архетип
 * @param {Object} scale масштаб
 * @param {Object|null} mod модификатор
 * @param {string} zoneId ключ зоны
 * @param {Object|null} side побочный эффект
 * @param {number} durMul множитель длительности
 * @param {boolean} isBase true — запись-архетип без генерации
 * @returns {Object} запись каталога
 */
function buildEntry(id, arch, scale, mod, zoneId, side, durMul, isBase) {
  const zone = ZONES[zoneId];
  const k = scale.k * (mod && mod.mult ? mod.mult : 1);
  // 1) складываем эффекты
  // Каждому эффекту проставляем `ct` — теги, которые защищают именно от него
  // (защита от «ядовитого» модификатора не должна спасать от землетрясения архетипа).
  const withCt = (list, ct) => list.map((f) => ({ ...scaleFx(f, k), ct }));
  const effects = [
    ...withCt(arch.fx, arch.counter),
    ...withCt(mod ? mod.fx : [], mod ? mod.counter : []),
    ...withCt(side ? side.fx : [], side ? side.counter : []),
  ];
  // 2) теги угроз и защиты
  const tags = union(arch.tags, mod ? mod.tags : [], side ? side.tags : []);
  const counter = union(arch.counter, mod ? mod.counter : [], side ? side.counter : []);
  // 3) тяжесть
  const severity = Math.max(1, Math.min(10, Math.round(arch.sev + scale.dsev + (mod ? mod.dsev : 0))));
  // 4) визуал: базовый + переопределения модификатора
  const vis = { ...arch.vis };
  if (mod && mod.c && (vis.a === 0 || mod.p)) { vis.c = mod.c; vis.a = Math.max(vis.a, 0.1); }
  if (mod && mod.p && vis.p === 'none') vis.p = mod.p;
  if (mod && mod.dark) vis.d = Math.max(vis.d || 0, mod.dark);
  vis.sh = Math.min(10, +(vis.sh * (0.6 + 0.4 * scale.k)).toFixed(2));
  // 5) длительность и предупреждение
  const duration = Math.round(arch.dur * scale.dur * durMul);
  const warningTime = Math.max(5, Math.round(arch.warn * (severity >= 8 ? 1.0 : 0.9)));
  // 6) описание
  const scaleTxt = scale.forms ? scale.forms[0].toLowerCase() : 'обычный';
  let description = arch.desc;
  if (!isBase) {
    description += ` Особенность: ${mod ? mod.desc : 'без особых свойств'}.`;
    if (side) description += ` Побочно: ${side.desc}.`;
    description += ` Масштаб: ${scaleTxt}; зона: ${zone.text}.`;
  }
  const weight = +(arch.w * scale.w * (mod ? 0.8 : 1)).toFixed(3);
  return {
    id,
    base: arch.id,
    name: isBase ? arch.name : buildName(arch, scale, mod, zone, side, true),
    description,
    category: arch.cat,
    tags, counterTags: counter,
    severity,
    warningTime,
    duration,
    cooldown: 60 + severity * 12,
    zone: { id: zoneId, ...zone },
    effects,
    visuals: vis,
    sound: arch.snd,
    weight,
    minPlayers: arch.min,
    canCombineWith: arch.cmb,
    gen: { scale: scale.id, modifier: mod ? mod.id : null, side: side ? side.id : null, durMul },
  };
}

/**
 * Генерирует полный каталог катаклизмов.
 * @returns {Object[]} массив записей (≥ 1000), id и названия уникальны
 */
export function generateCatalog() {
  const rng = mulberry32(CATALOG_SEED);
  const catalog = [];
  const usedNames = new Set();
  const usedKeys = new Set();

  for (const arch of ARCHETYPES) {
    // Запись-архетип «как есть»: нормальный масштаб, первая зона группы по умолчанию
    const zones = ZONE_GROUPS[arch.z] || ZONE_GROUPS.ANY;
    const baseEntry = buildEntry('a_' + arch.id, arch, SCALES.find((s) => s.id === 'normal'), null, zones[0], null, 1, true);
    catalog.push(baseEntry);
    usedNames.add(baseEntry.name);

    const mods = MODIFIERS.filter((m) => !m.cats || m.cats.includes(arch.cat));
    let made = 0, tries = 0, seq = 0;
    while (made < VARIANTS_PER_ARCHETYPE && tries < 600) {
      tries++;
      const mod = rng() < 0.15 ? null : pick(rng, mods);
      const scale = weightedPick(rng, SCALES, (s) => (s.id === 'normal' ? 0.35 : s.w));
      const zoneId = pick(rng, zones);
      const side = rng() < 0.35 ? null : pick(rng, SIDE_EFFECTS);
      const key = `${arch.id}|${mod ? mod.id : '-'}|${scale.id}|${zoneId}|${side ? side.id : '-'}`;
      if (usedKeys.has(key)) continue;
      const name = buildName(arch, scale, mod, ZONES[zoneId], side, true);
      if (usedNames.has(name)) continue;
      const durMul = pick(rng, DURATIONS);
      usedKeys.add(key);
      usedNames.add(name);
      seq++;
      catalog.push(buildEntry(`g_${arch.id}_${seq}`, arch, scale, mod, zoneId, side, durMul, false));
      made++;
    }
  }
  return catalog;
}
