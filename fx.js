/**
 * fx.js — конструкторы «эффектов» катаклизмов.
 *
 * Что делает этот файл:
 *  Каждый катаклизм — это набор эффектов (effects[]). Эффект — простой объект
 *  с полем `fx` (тип) и параметрами. Исполняет эффекты effects.js.
 *  Здесь собраны короткие функции-конструкторы, чтобы каталог читался как таблица.
 *
 *  Типы эффектов (поле fx):
 *   dmg        — урон игрокам в зоне, dps = урон/сек, tag = тип угрозы
 *   status     — наложить статус (s) на dur сек с шансом p в секунду
 *   drain      — менять показатель (stat: hunger/thirst/temp/sanity/stamina) на v в секунду
 *   tiles      — менять тайлы в зоне (op), rate = тайлов/сек
 *   spawn      — создавать мобов (mob) по n штук каждые every сек
 *   loot       — сыпать предметы (item) по n штук каждые every сек
 *   physics    — sm (множитель скорости), invert (инверсия ввода), push [dx,dy] (снос ветром),
 *                pull (притяжение к центру зоны), float (парение)
 *   strike     — точечные удары: kind (boom/bolt/meteor/splash/hail), every, r (радиус), dmg
 *   structdmg  — урон постройкам в зоне, dps
 *   steal      — кража предмета у случайного игрока каждые every сек
 *   tele       — телепорт случайного игрока каждые every сек
 *   swap       — обмен местами двух игроков каждые every сек
 *   heal       — лечение игроков в зоне, hps = hp/сек (полезный эффект)
 *   hunt       — «охота»: помечает игрока статусом hunted и натравливает мобов
 */

/** Урон по игрокам. @param {number} dps урон/сек @param {string} tag тип угрозы */
export const dmg = (dps, tag) => ({ fx: 'dmg', dps, tag });
/** Статус. @param {string} s статус @param {number} dur сек @param {number} [p=0.5] шанс/сек */
export const st = (s, dur, p = 0.5) => ({ fx: 'status', s, dur, p });
/** Изменение показателя. @param {string} stat показатель @param {number} v изменение/сек */
export const dr = (stat, v) => ({ fx: 'drain', stat, v });
/** Изменение тайлов. @param {string} op операция @param {number} rate тайлов/сек */
export const tl = (op, rate) => ({ fx: 'tiles', op, rate });
/** Спавн мобов. @param {string} mob вид @param {number} n штук @param {number} every период, сек */
export const sp = (mob, n, every) => ({ fx: 'spawn', mob, n, every });
/** Дождь из предметов. @param {string} item предмет @param {number} n штук @param {number} every период */
export const lt = (item, n, every) => ({ fx: 'loot', item, n, every, good: true });
/** Физика (sm, invert, push, pull, float). @param {Object} o параметры */
export const ph = (o) => ({ fx: 'physics', ...o });
/** Точечные удары. @param {string} kind тип @param {number} every период @param {number} r радиус @param {number} d урон */
export const strike = (kind, every, r, d) => ({ fx: 'strike', kind, every, r, dmg: d });
/** Урон постройкам. @param {number} dps урон/сек */
export const sd = (dps) => ({ fx: 'structdmg', dps });
/** Кража. @param {number} every период, сек */
export const steal = (every) => ({ fx: 'steal', every });
/** Случайный телепорт. @param {number} every период, сек */
export const tele = (every) => ({ fx: 'tele', every });
/** Обмен местами. @param {number} every период, сек */
export const swap = (every) => ({ fx: 'swap', every });
/** Лечение. @param {number} hps hp/сек */
export const heal = (hps) => ({ fx: 'heal', hps, good: true });
/** Охота на игрока. @param {number} every период, сек */
export const hunt = (every) => ({ fx: 'hunt', every });

/**
 * Визуальные параметры катаклизма.
 * @param {string} c цвет оверлея
 * @param {number} a прозрачность оверлея 0..0.5
 * @param {number} sh сила тряски камеры 0..10
 * @param {string} p тип частиц
 * @param {number} [d=0] затемнение 0..1
 * @returns {{c:string,a:number,sh:number,p:string,d:number}}
 */
export const vis = (c, a, sh, p, d = 0) => ({ c, a, sh, p, d });
