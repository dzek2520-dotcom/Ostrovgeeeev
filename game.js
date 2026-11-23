/**
 * game.js — авторитетная игровая симуляция одной комнаты.
 *
 * Что делает этот файл:
 *  Класс Game держит ВСЁ состояние раунда: мир (World), игроков, мобов, лут, постройки,
 *  менеджер катаклизмов и режиссёра. Клиент лишь шлёт ввод и рисует снапшоты.
 *   - tick(dt): один шаг симуляции (катаклизмы → ввод → выживание → мобы → лут → рассылка);
 *   - handle(id, msg): обработка действий игрока (input, interact, attack, craft, place, use, give, heal);
 *   - защита от читов: ограничение «кредита времени» на движение, валидация всех полей;
 *   - отключения: игрок 60 секунд ждёт возвращения, затем считается выбывшим;
 *   - конец раунда: когда выжил один (или все погибли) — формируется таблица результатов.
 */
import { SIZE, TICK_RATE, T, F, ITEMS, STRUCTS, RECIPES, MOBS, FACING_DIST, moveStep } from './shared.js';
import { World, isWaterType } from './world.js';
import { CataclysmManager } from './effects.js';
import { Director } from './director.js';
import { updateMobs, spawnMob, dropFromMob } from './mobs.js';
import { mulberry32 } from './rng.js';
import { clamp, num } from './validate.js';

/** Через сколько секунд отключённый игрок считается выбывшим. */
const RECONNECT_GRACE = 60;
/** Нормальная температура тела, °C. */
const TEMP_OK = 36.6;
/** Защита от тайла-биома. */
const CAVE_PROT = ['rain', 'hail', 'wind', 'sun', 'heat', 'cold', 'ash', 'fire', 'lightning', 'fog'];
const WATER_PROT = ['fire', 'heat', 'explosion', 'quake'];

/** Округление до сотых. */
const r2 = (v) => Math.round(v * 100) / 100;

/** Таблица добычи по типу тайла: [предмет, мин, макс, шанс]. */
const GATHER = {
  [T.FOREST]: [['wood', 1, 2, 1], ['food', 1, 1, 0.2]],
  [T.GRASS]: [['food', 1, 1, 0.3], ['cloth', 1, 1, 0.25]],
  [T.SAND]: [['wood', 1, 1, 0.35], ['cloth', 1, 1, 0.12]],
  [T.ROCK]: [['stone', 1, 2, 1], ['metal', 1, 1, 0.15]],
  [T.CAVE]: [['metal', 1, 2, 0.45], ['stone', 1, 1, 0.5], ['artifact', 1, 1, 0.04]],
  [T.VOLCANO]: [['stone', 1, 2, 0.6], ['fuel', 1, 1, 0.25]],
  [T.ASH]: [['stone', 1, 1, 0.3], ['fuel', 1, 1, 0.15]],
  [T.SWAMP]: [['cloth', 1, 1, 0.4], ['medicine', 1, 1, 0.3]],
  [T.MUD]: [['cloth', 1, 1, 0.12]],
  [T.CRATER]: [['metal', 1, 2, 0.45], ['stone', 1, 1, 0.3]],
  [T.SHALLOW]: [['fish', 1, 1, 0.3]],
};

export class Game {
  /**
   * @param {Object} o параметры
   * @param {string} o.code код комнаты
   * @param {number} o.seed зерно мира
   * @param {{id:number,name:string,color:string}[]} o.members участники
   * @param {{pvp:boolean,chaos:boolean}} o.settings настройки
   * @param {{send:(id:number,msg:Object)=>void, broadcast:(msg:Object)=>void}} o.io каналы отправки
   * @param {(res:Object)=>void} o.onEnd колбэк конца раунда
   */
  constructor(o) {
    this.code = o.code;
    this.seed = o.seed >>> 0;
    this.settings = { pvp: !!o.settings.pvp, chaos: !!o.settings.chaos };
    this.io = o.io;
    this.onEnd = o.onEnd;
    this.world = new World(this.seed);
    this.rng = mulberry32(this.seed ^ 0xc0ffee);   // ГСЧ событий (общий seed => воспроизводимо)
    this.time = 0;
    this.tickN = 0;
    this.nextId = 1;
    this.players = new Map();
    this.mobs = new Map();
    this.loot = new Map();
    this.structs = new Map();
    this.fxBuf = [];
    this.structEv = { add: [], del: [], upd: new Set() };
    this.worldAcc = 0;
    this.ended = false;
    this.startCount = o.members.length;
    this.cata = new CataclysmManager(this);
    this.director = new Director(this);
    this.spawnPlayers(o.members);
    this.log('info', 'started', {}, 'Игра началась! Выживайте!');
  }

  /* ───────────── Игроки ───────────── */

