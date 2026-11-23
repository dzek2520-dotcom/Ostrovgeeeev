/**
 * validate.js — валидация и санитизация данных, пришедших от клиента.
 *
 * Что делает этот файл:
 *  - очищает ники, цвета и текст чата от мусора и HTML;
 *  - ограничивает числа (clamp), проверяет конечность чисел;
 *  - защищает сервер от явно некорректного ввода (первая линия против читерства).
 */

/**
 * Ограничивает число диапазоном.
 * @param {number} v значение
 * @param {number} a минимум
 * @param {number} b максимум
 * @returns {number}
 */
export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/**
 * Преобразует значение в конечное число, иначе возвращает запасное.
 * @param {*} v значение
 * @param {number} [def=0] запасное значение
 * @returns {number}
 */
export function num(v, def = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
}

/**
 * Очищает ник: убирает управляющие символы и угловые скобки, обрезает до 16 символов.
 * @param {*} s исходное значение
 * @returns {string} ник (пустая строка, если не годится)
 */
export function sanitizeName(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f<>&"'`]/g, '').trim().slice(0, 16);
}

/**
 * Проверяет цвет формата #rrggbb.
 * @param {*} s исходное значение
 * @returns {string} валидный цвет или цвет по умолчанию
 */
export function sanitizeColor(s) {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : '#ffcc33';
}

/**
 * Очищает текст чата (до 140 символов, без управляющих символов и скобок).
 * @param {*} s исходное значение
 * @returns {string}
 */
export function sanitizeChat(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 140);
}

/**
 * Нормализует код комнаты (верхний регистр, 4 символа).
 * @param {*} s исходное значение
 * @returns {string} код или пустая строка
 */
export function sanitizeCode(s) {
  if (typeof s !== 'string') return '';
  const c = s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  return c.length === 4 ? c : '';
}
