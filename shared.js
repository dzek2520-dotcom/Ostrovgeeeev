/**
 * shared.js — общий модуль клиента и сервера.
 *
 * Что делает этот файл:
 *  - хранит константы мира (размер карты, скорости, частота тиков);
 *  - описывает типы тайлов, флаги состояния тайлов, предметы, рецепты крафта,
 *    постройки, статусы, мобов и категории катаклизмов;
 *  - содержит общую функцию движения `moveStep`, которую используют И сервер
 *    (авторитетная симуляция), И клиент (предсказание движения). Благодаря
 *    единому коду расхождения между клиентом и сервером минимальны.
 *
 * Файл — ES-модуль без зависимостей от DOM/Node, поэтому безопасно
 * импортируется из обеих сред.
 */

/** Версия протокола/игры. */
export const VERSION = '1.0.0';
/** Размер острова в тайлах (квадрат SIZE x SIZE). */
export const SIZE = 64;
/** Частота серверного тика, Гц. */
export const TICK_RATE = 20;
/** Максимум игроков в комнате. */
export const MAX_PLAYERS = 12;
/** Базовая скорость ходьбы, тайлов/сек. */
export const BASE_SPEED = 3.3;
/** Множитель скорости при спринте. */
export const SPRINT_MULT = 1.55;
/** Радиус коллизии игрока (в тайлах). */
export const PLAYER_RADIUS = 0.28;
/** Дистанция «перед игроком», на которой он взаимодействует/строит (тайлов). */
export const FACING_DIST = 1.0;
/** Размер тайла в пикселях при отрисовке. */
export const TILE_PX = 32;

/** Идентификаторы типов тайлов. */
export const T = {
  OCEAN: 0, SHALLOW: 1, SAND: 2, GRASS: 3, FOREST: 4, ROCK: 5, LAKE: 6, SWAMP: 7,
  VOLCANO: 8, LAVA: 9, CAVE: 10, ASH: 11, ICE: 12, CRACK: 13, MUD: 14, CRATER: 15,
};

/**
 * Описание тайлов (индекс массива = id типа).
 * speed — множитель скорости; color — базовый цвет для отрисовки/миникарты.
 */
export const TILE_INFO = [
  { key: 'OCEAN',   name: 'Океан',    color: '#0b3d6b', speed: 0.55 },
  { key: 'SHALLOW', name: 'Мелководье', color: '#2a7fb5', speed: 0.75 },
  { key: 'SAND',    name: 'Пляж',     color: '#e3cf8f', speed: 0.92 },
  { key: 'GRASS',   name: 'Трава',    color: '#5fa046', speed: 1.0 },
  { key: 'FOREST',  name: 'Лес',      color: '#2f6b2f', speed: 0.8 },
  { key: 'ROCK',    name: 'Скалы',    color: '#8a8a8a', speed: 0.75 },
  { key: 'LAKE',    name: 'Озеро',    color: '#3b9ad9', speed: 0.65 },
  { key: 'SWAMP',   name: 'Болото',   color: '#4f6b3a', speed: 0.55 },
  { key: 'VOLCANO', name: 'Вулкан',   color: '#5a4038', speed: 0.7 },
  { key: 'LAVA',    name: 'Лава',     color: '#ff5a14', speed: 0.8 },
  { key: 'CAVE',    name: 'Пещера',   color: '#3b3b46', speed: 1.0 },
  { key: 'ASH',     name: 'Пепел',    color: '#55504d', speed: 0.95 },
  { key: 'ICE',     name: 'Лёд',      color: '#bfe8f5', speed: 1.15 },
  { key: 'CRACK',   name: 'Трещина',  color: '#120c0c', speed: 0 },
  { key: 'MUD',     name: 'Грязь',    color: '#6b5236', speed: 0.5 },
  { key: 'CRATER',  name: 'Воронка',  color: '#7a6a5a', speed: 0.9 },
];

/** Битовые флаги состояния тайла. */
export const F = { WET: 1, FIRE: 2, FROZEN: 4, FLOOD: 8, TOXIC: 16, RAD: 32, SPORE: 64 };