  /**
   * Создаёт игроков и расставляет их по стартовым точкам.
   * @param {{id:number,name:string,color:string}[]} members участники
   */
  spawnPlayers(members) {
    const w = this.world, taken = [];
    for (const m of members) {
      let pos = null;
      for (let k = 0; k < 80 && !pos; k++) {
        const c = w.randomLand(this.rng, (x, y, t) => {
          if (t !== T.GRASS && t !== T.SAND && t !== T.FOREST) return false;
          if (Math.hypot(x - SIZE / 2, y - SIZE / 2) > 14) return false;
          const v = w.anchors.volcano, l = w.anchors.lake;
          if (Math.hypot(x - v.x, y - v.y) < 7 || Math.hypot(x - l.x, y - l.y) < 5) return false;
          return true;
        });
        if (taken.every((q) => Math.hypot(q.x - c.x, q.y - c.y) > 1.6)) pos = c;
      }
      pos = pos || w.randomLand(this.rng);
      taken.push(pos);
      this.players.set(m.id, {
        id: m.id, name: m.name, color: m.color, x: pos.x, y: pos.y, dir: 0,
        hp: 100, hunger: 85, thirst: 85, temp: TEMP_OK, stamina: 100, sanity: 100,
        inv: { food: 2, water: 1, wood: 2, cloth: 1 }, st: new Map(), alive: true, diedAt: 0, cause: '',
        connected: true, discAt: 0, queue: [], credit: 0.2, ack: 0, sprinting: false, sprintLock: false,
        prot: new Set(), env: { sm: 1, invert: false }, sm: 1, raft: false, near: { campfire: false },
        stats: { res: 0, surv: 0, help: 0, kills: 0 }, cd: { interact: 0, attack: 0 }, lastBy: null,
      });
    }
  }

  /** @returns {Object[]} живые игроки */
  alivePlayers() { const r = []; for (const p of this.players.values()) if (p.alive) r.push(p); return r; }

