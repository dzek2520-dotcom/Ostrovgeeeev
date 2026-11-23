/**
 * index.js (cataclysms) — публичный API каталога катаклизмов.
 *
 * Что делает этот файл:
 *  - лениво генерирует каталог (один раз за процесс) и кэширует его;
 *  - даёт быстрый поиск записи по id.
 */
import { generateCatalog } from './generator.js';

/** @type {Object[]|null} кэш каталога */
let catalog = null;
/** @type {Map<string,Object>|null} индекс по id */
let byId = null;

/**
 * Возвращает весь каталог катаклизмов (генерируется при первом вызове).
 * @returns {Object[]}
 */
export function getCatalog() {
  if (!catalog) {
    catalog = generateCatalog();
    byId = new Map(catalog.map((c) => [c.id, c]));
  }
  return catalog;
}

/**
 * Возвращает запись по id.
 * @param {string} id идентификатор катаклизма
 * @returns {Object|undefined}
 */
export function getCataclysm(id) {
  getCatalog();
  return byId.get(id);
}