/**
 * Предметы. Поля поведения:
 *  eat {hunger,hp,sanity,thirst} — съедобно; drink {thirst}; heal — лечение hp;
 *  cure — список статусов (или 'all'), которые снимаются; sanity — +рассудок;
 *  gear — защитные теги, действующие пока предмет в инвентаре; dmg — урон оружия.
 */
export const ITEMS = {
  wood:     { name: 'Дерево',     icon: '🪵' },
  stone:    { name: 'Камень',     icon: '🪨' },
  food:     { name: 'Еда',        icon: '🍖', eat: { hunger: 20 } },
  water:    { name: 'Вода',       icon: '💧', drink: { thirst: 35 } },
  metal:    { name: 'Металл',     icon: '⚙️' },
  cloth:    { name: 'Ткань',      icon: '🧵' },
  fuel:     { name: 'Топливо',    icon: '⛽' },
  medicine: { name: 'Лекарство',  icon: '🌿', heal: 25, cure: ['poisoned', 'infected'] },
  artifact: { name: 'Артефакт',   icon: '🔮', heal: 20, sanity: 50, gear: ['magic', 'curse', 'gravity'] },
  cooked:   { name: 'Жаркое',     icon: '🍗', eat: { hunger: 45, hp: 5 } },
  fish:     { name: 'Рыба',       icon: '🐟', eat: { hunger: 25 } },
  jelly:    { name: 'Желе',       icon: '🍮', eat: { hunger: 12, sanity: 10 } },
  medkit:   { name: 'Аптечка',    icon: '🩹', heal: 60, cure: 'all' },
  jacket:   { name: 'Куртка',     icon: '🧥', gear: ['cold', 'wind', 'rain'] },
  spear:    { name: 'Копьё',      icon: '🔱', dmg: 24 },
  armor:    { name: 'Броня',      icon: '🛡️', gear: ['impact', 'hail', 'blade', 'bite'] },
  gasmask:  { name: 'Противогаз', icon: '😷', gear: ['toxic', 'smoke', 'spores', 'ash', 'gas', 'disease'] },
  raft:     { name: 'Плот',       icon: '🛶', gear: ['flood', 'water'] },
};

/** Постройки: цена, прочность, радиус действия и защитные теги. */
export const STRUCTS = {
  shelter:  { name: 'Укрытие',        icon: '⛺', hp: 60,  radius: 1.5, prot: ['rain', 'hail', 'wind', 'sun', 'heat', 'cold', 'ash', 'impact', 'dark'] },
  campfire: { name: 'Костёр',         icon: '🔥', hp: 25,  radius: 3.2, prot: ['cold', 'fear', 'dark', 'fog'] },
  bunker:   { name: 'Бункер',         icon: '🏚️', hp: 220, radius: 1.7, prot: ['impact', 'hail', 'wind', 'rain', 'sun', 'heat', 'cold', 'quake', 'radiation', 'toxic', 'gas', 'smoke', 'spores', 'ash', 'fire', 'explosion', 'disease', 'emp', 'dark', 'fear', 'blade', 'bite', 'lightning'] },
  rod:      { name: 'Громоотвод',     icon: '📡', hp: 40,  radius: 7,   prot: ['lightning'] },
  dam:      { name: 'Дамба',          icon: '🧱', hp: 120, radius: 3.5, prot: ['flood', 'water'] },
  filter:   { name: 'Фильтр воды',    icon: '🚰', hp: 40,  radius: 0,   prot: [] },
};

/**
 * Рецепты: kind 'item' — предмет в инвентарь, 'struct' — постройка перед игроком.
 * near — требуется постройка рядом (например, костёр для готовки).
 */