  /**
   * Ближайший живой игрок к точке.
   * @param {number} x X
   * @param {number} y Y
   * @param {number} maxD максимальная дистанция
   * @param {number} [exceptId] исключить игрока
   * @returns {Object|null}
   */
  nearestPlayer(x, y, maxD, exceptId) {
    let best = null, bd = maxD;
    for (const p of this.players.values()) {
      if (!p.alive || p.id === exceptId) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /* ───────────── Сообщения клиентам ───────────── */

  /** Рассылка всем участникам. */
  broadcast(msg) { this.io.broadcast(msg); }

  /** Отправка одному игроку. */
  send(id, msg) { this.io.send(id, msg); }

  /**
   * Запись в ленту событий (всем).
   * @param {string} kind info|good|warn|bad
   * @param {string} key ключ i18n log.*
   * @param {Object} args параметры подстановки
   * @param {string} msg запасной текст по-русски
   */
  log(kind, key, args, msg) { this.broadcast({ t: 'log', kind, key, args, msg }); }

  /** Запись в ленту событий одному игроку. */
  logTo(id, kind, key, args, msg) { this.send(id, { t: 'log', kind, key, args, msg }); }

  /** Визуальное событие для клиентов (взрыв, молния…). */
  fx(e) { if (this.fxBuf.length < 80) this.fxBuf.push(e); }

  /* ───────────── Вспомогательные игровые операции ───────────── */

  /**
   * Нанести урон игроку.
   * @param {Object} p игрок
   * @param {number} amt урон
   * @param {string} cause причина (для сообщения о смерти)
   * @param {Object} [by] виновник-игрок
   */
  damage(p, amt, cause, by) {
    if (!p.alive || amt <= 0 || this.ended) return;
    p.hp -= amt;
    p.cause = cause || p.cause;
    if (by) p.lastBy = by.id;
    if (amt >= 4) this.fx({ k: 'hit', x: p.x, y: p.y });
    if (p.hp <= 0) this.die(p, cause);
  }

  /** Лечение. */
  heal(p, amt) { if (p.alive) p.hp = Math.min(100, p.hp + amt); }

  /**
   * Изменить показатель игрока.
   * @param {Object} p игрок
   * @param {string} stat hunger|thirst|temp|sanity|stamina
   * @param {number} v изменение (для temp — «очки» ×0.15 °C)
   */
  addStat(p, stat, v) {
    if (!p.alive) return;
    if (stat === 'temp') p.temp = clamp(p.temp + v * 0.15, 25, 45);
    else if (stat in p) p[stat] = clamp(p[stat] + v, 0, 100);
  }

  /**
   * Наложить статус.
   * @param {Object} p игрок
   * @param {string} s ключ статуса
   * @param {number} dur длительность, сек
   */
  addStatus(p, s, dur) {
    if (!p.alive) return;
    if (s === 'burning' && (p.st.has('wet') || isWaterType(this.world.typeAt(p.x, p.y)))) return;
    if (s === 'wet') p.st.delete('burning');
    p.st.set(s, Math.max(p.st.get(s) || 0, dur));
  }

  /** Сдвиг игрока (ветер, течение, притяжение) с учётом столкновений. */
  shove(p, dx, dy, dt) {
    if (!p.alive) return;
    const dir = p.dir;
    moveStep(this.world.tiles, this.world.flags, p, dx / 3.3, dy / 3.3, false, dt, 1, p.raft);
    p.dir = dir;
  }

  /** Добавить предмет в инвентарь (макс. 99). @returns {number} сколько добавлено */
  addItem(p, item, n = 1) {
    if (!ITEMS[item]) return 0;
    const cur = p.inv[item] || 0, add = Math.min(n, 99 - cur);
    if (add > 0) p.inv[item] = cur + add;
    return add;
  }

  /** Забрать предмет. @returns {boolean} успех */
  takeItem(p, item, n = 1) {
    if ((p.inv[item] || 0) < n) return false;
    p.inv[item] -= n;
    if (p.inv[item] <= 0) delete p.inv[item];
    return true;
  }

  /** Создать предмет на земле. */
  dropLoot(x, y, item, n) {
    if (this.loot.size > 160) return;
    const id = this.nextId++;
    this.loot.set(id, { id, x: clamp(x, 0.5, SIZE - 0.5), y: clamp(y, 0.5, SIZE - 0.5), i: item, n, ttl: 150 });
  }

  /**
   * Украсть случайный предмет: вор получает его, иначе предмет падает рядом с жертвой.
   * @param {Object} victim жертва
   * @param {Object} [thief] игрок-вор
   */
  stealFrom(victim, thief) {
    const keys = Object.keys(victim.inv).filter((k) => !ITEMS[k].gear);
    if (!keys.length) return;
    const item = keys[Math.floor(this.rng() * keys.length)];
    this.takeItem(victim, item, 1);
    if (thief) this.addItem(thief, item, 1);
    else {
      const a = this.rng() * 6.28, d = 1.5 + this.rng() * 2;
      this.dropLoot(victim.x + Math.cos(a) * d, victim.y + Math.sin(a) * d, item, 1);
    }
    this.logTo(victim.id, 'bad', 'stole', { item: ITEMS[item].name }, `🏴‍☠️ Украдено: ${ITEMS[item].name}!`);
  }

  /** Телепорт игрока в случайное место суши. */
  teleport(p) {
    this.fx({ k: 'tele', x: p.x, y: p.y });
    const c = this.world.randomLand(this.rng);
    p.x = c.x; p.y = c.y;
    this.fx({ k: 'tele', x: p.x, y: p.y });
  }

  /** Обмен позициями двух игроков. */
  swapPlayers(a, b) {
    this.fx({ k: 'tele', x: a.x, y: a.y }); this.fx({ k: 'tele', x: b.x, y: b.y });
    [a.x, b.x] = [b.x, a.x]; [a.y, b.y] = [b.y, a.y];
  }

  /** Урон постройке; уничтожает при hp<=0. */
  damageStruct(st, amt) {
    if (amt <= 0) return;
    st.hp -= amt;
    if (st.hp <= 0) {
      this.structs.delete(st.id);
      this.structEv.del.push(st.id);
      this.fx({ k: 'boom', x: st.x, y: st.y, r: 1 });
    } else this.structEv.upd.add(st.id);
  }

  /** Урон мобу. */
  hurtMob(m, dmg, by) {
    m.hp -= dmg;
    this.fx({ k: 'hit', x: m.x, y: m.y });
    if (m.hp <= 0 && this.mobs.delete(m.id)) {
      dropFromMob(this, m);
      if (by) by.stats.kills++;
    }
  }

  /** Смерть игрока. */
  die(p, cause) {
    if (!p.alive) return;
    p.alive = false; p.hp = 0; p.diedAt = this.time; p.queue.length = 0;
    this.fx({ k: 'death', x: p.x, y: p.y });
    // содержимое рюкзака падает на землю
    for (const [item, n] of Object.entries(p.inv)) {
      const a = this.rng() * 6.28, d = 0.4 + this.rng() * 1.2;
      this.dropLoot(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, item, n);
    }
    p.inv = {};
    const killer = p.lastBy != null ? this.players.get(p.lastBy) : null;
    if (killer && killer.id !== p.id) killer.stats.kills++;
    const why = cause ? ` — ${cause}` : '';
    this.log('bad', 'died', { name: p.name, cause: why }, `☠️ ${p.name} погиб${why}`);
  }

  /* ───────────── Игровой цикл ───────────── */

  /**
   * Один шаг симуляции.
   * @param {number} dtReal реальное время с прошлого тика, сек
   */
  tick(dtReal) {
    if (this.ended) return;
    const dt = clamp(dtReal, 0.01, 0.1);
    this.time += dt; this.tickN++;
    const w = this.world;
    // 1) состояние мира (1 раз в секунду)
    this.worldAcc += dt;
    if (this.worldAcc >= 1) { this.worldAcc = 0; w.update(this.time); }
    w.time = this.time;
    // 2) подготовка игроков: защита и сброс окружения
    for (const p of this.players.values()) { if (p.alive) this.computeProt(p); p.env.sm = 1; p.env.invert = false; }
    // 3) катаклизмы и режиссёр
    this.cata.update(dt);
    this.director.update();
    // 4) ввод и выживание
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      this.processInput(p, dt);
      this.survive(p, dt);
      if (!p.connected && this.time - p.discAt > RECONNECT_GRACE) this.die(p, 'потерял связь с островом');
    }
    // 5) мобы, лут
    updateMobs(this, dt);
    this.updateLoot(dt);
    // 6) рассылка изменений мира и построек
    this.flushWorld();
    // 7) конец раунда?
    this.checkEnd();
    // 8) снапшоты
    this.sendSnapshots();
  }

  /**
   * Вычисляет набор защитных тегов игрока (экипировка, постройки, биом).
   * @param {Object} p игрок
   */
  computeProt(p) {
    const prot = new Set();
    for (const k of Object.keys(p.inv)) { const g = ITEMS[k] && ITEMS[k].gear; if (g) for (const t of g) prot.add(t); }
    p.raft = (p.inv.raft || 0) > 0;
    let camp = false;
    for (const s of this.structs.values()) {
      const def = STRUCTS[s.k];
      if (Math.hypot(s.x - p.x, s.y - p.y) <= def.radius) {
        for (const t of def.prot) prot.add(t);
        if (s.k === 'campfire') camp = true;
      }
    }
    const tt = this.world.typeAt(p.x, p.y);
    if (tt === T.CAVE) for (const t of CAVE_PROT) prot.add(t);
    if (tt === T.SHALLOW || tt === T.LAKE || (this.world.flagsAt(p.x, p.y) & F.FLOOD)) for (const t of WATER_PROT) prot.add(t);
    p.prot = prot; p.near.campfire = camp;
  }

  /**
   * Обрабатывает очередь ввода игрока с ограничением «кредита времени».
   * @param {Object} p игрок
   * @param {number} dt секунды тика
   */
  processInput(p, dt) {
    p.credit = Math.min(0.35, p.credit + dt);
    // множитель скорости
    let sm = p.env.sm;
    if (p.st.has('slowed')) sm *= 0.6;
    if (p.st.has('heavy')) sm *= 0.65;
    if (p.st.has('frozen')) sm *= 0.7;
    if (p.st.has('floaty')) sm *= 1.2;
    if (p.hunger <= 0 || p.thirst <= 0) sm *= 0.8;
    if (p.st.has('stunned')) sm = 0;
    p.sm = r2(sm);
    p.sprinting = false;
    const invert = p.env.invert;
    while (p.queue.length && p.credit > 0.0005) {
      const inp = p.queue[0];
      const use = Math.min(inp.dt, p.credit);
      let ax = inp.dx, ay = inp.dy;
      if (invert) { ax = -ax; ay = -ay; }
      if (p.st.has('confused')) {            // дезориентация: ввод «плывёт»
        const a = Math.sin(this.time * 2.5) * 0.9, c = Math.cos(a), s = Math.sin(a);
        [ax, ay] = [ax * c - ay * s, ax * s + ay * c];
      }
      const moving = Math.hypot(ax, ay) > 0.05;
      const sprint = inp.sprint && moving && p.stamina > 0 && !p.sprintLock;
      moveStep(this.world.tiles, this.world.flags, p, ax, ay, sprint, use, sm, p.raft);
      if (sprint) { p.sprinting = true; p.stamina = Math.max(0, p.stamina - 14 * use); if (p.stamina <= 0) p.sprintLock = true; }
      p.credit -= use;
      if (use >= inp.dt - 1e-6) { p.ack = inp.seq; p.queue.shift(); } else { inp.dt -= use; break; }
    }
    if (!p.sprinting) { p.stamina = Math.min(100, p.stamina + 9 * dt); if (p.stamina > 25) p.sprintLock = false; }
    // если под ногами возникла трещина — игрок проваливается и спасается
    const here = this.world.typeAt(p.x, p.y);
    if (here === T.CRACK) {
      this.damage(p, 15, 'провалился в трещину');
      const c = this.nearestSafe(p.x, p.y);
      p.x = c.x; p.y = c.y;
    }
  }

  /** Ближайшая безопасная клетка (спираль). */
  nearestSafe(x, y) {
    for (let r = 1; r < 12; r++) {
      for (let a = 0; a < 16; a++) {
        const nx = x + Math.cos(a / 16 * 6.283) * r, ny = y + Math.sin(a / 16 * 6.283) * r;
        if (this.world.isWalkable(nx, ny)) return { x: nx, y: ny };
      }
    }
    return this.world.randomLand(this.rng);
  }

  /**
   * Выживание: голод/жажда/температура/статусы/регенерация.
   * @param {Object} p игрок
   * @param {number} dt секунды
   */
  survive(p, dt) {
    const w = this.world, tt = w.typeAt(p.x, p.y), fl = w.flagsAt(p.x, p.y);
    const inWater = tt === T.SHALLOW || tt === T.LAKE;
    // базовые потребности
    p.hunger = Math.max(0, p.hunger - 0.14 * dt);
    p.thirst = Math.max(0, p.thirst - 0.2 * dt);
    // температура стремится к норме; костёр согревает
    p.temp += (TEMP_OK - p.temp) * 0.05 * dt;
    if (p.near.campfire && p.temp < TEMP_OK) p.temp += 0.25 * dt;
    if (p.st.has('wet')) p.temp -= 0.03 * dt;
    // тайловые угрозы
    if (tt === T.LAVA) { this.damage(p, 18 * dt, 'сгорел в лаве'); this.addStatus(p, 'burning', 4); }
    if (tt === T.OCEAN && !p.raft) { this.damage(p, 3 * dt, 'утонул'); p.stamina = Math.max(0, p.stamina - 10 * dt); }
    if ((fl & F.FIRE) && !p.prot.has('fire') && !inWater) this.addStatus(p, 'burning', 3);
    if ((fl & F.TOXIC) && !p.prot.has('toxic') && this.rng() < 0.6 * dt) this.addStatus(p, 'poisoned', 6);
    if ((fl & F.RAD) && !p.prot.has('radiation') && this.rng() < 0.5 * dt) this.addStatus(p, 'irradiated', 10);
    if ((fl & F.SPORE) && !p.prot.has('spores') && this.rng() < 0.4 * dt) { this.addStatus(p, 'poisoned', 5); this.addStat(p, 'sanity', -2 * dt); }
    if ((fl & F.FLOOD) && !p.raft && this.rng() < 0.5 * dt) this.addStatus(p, 'wet', 10);
    if ((fl & F.FROZEN) && !p.prot.has('cold')) p.temp -= 0.05 * dt;
    if (inWater && this.rng() < 1.5 * dt) this.addStatus(p, 'wet', 8);
    // эффекты статусов
    let bad = false;
    for (const [s, t] of p.st) {
      const left = t - dt;
      if (left <= 0) { p.st.delete(s); continue; }
      p.st.set(s, left);
      switch (s) {
        case 'burning': this.damage(p, 4 * dt, 'сгорел заживо'); bad = true; if (inWater) p.st.delete('burning'); break;
        case 'poisoned': this.damage(p, 1.4 * dt, 'яд'); bad = true; break;
        case 'bleeding': this.damage(p, 1.2 * dt, 'кровотечение'); bad = true; break;
        case 'infected': this.damage(p, 0.8 * dt, 'инфекция'); p.hunger = Math.max(0, p.hunger - 0.3 * dt); bad = true; break;
        case 'irradiated': this.damage(p, 1.0 * dt, 'радиация'); this.addStat(p, 'sanity', -0.4 * dt); bad = true; break;
        case 'frozen': p.temp -= 0.04 * dt; break;
        default: break;
      }
    }
    // последствия состояния
    if (p.hunger <= 0) this.damage(p, 1.0 * dt, 'голод');
    if (p.thirst <= 0) this.damage(p, 1.6 * dt, 'жажда');
    if (p.temp > 40) this.damage(p, (p.temp - 40) * 0.8 * dt, 'перегрев');
    if (p.temp < 33) this.damage(p, (33 - p.temp) * 0.8 * dt, 'переохлаждение');
    if (p.sanity <= 0) { this.damage(p, 0.6 * dt, 'безумие'); this.addStatus(p, 'confused', 2); }
    // рассудок восстанавливается у костра и рядом с людьми
    let sreg = 0.05;
    if (p.near.campfire) sreg += 0.4;
    if (p.st.has('glowing')) sreg += 0.3;
    if (this.nearestPlayer(p.x, p.y, 4, p.id)) sreg += 0.2;
    if (p.sanity < 100) p.sanity = Math.min(100, p.sanity + sreg * dt);
    // регенерация
    if (!bad && p.hunger > 40 && p.thirst > 40 && p.temp > 35.5 && p.temp < 38 && p.hp < 100) {
      p.hp = Math.min(100, p.hp + (p.near.campfire ? 1.0 : 0.5) * dt);
    }
    p.temp = clamp(p.temp, 25, 45);
  }

  /** Лут: время жизни и автоподбор. */
  updateLoot(dt) {
    for (const l of [...this.loot.values()]) {
      l.ttl -= dt;
      if (l.ttl <= 0) { this.loot.delete(l.id); continue; }
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (Math.hypot(p.x - l.x, p.y - l.y) < 0.7) {
          const add = this.addItem(p, l.i, l.n);
          if (add > 0) {
            p.stats.res += add;
            this.fx({ k: 'gather', x: l.x, y: l.y });
            this.logTo(p.id, 'good', 'gathered', { item: ITEMS[l.i].name, n: add }, `Добыто: ${ITEMS[l.i].name} ×${add}`);
            this.loot.delete(l.id);
          }
          break;
        }
      }
    }
  }

