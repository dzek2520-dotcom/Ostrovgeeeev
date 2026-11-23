/**
 * rng.js — детерминированный генератор псевдослучайных чисел и хелперы.
 *
 * Что делает этот файл:
 *  - mulberry32(seed) — быстрый ГСЧ с воспроизводимой последовательностью
 *    (одинаковый seed => одинаковая карта и одинаковый каталог катаклизмов);
 *  - hashString(str) — превращает строку (например, код комнаты) в числовой seed;
 *  - набор функций для выбора случайных элементов с использованием ГСЧ.
 */

/**
 * Создаёт ГСЧ mulberry32.
 * @param {number} seed начальное значение (целое)
 * @returns {() => number} функция, возвращающая число в диапазоне [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Хеш строки (FNV-1a, 32 бита).
 * @param {string} str входная строка
 * @returns {number} беззнаковое 32-битное число
 */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Случайное целое в диапазоне [a, b] включительно.
 * @param {() => number} rng генератор
 * @param {number} a минимум
 * @param {number} b максимум
 * @returns {number}
 */
export function randInt(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}

/**
 * Случайное вещественное число в диапазоне [a, b).
 * @param {() => number} rng генератор
 * @param {number} a минимум
 * @param {number} b максимум
 * @returns {number}
 */
export function randRange(rng, a, b) {
  return a + rng() * (b - a);
}

/**
 * Случайный элемент массива.
 * @template T
 * @param {() => number} rng генератор
 * @param {T[]} arr массив (непустой)
 * @returns {T}
 */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Выбор элемента по весам.
 * @template T
 * @param {() => number} rng генератор
 * @param {T[]} items элементы
 * @param {(item: T) => number} weightFn функция веса (>= 0)
 * @returns {T|null} выбранный элемент или null, если все веса нулевые
 */
export function weightedPick(rng, items, weightFn) {
  let total = 0;
  const ws = items.map((it) => { const w = Math.max(0, weightFn(it)); total += w; return w; });
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Перемешивание массива (Фишер—Йетс), возвращает копию.
 * @template T
 * @param {() => number} rng генератор
 * @param {T[]} arr исходный массив
 * @returns {T[]}
 */
export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