export const RECIPES = [
  { id: 'cooked',   kind: 'item',   cost: { food: 2, wood: 1 }, near: 'campfire' },
  { id: 'medkit',   kind: 'item',   cost: { medicine: 2, cloth: 1 } },
  { id: 'jacket',   kind: 'item',   cost: { cloth: 3 } },
  { id: 'spear',    kind: 'item',   cost: { wood: 2, stone: 1 } },
  { id: 'armor',    kind: 'item',   cost: { metal: 4, cloth: 2 } },
  { id: 'gasmask',  kind: 'item',   cost: { cloth: 1, metal: 2, fuel: 1 } },
  { id: 'raft',     kind: 'item',   cost: { wood: 6, cloth: 2 } },
  { id: 'campfire', kind: 'struct', cost: { wood: 3, stone: 2 } },
  { id: 'shelter',  kind: 'struct', cost: { wood: 5, cloth: 1 } },
  { id: 'bunker',   kind: 'struct', cost: { stone: 8, metal: 4, wood: 2 } },
  { id: 'rod',      kind: 'struct', cost: { metal: 2, wood: 1 } },
  { id: 'dam',      kind: 'struct', cost: { stone: 4, wood: 2 } },
  { id: 'filter',   kind: 'struct', cost: { metal: 2, stone: 2, cloth: 1 } },
];

/** Статусы игрока (neg — отрицательный). */
export const STATUSES = {
  burning:    { name: 'Горение',     icon: '🔥', neg: true },
  poisoned:   { name: 'Отравление',  icon: '☠️', neg: true },
  wet:        { name: 'Промок',      icon: '💧', neg: true },
  frozen:     { name: 'Обморожение', icon: '❄️', neg: true },
  stunned:    { name: 'Оглушён',     icon: '💫', neg: true },
  slowed:     { name: 'Замедлен',    icon: '🐌', neg: true },
  blind:      { name: 'Ослеплён',    icon: '🕶️', neg: true },
  confused:   { name: 'Дезориентация', icon: '🔀', neg: true },
  floaty:     { name: 'Невесомость', icon: '☁️', neg: false },
  heavy:      { name: 'Тяжесть',     icon: '⚓', neg: true },
  irradiated: { name: 'Радиация',    icon: '☢️', neg: true },
  bleeding:   { name: 'Кровотечение', icon: '🩸', neg: true },
  infected:   { name: 'Инфекция',    icon: '🦠', neg: true },
  hunted:     { name: 'Под прицелом', icon: '🎯', neg: true },
  glowing:    { name: 'Сияние',      icon: '✨', neg: false },
};

/** Мобы (существа). hp, dmg (урон за удар), speed (тайлов/сек). */
export const MOBS = {
  crab:   { name: 'Краб',        icon: '🦀', hp: 18,  dmg: 5,  speed: 1.7, size: 0.35 },
  gull:   { name: 'Чайка',       icon: '🐦', hp: 10,  dmg: 3,  speed: 3.6, size: 0.3, thief: true },
  mutant: { name: 'Мутант',      icon: '👹', hp: 70,  dmg: 14, speed: 2.3, size: 0.5 },
  zombie: { name: 'Зомби',       icon: '🧟', hp: 45,  dmg: 10, speed: 1.5, size: 0.45 },
  wolf:   { name: 'Волк',        icon: '🐺', hp: 32,  dmg: 12, speed: 3.1, size: 0.4 },
  pirate: { name: 'Пират',       icon: '🏴‍☠️', hp: 55, dmg: 11, speed: 2.3, size: 0.45, thief: true },
  swarm:  { name: 'Рой',         icon: '🐝', hp: 4,   dmg: 1.5, speed: 3.0, size: 0.25 },
  jelly:  { name: 'Медуза',      icon: '🪼', hp: 22,  dmg: 4,  speed: 1.0, size: 0.35 },
  spirit: { name: 'Призрак',     icon: '👻', hp: 28,  dmg: 3,  speed: 1.9, size: 0.4, sanityDmg: 6 },
  golem:  { name: 'Голем',       icon: '🗿', hp: 130, dmg: 24, speed: 1.2, size: 0.6 },
};

/** Категории катаклизмов для интерфейса. */
export const CATS = {
  nature: { name: 'Природный',     icon: '🌋', color: '#ff7a3d' },
  bio:    { name: 'Биологический', icon: '🦠', color: '#7bd957' },
  cosmic: { name: 'Космический',   icon: '☄️', color: '#9b7bff' },
  magic:  { name: 'Абсурдный',     icon: '🔮', color: '#ff6bd6' },
  tech:   { name: 'Техногенный',   icon: '☢️', color: '#e8d84a' },
  social: { name: 'Социальный',    icon: '🏴‍☠️', color: '#5ac8e6' },
};