  /** Рассылает изменения тайлов и построек. */
  flushWorld() {
    const ch = this.world.drainChanges();
    for (let i = 0; i < ch.length; i += 500) this.broadcast({ t: 'tiles', d: ch.slice(i, i + 500) });
    const ev = this.structEv;
    if (ev.add.length) { this.broadcast({ t: 'structs', add: ev.add }); ev.add = []; }
    if (ev.del.length) { this.broadcast({ t: 'structs', del: ev.del }); ev.del = []; }
    if (ev.upd.size) {
      const upd = [];
      for (const id of ev.upd) { const s = this.structs.get(id); if (s) upd.push({ id, hp: Math.round(s.hp) }); }
      if (upd.length) this.broadcast({ t: 'structs', upd });
      ev.upd.clear();
    }
  }

  /** Проверка условий конца раунда. */
  checkEnd() {
    const alive = this.alivePlayers();
    const limit = this.startCount > 1 ? 1 : 0;
    if (alive.length > limit) return;
    this.ended = true;
    const all = [...this.players.values()];
    const results = all.map((p) => ({
      id: p.id, name: p.name, color: p.color, alive: p.alive,
      time: Math.round(p.alive ? this.time : p.diedAt),
      res: p.stats.res, surv: p.stats.surv, help: p.stats.help, kills: p.stats.kills,
    }));
    results.sort((a, b) => (b.alive - a.alive) || (b.time - a.time) || (b.surv - a.surv));
    results.forEach((r, i) => { r.rank = i + 1; });
    const winnerId = results.length ? results[0].id : null;
    if (winnerId != null && results.length > 1) this.log('good', 'won', { name: results[0].name }, `🏆 ${results[0].name} победил!`);
    this.onEnd({ results, winnerId, duration: Math.round(this.time) });
  }

