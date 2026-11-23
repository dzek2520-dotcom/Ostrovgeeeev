/**
 * zones.js — превращение «дескрипторов зон» каталога в конкретные фигуры на карте.
 *
 * Что делает этот файл:
 *  - resolveZone(desc, world, rng): из описания (modifiers.js → ZONES) строит реальную зону:
 *      island | coast {d} | circle {x,y,r} | rect {x0,y0,x1,y1} | line {x0,y0,x1,y1,w};
 *  - inZone(zone, world, x, y): проверка, попадает ли точка в зону;
 *  - randomPointInZone(zone, world, rng): случайная точка зоны (на суше, если можно);
 *  - zoneCenter(zone): центр зоны (для притяжения/водоворота).
 */
import { SIZE } from './shared.js';
import { isWaterType } from './world.js';

/**
 * Конкретизирует зону по карте.
 * @param {Object} desc дескриптор из каталога (поле zone записи)
 * @param {import('./world.js').World} world мир
 * @param {() => number} rng генератор случайных чисел
 * @returns {Object} конкретная зона
 */
export function resolveZone(desc, world, rng) {
  switch (desc.t) {
    case 'island': return { t: 'island' };
    case 'coast': return { t: 'coast', d: desc.d };
    case 'rect': {
      const [a, b, c, d] = desc.f;
      return { t: 'rect', x0: a * SIZE, y0: b * SIZE, x1: c * SIZE, y1: d * SIZE };
    }
    case 'circle': {
      let c;
      if (desc.anchor === 'random') c = world.randomLand(rng);
      else c = world.anchors[desc.anchor] || world.anchors.center;
      return { t: 'circle', x: c.x, y: c.y, r: desc.r };
    }
    case 'line': {
      const off = 16 + rng() * (SIZE - 32);
      if (desc.dir === 'h') return { t: 'line', x0: 0, y0: off, x1: SIZE, y1: SIZE - off, w: desc.w };
      if (desc.dir === 'v') return { t: 'line', x0: off, y0: 0, x1: SIZE - off, y1: SIZE, w: desc.w };
      return rng() < 0.5
        ? { t: 'line', x0: 0, y0: 0, x1: SIZE, y1: SIZE, w: desc.w }
        : { t: 'line', x0: SIZE, y0: 0, x1: 0, y1: SIZE, w: desc.w };
    }
    default: return { t: 'island' };
  }
}

/**
 * Расстояние от точки до отрезка.
 */
function distToSegment(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/**
 * Попадает ли точка в зону.
 * @param {Object} z зона
 * @param {import('./world.js').World} world мир
 * @param {number} x координата X (тайлы)
 * @param {number} y координата Y (тайлы)
 * @returns {boolean}
 */
export function inZone(z, world, x, y) {
  switch (z.t) {
    case 'island': return true;
    case 'coast': {
      const ix = Math.max(0, Math.min(SIZE - 1, Math.floor(x))), iy = Math.max(0, Math.min(SIZE - 1, Math.floor(y)));
      return world.coastDist[iy * SIZE + ix] <= z.d && world.base[iy * SIZE + ix] !== 0;
    }
    case 'circle': return (x - z.x) * (x - z.x) + (y - z.y) * (y - z.y) <= z.r * z.r;
    case 'rect': return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
    case 'line': return distToSegment(x, y, z.x0, z.y0, z.x1, z.y1) <= z.w / 2;
    default: return false;
  }
}

/**
 * Случайная точка внутри зоны (предпочтительно суша).
 * @param {Object} z зона
 * @param {import('./world.js').World} world мир
 * @param {() => number} rng ГСЧ
 * @param {boolean} [landOnly=true] требовать сушу
 * @returns {{x:number,y:number}}
 */
export function randomPointInZone(z, world, rng, landOnly = true) {
  for (let k = 0; k < 40; k++) {
    const x = 1 + rng() * (SIZE - 2), y = 1 + rng() * (SIZE - 2);
    if (!inZone(z, world, x, y)) continue;
    if (landOnly && isWaterType(world.typeAt(x, y)) && world.typeAt(x, y) !== 1) continue;
    return { x, y };
  }
  return world.randomLand(rng);
}

/**
 * Центр зоны.
 * @param {Object} z зона
 * @returns {{x:number,y:number}}
 */
export function zoneCenter(z) {
  switch (z.t) {
    case 'circle': return { x: z.x, y: z.y };
    case 'rect': return { x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2 };
    case 'line': return { x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2 };
    default: return { x: SIZE / 2, y: SIZE / 2 };
  }
}
