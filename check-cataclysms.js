/**
 * check-cataclysms.js — проверка каталога катаклизмов (npm run check:cataclysms).
 *
 * Что делает этот файл:
 *  - считает общее количество катаклизмов и завершает процесс с ошибкой, если их < 1000;
 *  - проверяет уникальность id и названий;
 *  - проверяет наличие описания и всех обязательных полей;
 *  - печатает статистику по категориям и серьёзности.
 */
import { getCatalog } from './catalog.js';
import { ARCHETYPES } from './archetypes.js';
import { CATS } from './shared.js';

const MIN_TOTAL = 1000;
const MIN_ARCH = 120;
const REQUIRED = ['id', 'name', 'description', 'tags', 'counterTags', 'severity', 'warningTime', 'duration',
  'cooldown', 'zone', 'effects', 'visuals', 'sound', 'weight', 'minPlayers', 'canCombineWith'];

const catalog = getCatalog();
const errors = [];

// 1) количество
if (catalog.length < MIN_TOTAL) errors.push(`Катаклизмов ${catalog.length} < ${MIN_TOTAL}`);
if (ARCHETYPES.length < MIN_ARCH) errors.push(`Архетипов ${ARCHETYPES.length} < ${MIN_ARCH}`);

// 2) уникальность и обязательные поля
const ids = new Set(), names = new Set();
for (const c of catalog) {
  if (ids.has(c.id)) errors.push(`Повтор id: ${c.id}`);
  ids.add(c.id);
  if (names.has(c.name)) errors.push(`Повтор названия: ${c.name}`);
  names.add(c.name);
  for (const f of REQUIRED) if (c[f] === undefined || c[f] === null) errors.push(`${c.id}: нет поля ${f}`);
  if (!c.description || c.description.length < 10) errors.push(`${c.id}: пустое описание`);
  if (!(c.severity >= 1 && c.severity <= 10)) errors.push(`${c.id}: severity вне 1..10`);
  if (!CATS[c.category]) errors.push(`${c.id}: неизвестная категория ${c.category}`);
}

// 3) статистика
const byCat = {}, bySev = {};
for (const c of catalog) {
  byCat[c.category] = (byCat[c.category] || 0) + 1;
  bySev[c.severity] = (bySev[c.severity] || 0) + 1;
}
console.log(`Всего катаклизмов: ${catalog.length} (архетипов вручную: ${ARCHETYPES.length})`);
console.log(`Уникальных id: ${ids.size}, уникальных названий: ${names.size}`);
console.log('\nПо категориям:');
for (const [k, v] of Object.entries(byCat)) console.log(`  ${(CATS[k] ? CATS[k].name : k).padEnd(16)} ${v}`);
console.log('\nПо серьёзности:');
for (let s = 1; s <= 10; s++) console.log(`  ${String(s).padStart(2)}  ${'█'.repeat(Math.round((bySev[s] || 0) / 10))} ${bySev[s] || 0}`);
console.log('\nПримеры:');
for (let i = 0; i < 6; i++) console.log('  •', catalog[Math.floor(Math.random() * catalog.length)].name);

if (errors.length) {
  console.error(`\nОШИБКИ (${errors.length}):`);
  errors.slice(0, 30).forEach((e) => console.error('  ✗', e));
  process.exit(1);
}
console.log(`\n✓ Каталог в порядке: ${catalog.length} ≥ ${MIN_TOTAL}`);