  /* ───────────── Действия игроков ───────────── */

  /**
   * Подключение/отключение игрока.
   * @param {number} id id игрока
   * @param {boolean} connected подключён ли
   */
  setConnected(id, connected) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    if (!connected) { p.discAt = this.time; p.queue.length = 0; }
    else this.log('info', 'reconnect', { name: p.name }, `${p.name} переподключился`);
  }

  /**
   * Диспетчер игровых сообщений.
   * @param {number} id id игрока
   * @param {Object} m сообщение клиента
   */
  handle(id, m) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.ended) return;
    switch (m.t) {
      case 'input': this.onInput(p, m); break;
      case 'interact': this.interact(p); break;
      case 'attack': this.attack(p); break;
      case 'craft': this.craft(p, m.id); break;
      case 'place': this.place(p, m.id); break;
      case 'use': this.useItem(p, m.item); break;
      case 'give': this.give(p, m.item, m.to); break;
      case 'heal': this.healOther(p, m.to); break;
      default: break;
    }
  }

  /** Принимает ввод движения (валидация и ограничение очереди). */
  onInput(p, m) {
    const dt = clamp(num(m.dt, 0.033), 0, 0.1);
    if (p.queue.length >= 12) p.queue.shift();
    p.queue.push({
      seq: num(m.seq, 0) | 0, dx: clamp(num(m.dx), -1, 1), dy: clamp(num(m.dy), -1, 1),
      sprint: !!m.sprint, dt,
    });
  }

  /** Точка перед игроком. */
  front(p, dist) { return { x: p.x + Math.cos(p.dir) * dist, y: p.y + Math.sin(p.dir) * dist }; }

  /** Взаимодействие (E): подбор, фильтр, добыча ресурсов, питьё. */
  interact(p) {
    if (this.time < p.cd.interact) return;
    p.cd.interact = this.time + 0.35;
    // 1) лут рядом
    let best = null, bd = 1.5;
    for (const l of this.loot.values()) { const d = Math.hypot(l.x - p.x, l.y - p.y); if (d < bd) { bd = d; best = l; } }
    if (best) {
      const add = this.addItem(p, best.i, best.n);
      if (add > 0) {
        p.stats.res += add; this.loot.delete(best.id); this.fx({ k: 'gather', x: best.x, y: best.y });
        this.logTo(p.id, 'good', 'gathered', { item: ITEMS[best.i].name, n: add }, `Добыто: ${ITEMS[best.i].name} ×${add}`);
      }
      return;
    }
    // 2) фильтр воды
    for (const s of this.structs.values()) {
      if (s.k === 'filter' && Math.hypot(s.x - p.x, s.y - p.y) < 1.8) {
        this.addStat(p, 'thirst', 45); p.st.delete('poisoned');
        this.logTo(p.id, 'good', 'drink', { item: 'чистой воды' }, 'Вы напились чистой воды');
        this.fx({ k: 'heal', x: p.x, y: p.y });
        return;
      }
    }
    // 3) добыча с тайла
    if (p.stamina < 3) return;
    const f = this.front(p, 0.85);
    let tt = this.world.typeAt(f.x, f.y), fi = this.world.flagsAt(f.x, f.y);
    if (tt === T.OCEAN) { tt = this.world.typeAt(p.x, p.y); fi = this.world.flagsAt(p.x, p.y); }
    if (tt === T.LAKE) {                  // озеро: пить или набрать воду
      if (p.thirst < 85) {
        this.addStat(p, 'thirst', 30);
        if (fi & F.TOXIC) this.addStatus(p, 'poisoned', 10);
        this.logTo(p.id, 'info', 'drink', { item: 'из озера' }, 'Вы напились из озера');
      } else if (this.addItem(p, 'water', 1)) { p.stats.res++; this.logTo(p.id, 'good', 'gathered', { item: ITEMS.water.name, n: 1 }, 'Добыто: Вода ×1'); }
      this.fx({ k: 'splash', x: f.x, y: f.y, r: 0.4 });
      p.stamina -= 2; return;
    }
    const table = GATHER[tt];
    p.stamina -= 3;
    this.fx({ k: 'gather', x: f.x, y: f.y });
    if (!table) return;
    for (const [item, mn, mx, chance] of table) {
      if (this.rng() < chance) {
        const n = mn + Math.floor(this.rng() * (mx - mn + 1));
        const add = this.addItem(p, item, n);
        if (add) { p.stats.res += add; this.logTo(p.id, 'good', 'gathered', { item: ITEMS[item].name, n: add }, `Добыто: ${ITEMS[item].name} ×${add}`); }
      }
    }
  }

  /** Атака перед собой по мобу (или игроку при PvP). */
  attack(p) {
    if (this.time < p.cd.attack) return;
    p.cd.attack = this.time + 0.45;
    const dmg = (p.inv.spear || 0) > 0 ? 24 : 8;
    const f = this.front(p, 0.8);
    this.fx({ k: 'hit', x: f.x, y: f.y });
    let target = null, bd = 1.35;
    for (const m of this.mobs.values()) { const d = Math.hypot(m.x - f.x, m.y - f.y); if (d < bd) { bd = d; target = m; } }
    if (target) { this.hurtMob(target, dmg, p); return; }
    if (this.settings.pvp) {
      let victim = null, vd = 1.35;
      for (const o of this.players.values()) {
        if (!o.alive || o.id === p.id) continue;
        const d = Math.hypot(o.x - f.x, o.y - f.y);
        if (d < vd) { vd = d; victim = o; }
      }
      if (victim) {
        this.damage(victim, dmg * 0.8, `от руки ${p.name}`, p);
        this.shove(victim, Math.cos(p.dir) * 40, Math.sin(p.dir) * 40, 0.05);
        if (this.rng() < 0.25) this.stealFrom(victim, p);
      }
    }
  }

  /** Крафт предмета. */
  craft(p, id) {
    const r = RECIPES.find((x) => x.id === id && x.kind === 'item');
    if (!r || !this.canCraft(p, r)) return this.logTo(p.id, 'warn', 'nocraft', {}, 'Не хватает ресурсов или нет нужной постройки рядом');
    for (const [k, n] of Object.entries(r.cost)) this.takeItem(p, k, n);
    this.addItem(p, r.id, 1);
    this.fx({ k: 'craft', x: p.x, y: p.y });
    this.logTo(p.id, 'good', 'crafted', { item: ITEMS[r.id].name }, `Создано: ${ITEMS[r.id].name}`);
  }

  /** Хватает ли ресурсов и нужной постройки рядом. */
  canCraft(p, r) {
    for (const [k, n] of Object.entries(r.cost)) if ((p.inv[k] || 0) < n) return false;
    if (r.near) {
      let ok = false;
      for (const s of this.structs.values()) if (s.k === r.near && Math.hypot(s.x - p.x, s.y - p.y) <= STRUCTS[r.near].radius) ok = true;
      if (!ok) return false;
    }
    return true;
  }

  /** Постройка перед игроком. */
  place(p, id) {
    const r = RECIPES.find((x) => x.id === id && x.kind === 'struct');
    if (!r || !this.canCraft(p, r)) return this.logTo(p.id, 'warn', 'nocraft', {}, 'Не хватает ресурсов или нет нужной постройки рядом');
    const f = this.front(p, 1.2);
    const t = this.world.typeAt(f.x, f.y);
    if (!this.world.isWalkable(f.x, f.y) || t === T.LAVA || t === T.SHALLOW) return this.logTo(p.id, 'warn', 'far', {}, 'Сюда построить нельзя');
    let own = 0;
    for (const s of this.structs.values()) {
      if (Math.hypot(s.x - f.x, s.y - f.y) < 0.9) return this.logTo(p.id, 'warn', 'far', {}, 'Слишком тесно');
      if (s.o === p.id) own++;
    }
    if (own >= 14) return this.logTo(p.id, 'warn', 'far', {}, 'Слишком много построек');
    for (const [k, n] of Object.entries(r.cost)) this.takeItem(p, k, n);
    const def = STRUCTS[r.id];
    const s = { id: this.nextId++, k: r.id, x: r2(f.x), y: r2(f.y), o: p.id, hp: def.hp, mh: def.hp };
    this.structs.set(s.id, s);
    this.structEv.add.push(s);
    this.fx({ k: 'craft', x: s.x, y: s.y });
    this.logTo(p.id, 'good', 'built', { item: def.name }, `Построено: ${def.name}`);
  }

  /** Использовать предмет (еда, питьё, лечение). */
  useItem(p, item) {
    const it = ITEMS[item];
    if (!it || (p.inv[item] || 0) < 1) return this.logTo(p.id, 'warn', 'noitem', {}, 'Нет такого предмета');
    if (!(it.eat || it.drink || it.heal || it.sanity)) return;
    this.takeItem(p, item, 1);
    if (it.eat) {
      this.addStat(p, 'hunger', it.eat.hunger || 0); this.addStat(p, 'sanity', it.eat.sanity || 0); this.heal(p, it.eat.hp || 0);
      this.logTo(p.id, 'info', 'eat', { item: it.name }, `Вы съели: ${it.name}`);
    }
    if (it.drink) { this.addStat(p, 'thirst', it.drink.thirst); this.logTo(p.id, 'info', 'drink', { item: it.name }, `Вы напились: ${it.name}`); }
    if (it.heal) this.heal(p, it.heal);
    if (it.sanity) this.addStat(p, 'sanity', it.sanity);
    if (it.cure) this.cure(p, it.cure);
    this.fx({ k: 'heal', x: p.x, y: p.y });
  }

  /** Снять статусы. @param {string[]|'all'} list */
  cure(p, list) {
    if (list === 'all') { for (const s of ['poisoned', 'infected', 'bleeding', 'burning', 'irradiated', 'frozen']) p.st.delete(s); }
    else for (const s of list) p.st.delete(s);
  }

  /** Передать предмет ближайшему игроку. */
  give(p, item, toId) {
    if (!ITEMS[item] || (p.inv[item] || 0) < 1) return this.logTo(p.id, 'warn', 'noitem', {}, 'Нет такого предмета');
    const o = toId != null ? this.players.get(toId | 0) : this.nearestPlayer(p.x, p.y, 2.5, p.id);
    if (!o || !o.alive || o.id === p.id || Math.hypot(o.x - p.x, o.y - p.y) > 2.8) return this.logTo(p.id, 'warn', 'far', {}, 'Слишком далеко');
    if (!this.addItem(o, item, 1)) return;
    this.takeItem(p, item, 1);
    p.stats.help++;
    const args = { name: p.name, item: ITEMS[item].name, to: o.name };
    this.logTo(p.id, 'good', 'gave', args, `${p.name} отдал ${args.item} игроку ${o.name}`);
    this.logTo(o.id, 'good', 'gave', args, `${p.name} отдал ${args.item} игроку ${o.name}`);
  }

  /** Лечение другого игрока аптечкой/лекарством. */
  healOther(p, toId) {
    const o = toId != null ? this.players.get(toId | 0) : this.nearestPlayer(p.x, p.y, 2.5, p.id);
    if (!o || !o.alive || o.id === p.id || Math.hypot(o.x - p.x, o.y - p.y) > 2.8) return this.logTo(p.id, 'warn', 'far', {}, 'Слишком далеко');
    const item = ['medkit', 'medicine'].find((k) => (p.inv[k] || 0) > 0);
    if (!item) return this.logTo(p.id, 'warn', 'noitem', {}, 'Нет такого предмета');
    this.takeItem(p, item, 1);
    this.heal(o, ITEMS[item].heal); this.cure(o, ITEMS[item].cure);
    p.stats.help++;
    this.fx({ k: 'heal', x: o.x, y: o.y });
    this.logTo(o.id, 'good', 'healed', { name: o.name }, `❤️ ${o.name} исцелён`);
    this.logTo(p.id, 'good', 'helped', { name: p.name, to: o.name }, `${p.name} помог игроку ${o.name}`);
  }

  /* ───────────── Сетевые сообщения ───────────── */

  /**
   * Сообщение init для игрока (начало игры или возврат).
   * @param {number} id id игрока
   * @returns {Object}
   */
  buildInit(id) {
    const w = this.world;
    return {
      t: 'init', seed: this.seed, size: SIZE, tiles: Array.from(w.tiles), flags: Array.from(w.flags),
      youId: id, structs: [...this.structs.values()], cats: this.cata.snapshotForInit(),
      time: Math.round(this.time), settings: this.settings,
    };
  }

  /** Формирует и рассылает снапшоты всем подключённым игрокам. */
  sendSnapshots() {
    const pl = [];
    for (const p of this.players.values()) {
      pl.push({ id: p.id, x: r2(p.x), y: r2(p.y), hp: Math.round(p.hp), d: r2(p.dir), al: p.alive, sp: p.sprinting, s: [...p.st.keys()] });
    }
    const mobs = [];
    for (const m of this.mobs.values()) mobs.push({ id: m.id, k: m.k, x: r2(m.x), y: r2(m.y), hp: Math.round(m.hp), mh: m.mh });
    const loot = [];
    for (const l of this.loot.values()) loot.push({ id: l.id, x: r2(l.x), y: r2(l.y), i: l.i, n: l.n });
    const shared = `"tick":${this.tickN},"tm":${Math.round(this.time * 10) / 10},"nx":${this.ended ? -1 : this.director.nextIn()},` +
      `"p":${JSON.stringify(pl)},"m":${JSON.stringify(mobs)},"l":${JSON.stringify(loot)},"fx":${JSON.stringify(this.fxBuf)}`;
    this.fxBuf = [];
    for (const p of this.players.values()) {
      const me = {
        x: r2(p.x), y: r2(p.y), hp: r2(p.hp), hunger: r2(p.hunger), thirst: r2(p.thirst), temp: r2(p.temp),
        stamina: r2(p.stamina), sanity: r2(p.sanity), inv: p.inv,
        statuses: [...p.st].map(([s, t]) => ({ s, t: Math.ceil(t) })), prot: [...p.prot],
        alive: p.alive, sm: p.sm, invert: p.env.invert, raft: p.raft, near: p.near,
        res: p.stats.res, surv: p.stats.surv, help: p.stats.help,
      };
      this.send(p.id, `{"t":"snap","ack":${p.ack},"me":${JSON.stringify(me)},${shared}}`);
    }
  }
}