/** Быстрые эмоции. */
export const EMOTES = ['👍', '😂', '😱', '🆘', '❤️', '🔥', '🎉', '💀'];

/**
 * Индекс тайла по вещественным координатам (с обрезкой по границам).
 * @param {number} x координата в тайлах
 * @param {number} y координата в тайлах
 * @returns {number} индекс в массивах tiles/flags
 */
export function tileIndex(x, y) {
  let ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0) ix = 0; else if (ix >= SIZE) ix = SIZE - 1;
  if (iy < 0) iy = 0; else if (iy >= SIZE) iy = SIZE - 1;
  return iy * SIZE + ix;
}

/**
 * Множитель скорости на тайле с учётом флагов состояния.
 * @param {number} type тип тайла
 * @param {number} flags битовые флаги
 * @returns {number} множитель
 */
export function tileSpeedAt(type, flags) {
  let s = TILE_INFO[type].speed;
  if (flags & F.FLOOD) s *= 0.6;
  return s;
}

/**
 * Блокирует ли тайл движение.
 * Трещины — всегда; океан — если нет плота и игрок не в океане уже.
 * @param {number} type тип тайла
 * @param {boolean} hasRaft есть ли плот
 * @param {boolean} fromOcean стоит ли игрок уже в океане
 * @returns {boolean}
 */
export function isBlockedTile(type, hasRaft, fromOcean) {
  if (type === T.CRACK) return true;
  if (type === T.OCEAN && !hasRaft && !fromOcean) return true;
  return false;
}

/**
 * Проверка столкновения круга радиуса PLAYER_RADIUS в точке (x,y).
 * Проверяются 4 угла описанного квадрата.
 */
function blockedAt(tiles, x, y, hasRaft, fromOcean) {
  const r = PLAYER_RADIUS;
  if (x < r || y < r || x > SIZE - r || y > SIZE - r) return true;
  return (
    isBlockedTile(tiles[tileIndex(x - r, y - r)], hasRaft, fromOcean) ||
    isBlockedTile(tiles[tileIndex(x + r, y - r)], hasRaft, fromOcean) ||
    isBlockedTile(tiles[tileIndex(x - r, y + r)], hasRaft, fromOcean) ||
    isBlockedTile(tiles[tileIndex(x + r, y + r)], hasRaft, fromOcean)
  );
}

/**
 * Общий шаг движения (сервер + клиентское предсказание).
 * Изменяет p.x, p.y, p.dir на месте.
 * @param {Uint8Array|number[]} tiles типы тайлов
 * @param {Uint8Array|number[]} flags флаги тайлов
 * @param {{x:number,y:number,dir:number}} p движимый объект
 * @param {number} ax ось X [-1..1]
 * @param {number} ay ось Y [-1..1]
 * @param {boolean} sprint спринт
 * @param {number} dt шаг времени, сек
 * @param {number} sm общий множитель скорости (статусы/правила)
 * @param {boolean} hasRaft есть ли плот
 */
export function moveStep(tiles, flags, p, ax, ay, sprint, dt, sm, hasRaft) {
  const len = Math.hypot(ax, ay);
  if (len < 0.01) return;
  if (len > 1) { ax /= len; ay /= len; }
  const ci = tileIndex(p.x, p.y);
  const here = tiles[ci];
  const spd = BASE_SPEED * (sprint ? SPRINT_MULT : 1) * sm * tileSpeedAt(here, flags[ci]);
  const fromOcean = here === T.OCEAN;
  const nx = p.x + ax * spd * dt;
  if (!blockedAt(tiles, nx, p.y, hasRaft, fromOcean)) p.x = nx;
  const ny = p.y + ay * spd * dt;
  if (!blockedAt(tiles, p.x, ny, hasRaft, fromOcean)) p.y = ny;
  p.dir = Math.atan2(ay, ax);
}
