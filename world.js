/**
 * world.js — процедурная генерация острова и операции над тайлами.
 *
 * Что делает этот файл:
 *  - generateWorld(seed): строит остров SIZE×SIZE по seed (одинаковый seed => одинаковая карта):
 *    океан, мелководье, пляж, трава, лес, скалы, озеро, болото, вулкан с лавой, пещеры;
 *  - класс World хранит текущие типы тайлов и флаги состояния (огонь, потоп, лёд …),
 *    «базовую» карту (для возврата временных изменений), таймеры жизни флагов;
 *  - applyOp(op, x, y) — изменение тайла катаклизмом (flood, burn, freeze, lava, crack …);
 *  - update(t, dt) — затухание временных состояний, распространение огня;
 *  - drainChanges() — список изменений для рассылки клиентам.
 */
import { SIZE, T, F } from './shared.js';
import { mulberry32 } from './rng.js';

/** Целочисленный хеш 2D-координат + seed (для value-noise). */
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Гладкий value-noise.
 * @param {number} x координата
 * @param {number} y координата
 * @param {number} seed зерно
 * @returns {number} 0..1
 */
function vnoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Фрактальный шум из 3 октав. */
function fbm(x, y, seed) {
  return vnoise(x, y, seed) * 0.55 + vnoise(x * 2.1, y * 2.1, seed + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, seed + 13) * 0.15;
}

/** Время жизни временных флагов (секунды). */
const FLAG_TTL = { [F.FIRE]: 14, [F.FLOOD]: 28, [F.WET]: 25, [F.FROZEN]: 35, [F.TOXIC]: 45, [F.RAD]: 90, [F.SPORE]: 40 };

/** Тип тайла — вода (для проверок). */
export function isWaterType(t) {
  return t === T.OCEAN || t === T.SHALLOW || t === T.LAKE;
}

export class World {
  /**
   * @param {number} seed зерно карты
   */
  constructor(seed) {
    this.seed = seed >>> 0;
    this.tiles = new Uint8Array(SIZE * SIZE);
    this.flags = new Uint8Array(SIZE * SIZE);
    this.base = new Uint8Array(SIZE * SIZE);        // исходные типы тайлов
    this.expire = new Float32Array(SIZE * SIZE);     // когда сбросятся флаги (игровое время)
    this.revertAt = new Float32Array(SIZE * SIZE);   // когда тайл вернётся к base (0 — никогда)
    this.coastDist = new Uint8Array(SIZE * SIZE);    // расстояние до воды для суши
    this.anchors = { center: { x: SIZE / 2, y: SIZE / 2 }, volcano: null, lake: null, swamp: null };
    this.dirty = new Set();                          // изменённые индексы
    this.sunk = 0;                                   // сколько тайлов суши затоплено навсегда
    this.landCount = 0;
    this.time = 0;
    this.rng = mulberry32(this.seed ^ 0x5eed);
    this.generate();
  }

  /** Генерирует остров. */
  generate() {
    const seed = this.seed;
    const rng = mulberry32(seed);
    const cx = SIZE / 2, cy = SIZE / 2, R = SIZE * 0.43;
    const tiles = this.tiles;
    const elev = new Float32Array(SIZE * SIZE);
    // 1) высота = «чаша» от центра + шум
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
        const e = 1 - d * d * 0.95 + (fbm(x / 9, y / 9, seed) - 0.5) * 0.7;
        elev[y * SIZE + x] = e;
        let type = T.OCEAN;
        if (e > 0.22) type = T.GRASS;
        else if (e > 0.1) type = T.SAND;
        else if (e > 0.0) type = T.SHALLOW;
        tiles[y * SIZE + x] = type;
      }
    }
    // 2) пляж по краю суши, лес/скалы по шуму
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        if (tiles[i] !== T.GRASS) continue;
        const e = elev[i];
        const n1 = fbm(x / 6 + 50, y / 6 + 50, seed + 3);
        const n2 = fbm(x / 5 + 120, y / 5 + 120, seed + 5);
        if (e < 0.3) tiles[i] = T.SAND;
        else if (n2 > 0.63 && e > 0.4) tiles[i] = T.ROCK;
        else if (n1 > 0.52) tiles[i] = T.FOREST;
      }
    }
    // 3) вулкан, озеро, болото в разных секторах
    const a0 = rng() * Math.PI * 2;
    const place = (ang, dist) => ({ x: Math.round(cx + Math.cos(ang) * dist), y: Math.round(cy + Math.sin(ang) * dist) });
    const vp = place(a0, 9 + rng() * 4);
    const lp = place(a0 + 2.1 + rng() * 0.4, 8 + rng() * 5);
    const sp = place(a0 + 4.2 + rng() * 0.4, 9 + rng() * 5);
    this.anchors.volcano = vp; this.anchors.lake = lp; this.anchors.swamp = sp;
    const blob = (p, r, fn) => {
      for (let y = Math.floor(p.y - r - 1); y <= p.y + r + 1; y++) {
        for (let x = Math.floor(p.x - r - 1); x <= p.x + r + 1; x++) {
          if (x < 1 || y < 1 || x >= SIZE - 1 || y >= SIZE - 1) continue;
          const d = Math.hypot(x - p.x, y - p.y) + (vnoise(x / 2, y / 2, seed + 21) - 0.5) * 1.6;
          if (d <= r) fn(y * SIZE + x, d);
        }
      }
    };
    // вулкан: склон, лава в жерле
    blob(vp, 5, (i, d) => { tiles[i] = d < 1.6 ? T.LAVA : d < 2.6 ? T.VOLCANO : T.VOLCANO; if (d > 3.8 && tiles[i] === T.VOLCANO) tiles[i] = T.ROCK; });
    // озеро и болото (только поверх суши)
    blob(lp, 3.6, (i) => { if (tiles[i] !== T.OCEAN && tiles[i] !== T.SHALLOW) tiles[i] = T.LAKE; });
    blob(sp, 4.6, (i, d) => { if (tiles[i] !== T.OCEAN && tiles[i] !== T.SHALLOW && tiles[i] !== T.LAKE) tiles[i] = d < 3 ? T.SWAMP : T.MUD; });
    // пещеры: 2–3 пятна внутри скал/на склоне
    let caves = 0;
    for (let tries = 0; tries < 400 && caves < 3; tries++) {
      const x = 8 + Math.floor(rng() * (SIZE - 16)), y = 8 + Math.floor(rng() * (SIZE - 16));
      if (tiles[y * SIZE + x] === T.ROCK && Math.hypot(x - vp.x, y - vp.y) > 3) {
        blob({ x, y }, 1.7, (i) => { if (tiles[i] === T.ROCK || tiles[i] === T.GRASS) tiles[i] = T.CAVE; });
        caves++;
      }
    }
    // 4) страховка: центр острова должен быть сушей (чтобы игроки не появились в воде)
    for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) {
      const i = Math.floor(y) * SIZE + Math.floor(x);
      if (isWaterType(tiles[i]) || tiles[i] === T.LAVA) tiles[i] = T.GRASS;
    }
    this.base.set(tiles);
    // 5) расстояние до воды (BFS) и счётчик суши
    this.computeCoastDist();
    for (let i = 0; i < tiles.length; i++) if (!isWaterType(tiles[i])) this.landCount++;
  }

  /** Считает расстояние от каждой клетки суши до ближайшей воды (макс. 60). */
  computeCoastDist() {
    const dist = this.coastDist;
    const q = [];
    dist.fill(255);
    for (let i = 0; i < dist.length; i++) if (isWaterType(this.base[i])) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % SIZE, y = (i / SIZE) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const j = ny * SIZE + nx;
        if (dist[j] === 255) { dist[j] = Math.min(60, dist[i] + 1); q.push(j); }
      }
    }
  }

  /** Тип тайла по координатам (вещественным). */
  typeAt(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= SIZE || iy >= SIZE) return T.OCEAN;
    return this.tiles[iy * SIZE + ix];
  }

  /** Флаги тайла по координатам. */
  flagsAt(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= SIZE || iy >= SIZE) return 0;
    return this.flags[iy * SIZE + ix];
  }

  /** Можно ли стоять на тайле без плота. */
  isWalkable(x, y) {
    const t = this.typeAt(x, y);
    return t !== T.OCEAN && t !== T.CRACK && t !== T.LAVA && t !== T.LAKE;
  }

  /** Случайная проходимая клетка суши (центр тайла). */
  randomLand(rng, filter) {
    for (let k = 0; k < 200; k++) {
      const x = 2 + Math.floor(rng() * (SIZE - 4)), y = 2 + Math.floor(rng() * (SIZE - 4));
      const t = this.tiles[y * SIZE + x];
      if (this.isWalkable(x + 0.5, y + 0.5) && t !== T.SHALLOW && (!filter || filter(x, y, t))) return { x: x + 0.5, y: y + 0.5 };
    }
    return { x: SIZE / 2 + 0.5, y: SIZE / 2 + 0.5 };
  }

  /** Помечает тайл изменённым. */
  mark(i) { this.dirty.add(i); }

  /** Устанавливает тип тайла, при revertSec>0 — вернёт base через это время. */
  setType(i, type, revertSec = 0) {
    if (this.tiles[i] === type) { if (revertSec) this.revertAt[i] = this.time + revertSec; return false; }
    this.tiles[i] = type;
    this.revertAt[i] = revertSec ? this.time + revertSec : 0;
    this.mark(i);
    return true;
  }

  /** Добавляет флаг на тайл и продлевает его жизнь. */
  setFlag(i, flag, ttl) {
    const had = this.flags[i] & flag;
    this.flags[i] |= flag;
    const life = ttl || FLAG_TTL[flag] || 30;
    this.expire[i] = Math.max(this.expire[i], this.time + life);
    if (!had) this.mark(i);
    return !had;
  }

  /** Соседние индексы (4-связность). */
  neighbors(i) {
    const x = i % SIZE, y = (i / SIZE) | 0, r = [];
    if (x > 0) r.push(i - 1); if (x < SIZE - 1) r.push(i + 1);
    if (y > 0) r.push(i - SIZE); if (y < SIZE - 1) r.push(i + SIZE);
    return r;
  }

  /** Есть ли рядом вода или потоп. */
  nearWater(i) {
    for (const j of this.neighbors(i)) if (isWaterType(this.tiles[j]) || (this.flags[j] & F.FLOOD)) return true;
    return false;
  }

  /** Есть ли рядом огонь. */
  nearFire(i) {
    for (const j of this.neighbors(i)) if (this.flags[j] & F.FIRE) return true;
    return false;
  }

  /**
   * Применяет операцию катаклизма к тайлу, если она к нему применима.
   * @param {string} op flood|dry|burn|freeze|toxic|rad|spore|lava|crack|ash|mud|sink|crater|rock|grow
   * @param {number} x тайловая координата X
   * @param {number} y тайловая координата Y
   * @returns {boolean} изменился ли тайл
   */
  applyOp(op, x, y) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
    const i = y * SIZE + x, t = this.tiles[i], f = this.flags[i];
    const water = isWaterType(t), land = !water && t !== T.LAVA;
    switch (op) {
      case 'flood':
        if (!land || t === T.CRACK || t === T.ROCK || t === T.VOLCANO || t === T.CAVE) return false;
        if (!this.nearWater(i)) return false;           // вода идёт от берега/соседей
        return this.setFlag(i, F.FLOOD, 30);
      case 'dry':
        if (f & (F.FLOOD | F.WET)) { this.flags[i] &= ~(F.FLOOD | F.WET); this.mark(i); return true; }
        if (t === T.SHALLOW && this.coastDist[i] <= 2) return this.setType(i, T.SAND, 40);
        if (t === T.LAKE && this.base[i] === T.LAKE) return this.setType(i, T.MUD, 50);
        return false;
      case 'burn':
        if (t === T.OCEAN || t === T.LAVA || (f & F.FLOOD) || t === T.CRACK || t === T.LAKE) return false;
        if (t === T.ROCK || t === T.CAVE) return false;
        if (t === T.SHALLOW && !(f & F.TOXIC)) return false;
        return this.setFlag(i, F.FIRE, 12);
      case 'freeze':
        if (t === T.SHALLOW || t === T.LAKE) return this.setType(i, T.ICE, 45);
        if (land && t !== T.ICE) return this.setFlag(i, F.FROZEN, 35);
        return false;
      case 'toxic': return !(t === T.OCEAN) && this.setFlag(i, F.TOXIC, 45);
      case 'rad': return land && this.setFlag(i, F.RAD, 90);
      case 'spore': return land && this.setFlag(i, F.SPORE, 40);
      case 'lava':
        if (t === T.VOLCANO || t === T.ROCK || t === T.ASH || t === T.GRASS) return this.setType(i, T.LAVA, 55);
        return false;
      case 'crack':
        if (!land || t === T.CAVE || t === T.CRACK) return false;
        return this.setType(i, T.CRACK, 70 + this.rng() * 40);
      case 'ash':
        if (t === T.GRASS || t === T.FOREST || t === T.SAND) return this.setType(i, T.ASH, 90);
        return false;
      case 'mud':
        if (t === T.GRASS || t === T.SAND || t === T.FOREST || t === T.ASH) return this.setType(i, T.MUD, 60);
        return false;
      case 'sink':
        if (this.sunk > this.landCount * 0.22) return false;
        if ((t === T.SAND || t === T.GRASS || t === T.MUD) && this.coastDist[i] <= 1) { this.sunk++; return this.setType(i, T.SHALLOW, 0); }
        return false;
      case 'crater':
        if (t === T.GRASS || t === T.SAND || t === T.ROCK || t === T.FOREST || t === T.ASH) return this.setType(i, T.CRATER, 0);
        return false;
      case 'rock':
        if (t === T.GRASS || t === T.FOREST) return this.setType(i, T.ROCK, 90);
        return false;
      case 'grow':
        if (t === T.GRASS && this.rng() < 0.7) return this.setType(i, T.FOREST, 0);
        if (t === T.ASH || t === T.MUD) return this.setType(i, T.GRASS, 0);
        return false;
      default: return false;
    }
  }

  /**
   * Обновление мира: затухание флагов, возврат типов, распространение огня.
   * Вызывается ~1 раз в секунду.
   * @param {number} t игровое время, сек
   */
  update(t) {
    this.time = t;
    const n = SIZE * SIZE;
    const ignite = [];
    for (let i = 0; i < n; i++) {
      // возврат тайла к исходному типу
      if (this.revertAt[i] && this.revertAt[i] <= t) {
        this.revertAt[i] = 0;
        // лава остывает в пепел, остальное возвращается
        const to = this.tiles[i] === T.LAVA ? T.ASH : this.base[i];
        if (this.tiles[i] !== to) { this.tiles[i] = to; this.mark(i); }
      }
      const f = this.flags[i];
      if (!f) continue;
      if (f & F.FIRE) {
        // огонь распространяется на горючие соседние тайлы и затем выгорает в пепел
        if (this.expire[i] - t <= 2.5 && (this.tiles[i] === T.GRASS || this.tiles[i] === T.FOREST)) {
          this.tiles[i] = T.ASH; this.revertAt[i] = t + 120; this.mark(i);
        }
        for (const j of this.neighbors(i)) {
          const tj = this.tiles[j];
          if ((tj === T.GRASS || tj === T.FOREST || tj === T.SWAMP) && !(this.flags[j] & (F.FIRE | F.FLOOD)) && this.rng() < 0.16) ignite.push(j);
        }
      }
      if (this.expire[i] <= t) { this.flags[i] = 0; this.mark(i); }
    }
    for (const j of ignite) this.setFlag(j, F.FIRE, 12);
  }

  /**
   * Забирает накопленные изменения тайлов.
   * @returns {number[][]} массив [индекс, тип, флаги]
   */
  drainChanges() {
    const out = [];
    for (const i of this.dirty) out.push([i, this.tiles[i], this.flags[i]]);
    this.dirty.clear();
    return out;
  }
}
