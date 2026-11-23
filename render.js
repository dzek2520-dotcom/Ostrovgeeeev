/**
 * render.js — отрисовка игры на Canvas 2D (без внешних ассетов).
 *
 * Что делает этот файл:
 *  Класс Renderer рисует кадр: кэш карты (процедурные тайлы), анимированные состояния тайлов
 *  (огонь, потоп, лёд, токсины, радиация, споры), постройки, лут, мобов, игроков (имя, hp,
 *  статусы, эмоции), частицы катаклизмов, цветные оверлеи, затемнение с кругом света,
 *  тряску камеры, контуры опасных зон и визуальные события (взрывы, молнии, всплески).
 *  Также рисует миникарту. Графика — векторная/эмодзи, всё внутри репозитория.
 */
import { TILE_PX, T, F, TILE_INFO, STRUCTS, MOBS, STATUSES, ITEMS, CATS } from './shared.js';

const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const MAX_PARTICLES = 600;

/** Детерминированный хеш (индекс, соль) → 0..1. */
function h(i, k) {
  let x = (Math.imul(i + 1, 374761393) + Math.imul(k + 1, 668265263)) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Смешивает цвет #rrggbb с яркостью k (0.7..1.3). */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * k)), g = Math.min(255, Math.max(0, ((n >> 8) & 255) * k)), b = Math.min(255, Math.max(0, (n & 255) * k));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas основной холст
   */
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = 64;
    this.tiles = null; this.flags = null;
    this.mapCv = document.createElement('canvas'); this.mapCtx = this.mapCv.getContext('2d');
    this.miniCv = document.createElement('canvas'); this.miniCtx = this.miniCv.getContext('2d');
    this.coast = null;
    this.particles = [];
    this.fxList = [];
    this.time = 0;
    this.shake = 0; this.flash = 0;
    this.dpr = 1; this.ppt = 40; this.W = 0; this.H = 0;
    this.cam = { x: 32, y: 32 };
    this.boltLines = [];
  }

  /** Подгоняет размер холста под окно. */
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, hh = window.innerHeight;
    this.cv.width = Math.round(w * this.dpr); this.cv.height = Math.round(hh * this.dpr);
    this.W = this.cv.width; this.H = this.cv.height;
    const tilesOnScreen = w < 700 ? 11 : 15;
    this.ppt = Math.min(this.W, this.H) / tilesOnScreen;
  }

  /**
   * Передаёт карту рендереру и строит кэши.
   * @param {number} size размер стороны
   * @param {Uint8Array} tiles типы
   * @param {Uint8Array} flags флаги
   */
  setWorld(size, tiles, flags) {
    this.size = size; this.tiles = tiles; this.flags = flags;
    this.mapCv.width = this.mapCv.height = size * TILE_PX;
    this.miniCv.width = this.miniCv.height = size;
    for (let i = 0; i < size * size; i++) { this.paintTile(i); this.paintMini(i); }
    this.computeCoast();
  }

  /** BFS расстояния до воды (для подсветки прибрежных зон). */
  computeCoast() {
    const n = this.size, d = new Uint8Array(n * n).fill(255), q = [];
    for (let i = 0; i < n * n; i++) if (this.tiles[i] <= T.SHALLOW || this.tiles[i] === T.LAKE) { d[i] = 0; q.push(i); }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % n, y = (i / n) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const j = ny * n + nx;
        if (d[j] === 255) { d[j] = Math.min(60, d[i] + 1); q.push(j); }
      }
    }
    this.coast = d;
  }

  /** Применяет изменения тайлов [[idx,type,flags]]. */
  applyTiles(deltas) {
    for (const [i, t, f] of deltas) {
      if (this.tiles[i] !== t) { this.tiles[i] = t; this.paintTile(i); this.paintMini(i); }
      this.flags[i] = f;
    }
  }

  /** Цвет пикселя миникарты. */
  paintMini(i) {
    const x = i % this.size, y = (i / this.size) | 0;
    this.miniCtx.fillStyle = TILE_INFO[this.tiles[i]].color;
    this.miniCtx.fillRect(x, y, 1, 1);
  }

  /** Рисует один тайл в кэше карты (процедурно, с вариациями). */
  paintTile(i) {
    const c = this.mapCtx, S = TILE_PX, x = (i % this.size) * S, y = ((i / this.size) | 0) * S;
    const t = this.tiles[i], info = TILE_INFO[t];
    c.fillStyle = shade(info.color, 0.92 + h(i, 1) * 0.16);
    c.fillRect(x, y, S, S);
    const R = (k) => h(i, k);
    switch (t) {
      case T.GRASS:
        c.strokeStyle = shade(info.color, 0.75); c.lineWidth = 1.5;
        for (let k = 0; k < 6; k++) { const px = x + R(10 + k) * S, py = y + R(20 + k) * S; c.beginPath(); c.moveTo(px, py); c.lineTo(px + 2, py - 5); c.stroke(); }
        if (R(40) < 0.12) { c.fillStyle = ['#ffd84a', '#ff7aa8', '#fff'][(R(41) * 3) | 0]; c.beginPath(); c.arc(x + R(42) * S, y + R(43) * S, 2, 0, 6.3); c.fill(); }
        break;
      case T.FOREST: {
        const n = 1 + ((R(5) * 2) | 0);
        for (let k = 0; k < n; k++) {
          const px = x + (0.3 + R(6 + k) * 0.4) * S, py = y + (0.45 + R(8 + k) * 0.3) * S;
          c.fillStyle = '#5a3a1e'; c.fillRect(px - 2, py, 4, 8);
          c.fillStyle = shade('#1f5a24', 0.85 + R(12 + k) * 0.35); c.beginPath(); c.arc(px, py - 2, 10, 0, 6.3); c.fill();
          c.fillStyle = '#ffffff18'; c.beginPath(); c.arc(px - 3, py - 6, 4, 0, 6.3); c.fill();
        }
        break;
      }
      case T.SAND:
        c.fillStyle = shade('#caa968', 1); for (let k = 0; k < 7; k++) c.fillRect(x + R(10 + k) * S, y + R(20 + k) * S, 1.5, 1.5);
        break;
      case T.ROCK:
        c.fillStyle = shade('#6f6f6f', 0.9 + R(3) * 0.3);
        c.beginPath(); c.moveTo(x + 4, y + S - 4); c.lineTo(x + 10 + R(4) * 6, y + 8); c.lineTo(x + 20, y + 12 + R(5) * 6); c.lineTo(x + S - 4, y + S - 4); c.fill();
        c.fillStyle = '#ffffff22'; c.fillRect(x + 12, y + 12, 5, 3);
        break;
      case T.OCEAN: case T.SHALLOW: case T.LAKE:
        c.fillStyle = '#ffffff10'; c.fillRect(x + R(2) * 20, y + R(3) * 24, 10, 2);
        break;
      case T.SWAMP:
        c.fillStyle = '#2f4a2a'; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x + R(10 + k) * S, y + R(20 + k) * S, 3 + R(30 + k) * 4, 0, 6.3); c.fill(); }
        c.strokeStyle = '#8fb25a'; c.lineWidth = 1.5; c.beginPath(); const rx = x + R(50) * S; c.moveTo(rx, y + S - 3); c.lineTo(rx, y + 8); c.stroke();
        break;
      case T.MUD:
        c.fillStyle = '#4a3822'; for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(x + R(10 + k) * S, y + R(20 + k) * S, 5, 3, 0, 0, 6.3); c.fill(); }
        break;
      case T.VOLCANO:
        c.fillStyle = '#3d2a24'; c.beginPath(); c.moveTo(x, y + S); c.lineTo(x + S * 0.5, y + 6); c.lineTo(x + S, y + S); c.fill();
        c.strokeStyle = '#ff6a1a88'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + 16, y + 8); c.lineTo(x + 12 + R(3) * 8, y + S - 4); c.stroke();
        break;
      case T.LAVA:
        c.fillStyle = '#ffc13a'; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x + R(10 + k) * S, y + R(20 + k) * S, 3 + R(30 + k) * 4, 0, 6.3); c.fill(); }
        break;
      case T.CAVE:
        c.fillStyle = '#16161c'; c.beginPath(); c.arc(x + S / 2, y + S * 0.62, S * 0.34, Math.PI, 0); c.lineTo(x + S * 0.84, y + S * 0.95); c.lineTo(x + S * 0.16, y + S * 0.95); c.fill();
        break;
      case T.ASH:
        c.fillStyle = '#777'; for (let k = 0; k < 6; k++) c.fillRect(x + R(10 + k) * S, y + R(20 + k) * S, 2, 2);
        break;
      case T.ICE:
        c.strokeStyle = '#fff9'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + 4, y + 8 + R(3) * 10); c.lineTo(x + S - 4, y + 14 + R(4) * 12); c.stroke();
        break;
      case T.CRACK:
        c.fillStyle = '#050303'; c.fillRect(x, y, S, S);
        c.strokeStyle = '#ff4a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y + R(3) * S); c.lineTo(x + S * 0.5, y + S * (0.3 + R(4) * 0.4)); c.lineTo(x + S, y + R(5) * S); c.stroke();
        break;
      case T.CRATER:
        c.strokeStyle = '#4a3a2e'; c.lineWidth = 3; c.beginPath(); c.arc(x + S / 2, y + S / 2, S * 0.32, 0, 6.3); c.stroke();
        c.fillStyle = '#2d241c'; c.beginPath(); c.arc(x + S / 2, y + S / 2, S * 0.22, 0, 6.3); c.fill();
        break;
      default: break;
    }
  }

  /** Экран → мир (тайлы). */
  screenToWorld(sx, sy) {
    return { x: this.cam.x + (sx * this.dpr - this.W / 2) / this.ppt, y: this.cam.y + (sy * this.dpr - this.H / 2) / this.ppt };
  }

  /** Эмодзи по центру. */
  emoji(ch, x, y, size, alpha = 1) {
    const c = this.ctx;
    c.globalAlpha = alpha; c.font = `${size}px ${EMOJI_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(ch, x, y); c.globalAlpha = 1;
  }

  /** Полоска hp над сущностью. */
  hpBar(x, y, w, frac, col = '#5fd38a') {
    const c = this.ctx;
    c.fillStyle = '#000a'; c.fillRect(x - w / 2, y, w, 5);
    c.fillStyle = frac > 0.5 ? col : frac > 0.25 ? '#ffd04a' : '#ff5a5a'; c.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 5);
  }

  /**
   * Рисует кадр.
   * @param {Object} state состояние клиента (см. PROTOCOL.md)
   * @param {number} dt секунды с прошлого кадра
   */
  draw(state, dt) {
    if (!this.tiles) return;
    const c = this.ctx, ppt = this.ppt, S = this.size;
    this.time += dt;
    this.cam = state.camera;
    const active = state.cats.filter((k) => k.phase === 'active'), warning = state.cats.filter((k) => k.phase === 'warn');
    // тряска камеры
    let shT = 0;
    for (const k of active) shT = Math.max(shT, (k.vis && k.vis.sh) || 0);
    this.shake += ((shT * 0.7) - this.shake) * Math.min(1, dt * 4);
    const sx = (Math.random() - 0.5) * this.shake * 2 * this.dpr, sy = (Math.random() - 0.5) * this.shake * 2 * this.dpr;
    // забираем события
    for (const e of state.fxQueue.splice(0)) this.addFx(e);

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#082a4a'; c.fillRect(0, 0, this.W, this.H);
    const ox = this.W / 2 - this.cam.x * ppt + sx, oy = this.H / 2 - this.cam.y * ppt + sy;
    // видимая область в тайлах
    const x0 = Math.max(0, Math.floor(-ox / ppt)), y0 = Math.max(0, Math.floor(-oy / ppt));
    const x1 = Math.min(S, Math.ceil((this.W - ox) / ppt)), y1 = Math.min(S, Math.ceil((this.H - oy) / ppt));
    // карта из кэша
    c.imageSmoothingEnabled = true;
    if (x1 > x0 && y1 > y0) c.drawImage(this.mapCv, x0 * TILE_PX, y0 * TILE_PX, (x1 - x0) * TILE_PX, (y1 - y0) * TILE_PX, ox + x0 * ppt, oy + y0 * ppt, (x1 - x0) * ppt, (y1 - y0) * ppt);
    c.setTransform(1, 0, 0, 1, ox, oy);
    this.drawTileEffects(x0, y0, x1, y1);
    this.drawZones(state, active, warning);
    // сущности по Y
    const ents = [];
    for (const s of state.structs) ents.push({ y: s.y, f: () => this.drawStruct(s) });
    for (const l of state.loot) ents.push({ y: l.y, f: () => this.drawLoot(l) });
    for (const m of state.mobs) ents.push({ y: m.ry ?? m.y, f: () => this.drawMob(m) });
    for (const p of state.players) ents.push({ y: p.ry ?? p.y, f: () => this.drawPlayer(p, p.id === state.meId) });
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.f();
    this.drawFx(dt);
    // ── экранный слой ──
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.drawParticles(active, dt);
    for (const k of active) {
      const v = k.vis; if (!v || !v.a) continue;
      c.globalAlpha = v.a; c.fillStyle = v.c; c.fillRect(0, 0, this.W, this.H);
    }
    c.globalAlpha = 1;
    this.drawDarkness(state, active);
    if (this.flash > 0.01) { c.fillStyle = `rgba(255,255,255,${this.flash * 0.7})`; c.fillRect(0, 0, this.W, this.H); this.flash *= Math.pow(0.02, dt); }
    if (warning.length) this.drawWarnVignette(warning);
  }

  /** Анимированные состояния тайлов. */
  drawTileEffects(x0, y0, x1, y1) {
    const c = this.ctx, ppt = this.ppt, S = this.size, t = this.time;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * S + x, ty = this.tiles[i], f = this.flags[i];
        const px = x * ppt, py = y * ppt;
        if (ty <= T.SHALLOW || ty === T.LAKE) {            // рябь воды
          c.fillStyle = `rgba(255,255,255,${0.03 + 0.04 * Math.sin(t * 1.6 + x * 0.9 + y * 0.7)})`; c.fillRect(px, py, ppt, ppt);
        } else if (ty === T.LAVA) {
          c.fillStyle = `rgba(255,${120 + 80 * Math.sin(t * 3 + x + y)},30,0.35)`; c.fillRect(px, py, ppt, ppt);
        }
        if (!f) continue;
        if (f & F.FLOOD) { c.fillStyle = `rgba(70,150,230,${0.42 + 0.08 * Math.sin(t * 2 + x)})`; c.fillRect(px, py, ppt, ppt); }
        else if (f & F.WET) { c.fillStyle = 'rgba(70,120,200,0.18)'; c.fillRect(px, py, ppt, ppt); }
        if (f & F.FROZEN) { c.fillStyle = 'rgba(200,240,255,0.45)'; c.fillRect(px, py, ppt, ppt); }
        if (f & F.TOXIC) { c.fillStyle = `rgba(110,230,60,${0.3 + 0.12 * Math.sin(t * 2.3 + y)})`; c.fillRect(px, py, ppt, ppt); }
        if (f & F.RAD) { c.fillStyle = `rgba(230,255,60,${0.22 + 0.15 * Math.sin(t * 4 + x * 2)})`; c.fillRect(px, py, ppt, ppt); }
        if (f & F.SPORE) { c.fillStyle = `rgba(170,90,255,${0.25 + 0.1 * Math.sin(t * 2 + x)})`; c.fillRect(px, py, ppt, ppt); }
        if (f & F.FIRE) {                                   // пламя
          const fl = 0.7 + 0.3 * Math.sin(t * 12 + x * 3.1 + y * 1.7);
          c.fillStyle = 'rgba(255,90,10,0.55)'; c.fillRect(px, py, ppt, ppt);
          c.fillStyle = `rgba(255,${180 + 60 * fl | 0},40,0.8)`;
          c.beginPath(); c.moveTo(px + ppt * 0.15, py + ppt); c.quadraticCurveTo(px + ppt * 0.3, py + ppt * (0.9 - 0.5 * fl), px + ppt * 0.5, py + ppt * (0.2 + 0.2 * (1 - fl)));
          c.quadraticCurveTo(px + ppt * 0.7, py + ppt * (0.9 - 0.4 * fl), px + ppt * 0.85, py + ppt); c.fill();
        }
      }
    }
  }

  /** Контуры зон катаклизмов (в мировых координатах). */
  drawZones(state, active, warning) {
    const c = this.ctx, ppt = this.ppt, S = this.size, pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    const draw = (k, warn) => {
      const z = k.zone; if (!z) return;
      const col = (CATS[k.cat] && CATS[k.cat].color) || '#ff7a3d';
      const fillA = warn ? 0.1 + 0.1 * pulse : 0.05, lineA = warn ? 0.9 : 0.35;
      c.save(); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = warn ? 4 : 2; c.setLineDash([12, 10]);
      c.lineDashOffset = -this.time * 20;
      if (z.t === 'circle') {
        c.globalAlpha = fillA; c.beginPath(); c.arc(z.x * ppt, z.y * ppt, z.r * ppt, 0, 6.3); c.fill();
        c.globalAlpha = lineA; c.stroke();
      } else if (z.t === 'rect') {
        c.globalAlpha = fillA; c.fillRect(z.x0 * ppt, z.y0 * ppt, (z.x1 - z.x0) * ppt, (z.y1 - z.y0) * ppt);
        c.globalAlpha = lineA; c.strokeRect(z.x0 * ppt, z.y0 * ppt, (z.x1 - z.x0) * ppt, (z.y1 - z.y0) * ppt);
      } else if (z.t === 'line') {
        c.globalAlpha = fillA * 1.4; c.lineWidth = z.w * ppt; c.setLineDash([]); c.lineCap = 'butt';
        c.beginPath(); c.moveTo(z.x0 * ppt, z.y0 * ppt); c.lineTo(z.x1 * ppt, z.y1 * ppt); c.stroke();
      } else if (z.t === 'coast' && this.coast) {
        c.setLineDash([]); c.globalAlpha = fillA * 1.6;
        const x0 = Math.max(0, Math.floor((this.cam.x * ppt - this.W / 2) / ppt)), x1 = Math.min(S, Math.ceil((this.cam.x * ppt + this.W / 2) / ppt));
        const y0 = Math.max(0, Math.floor((this.cam.y * ppt - this.H / 2) / ppt)), y1 = Math.min(S, Math.ceil((this.cam.y * ppt + this.H / 2) / ppt));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const d = this.coast[y * S + x]; if (d <= z.d && this.tiles[y * S + x] > 0) c.fillRect(x * ppt, y * ppt, ppt, ppt); }
      } else if (z.t === 'island' && warn) {
        c.globalAlpha = fillA * 0.6; c.setLineDash([]); c.fillRect(0, 0, S * ppt, S * ppt);
      }
      c.restore();
    };
    for (const k of active) draw(k, false);
    for (const k of warning) draw(k, true);
  }

  /** Постройка. */
  drawStruct(s) {
    const c = this.ctx, ppt = this.ppt, def = STRUCTS[s.k]; if (!def) return;
    const x = s.x * ppt, y = s.y * ppt;
    if (s.k === 'campfire') {
      const g = c.createRadialGradient(x, y, 0, x, y, ppt * 3);
      g.addColorStop(0, `rgba(255,170,60,${0.28 + 0.06 * Math.sin(this.time * 9)})`); g.addColorStop(1, 'rgba(255,120,20,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, ppt * 3, 0, 6.3); c.fill();
    }
    c.fillStyle = '#0005'; c.beginPath(); c.ellipse(x, y + ppt * 0.35, ppt * 0.45, ppt * 0.18, 0, 0, 6.3); c.fill();
    this.emoji(def.icon, x, y, ppt * 1.05);
    if (s.hp < s.mh) this.hpBar(x, y - ppt * 0.65, ppt * 0.8, s.hp / s.mh, '#6ab0ff');
  }

  /** Предмет на земле. */
  drawLoot(l) {
    const c = this.ctx, ppt = this.ppt, it = ITEMS[l.i]; if (!it) return;
    const x = l.x * ppt, y = l.y * ppt + Math.sin(this.time * 3 + l.id) * ppt * 0.05;
    c.fillStyle = 'rgba(255,255,200,0.22)'; c.beginPath(); c.arc(x, y, ppt * 0.38, 0, 6.3); c.fill();
    this.emoji(it.icon, x, y, ppt * 0.55);
    if (l.n > 1) { c.fillStyle = '#fff'; c.font = `bold ${ppt * 0.28}px sans-serif`; c.textAlign = 'left'; c.fillText(l.n, x + ppt * 0.15, y + ppt * 0.28); }
  }

  /** Моб. */
  drawMob(m) {
    const c = this.ctx, ppt = this.ppt, def = MOBS[m.k]; if (!def) return;
    const x = (m.rx ?? m.x) * ppt, y = (m.ry ?? m.y) * ppt;
    c.fillStyle = '#0006'; c.beginPath(); c.ellipse(x, y + ppt * 0.25, ppt * def.size, ppt * def.size * 0.4, 0, 0, 6.3); c.fill();
    this.emoji(def.icon, x, y + Math.sin(this.time * 6 + m.id) * ppt * 0.03, ppt * def.size * 2.1, m.k === 'spirit' ? 0.7 : 1);
    if (m.hp < m.mh) this.hpBar(x, y - ppt * def.size * 1.3, ppt * 0.7, m.hp / m.mh, '#ff7a7a');
  }

  /** Игрок. */
  drawPlayer(p, me) {
    const c = this.ctx, ppt = this.ppt, x = (p.rx ?? p.x) * ppt, y = (p.ry ?? p.y) * ppt, r = ppt * 0.3;
    if (!p.al) { this.emoji('🪦', x, y, ppt * 0.9, 0.75); this.label(p.name, x, y - ppt * 0.6, '#aaa'); return; }
    c.fillStyle = '#0006'; c.beginPath(); c.ellipse(x, y + r * 0.9, r * 1.1, r * 0.45, 0, 0, 6.3); c.fill();
    if (p.s && p.s.includes('glowing')) { const g = c.createRadialGradient(x, y, 0, x, y, ppt * 2); g.addColorStop(0, 'rgba(255,240,150,0.4)'); g.addColorStop(1, 'rgba(255,240,150,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, ppt * 2, 0, 6.3); c.fill(); }
    c.fillStyle = p.color; c.strokeStyle = me ? '#fff' : '#000a'; c.lineWidth = me ? 3 : 2;
    c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill(); c.stroke();
    // глаза по направлению взгляда
    const dx = Math.cos(p.d || 0), dy = Math.sin(p.d || 0), px = -dy, py = dx;
    c.fillStyle = '#fff';
    for (const s of [-1, 1]) { c.beginPath(); c.arc(x + dx * r * 0.45 + px * r * 0.35 * s, y + dy * r * 0.45 + py * r * 0.35 * s, r * 0.22, 0, 6.3); c.fill(); }
    c.fillStyle = '#111';
    for (const s of [-1, 1]) { c.beginPath(); c.arc(x + dx * r * 0.58 + px * r * 0.35 * s, y + dy * r * 0.58 + py * r * 0.35 * s, r * 0.11, 0, 6.3); c.fill(); }
    this.label(p.name, x, y - ppt * 0.62, me ? '#ffe9a0' : '#fff');
    if (p.hp < 100 || !me) this.hpBar(x, y - ppt * 0.5, ppt * 0.7, p.hp / 100);
    // статусы
    if (p.s && p.s.length) {
      const list = p.s.slice(0, 4), fs = ppt * 0.28;
      list.forEach((k, i) => { const st = STATUSES[k]; if (st) this.emoji(st.icon, x + (i - (list.length - 1) / 2) * fs * 1.1, y - ppt * 0.95, fs); });
    }
    // эмоция
    if (p.emote) {
      const age = (performance.now() - p.emote.t0) / 2500;
      if (age < 1) { c.fillStyle = '#fffe'; c.beginPath(); c.arc(x + ppt * 0.4, y - ppt * 1.25 - age * ppt * 0.2, ppt * 0.28, 0, 6.3); c.fill(); this.emoji(p.emote.e, x + ppt * 0.4, y - ppt * 1.25 - age * ppt * 0.2, ppt * 0.36, 1 - age * 0.5); }
    }
  }

  /** Имя над игроком. */
  label(text, x, y, col) {
    const c = this.ctx;
    c.font = `600 ${Math.max(10, this.ppt * 0.26)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 3; c.strokeStyle = '#000b'; c.strokeText(text, x, y); c.fillStyle = col; c.fillText(text, x, y);
  }

  /** Добавляет визуальное событие. */
  addFx(e) {
    const f = { ...e, t0: this.time };
    switch (e.k) {
      case 'bolt': this.flash = Math.max(this.flash, 0.5); this.shake = Math.max(this.shake, 3); f.life = 0.35; f.pts = this.makeBolt(e.x, e.y); break;
      case 'boom': this.shake = Math.max(this.shake, 4 + (e.r || 1)); f.life = 0.6; this.burst(e.x, e.y, 14, '#ffb347', 5); break;
      case 'mark': f.life = 1.0; break;
      case 'splash': f.life = 0.6; this.burst(e.x, e.y, 10, '#9fd8ff', 4); break;
      case 'heal': f.life = 0.9; break;
      case 'hit': f.life = 0.3; this.burst(e.x, e.y, 5, '#ffe9a0', 3); break;
      case 'gather': f.life = 0.4; this.burst(e.x, e.y, 5, '#e8d9a0', 2); break;
      case 'craft': f.life = 0.7; break;
      case 'death': f.life = 1.2; this.burst(e.x, e.y, 14, '#bbb', 3); break;
      case 'tele': f.life = 0.6; break;
      default: f.life = 0.5;
    }
    this.fxList.push(f);
  }

  /** Ломаная молния сверху в точку (мировые координаты). */
  makeBolt(x, y) {
    const pts = []; let px = x + (Math.random() - 0.5) * 4, py = y - 8;
    for (let i = 0; i < 9; i++) { pts.push([px, py]); px += (x - px) * 0.25 + (Math.random() - 0.5) * 1.4; py += (y - py) * 0.3 + 0.2; }
    pts.push([x, y]);
    return pts;
  }

  /** Всплеск частиц в мировой точке. */
  burst(wx, wy, n, color, speed) {
    for (let i = 0; i < n && this.fxList.length < 300; i++) {
      this.fxList.push({ k: 'spark', x: wx, y: wy, vx: (Math.random() - 0.5) * speed, vy: (Math.random() - 0.7) * speed, t0: this.time, life: 0.5 + Math.random() * 0.4, c: color });
    }
  }

  /** Рисует события (мировые координаты). */
  drawFx() {
    const c = this.ctx, ppt = this.ppt, t = this.time;
    this.fxList = this.fxList.filter((f) => t - f.t0 < f.life);
    for (const f of this.fxList) {
      const a = (t - f.t0) / f.life, x = f.x * ppt, y = f.y * ppt;
      c.save();
      switch (f.k) {
        case 'spark': c.globalAlpha = 1 - a; c.fillStyle = f.c; c.beginPath(); c.arc((f.x + f.vx * a) * ppt, (f.y + f.vy * a + a * a) * ppt, 3, 0, 6.3); c.fill(); break;
        case 'mark': {
          const r = (f.r || 1) * ppt;
          c.strokeStyle = `rgba(255,60,40,${0.5 + 0.4 * Math.sin(t * 20)})`; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.stroke();
          c.fillStyle = `rgba(255,60,40,${0.1 + 0.15 * a})`; c.beginPath(); c.arc(x, y, r * a, 0, 6.3); c.fill();
          break;
        }
        case 'boom': {
          const r = (f.r || 1) * ppt * (0.4 + a);
          const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,240,180,${1 - a})`); g.addColorStop(0.5, `rgba(255,120,30,${0.8 * (1 - a)})`); g.addColorStop(1, 'rgba(255,60,0,0)');
          c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill();
          break;
        }
        case 'bolt':
          c.globalAlpha = 1 - a; c.strokeStyle = '#fff'; c.lineWidth = 4; c.shadowColor = '#9bbcff'; c.shadowBlur = 20;
          c.beginPath(); f.pts.forEach(([px, py], i) => (i ? c.lineTo(px * ppt, py * ppt) : c.moveTo(px * ppt, py * ppt))); c.stroke();
          break;
        case 'splash': c.globalAlpha = 1 - a; c.strokeStyle = '#bfe6ff'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, (f.r || 1) * ppt * (0.3 + a), 0, 6.3); c.stroke(); break;
        case 'heal': this.emoji('➕', x, y - a * ppt, ppt * 0.45, 1 - a); this.emoji('✨', x + ppt * 0.3, y - a * ppt * 0.7, ppt * 0.3, 1 - a); break;
        case 'craft': this.emoji('⭐', x, y - a * ppt * 0.8, ppt * 0.5, 1 - a); break;
        case 'death': this.emoji('💀', x, y - a * ppt * 1.2, ppt * 0.7, 1 - a); break;
        case 'tele': c.globalAlpha = 1 - a; c.strokeStyle = '#7ad7ff'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, ppt * (0.2 + a * 1.2), 0, 6.3); c.stroke(); break;
        default: break;
      }
      c.restore();
    }
  }

  /** Фоновые частицы активных катаклизмов (экранные координаты). */
  drawParticles(active, dt) {
    const c = this.ctx, W = this.W, H = this.H, d = this.dpr;
    // спавн
    const want = new Set(); for (const k of active) if (k.vis && k.vis.p && k.vis.p !== 'none') want.add(k.vis.p);
    for (const kind of want) {
      const n = kind === 'rain' ? 8 : kind === 'bolts' ? 0.04 : 2;
      let cnt = n * dt * 60; while (cnt > 0 && this.particles.length < MAX_PARTICLES) { if (cnt < 1 && Math.random() > cnt) break; cnt--; this.spawnParticle(kind); }
      if (kind === 'bolts' && Math.random() < dt * 0.7) { this.flash = Math.max(this.flash, 0.35); }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt; p.x += p.vx * dt * d; p.y += p.vy * dt * d;
      if (p.life <= 0 || p.x < -50 || p.x > W + 50 || p.y > H + 50 || p.y < -80) { this.particles.splice(i, 1); continue; }
      const a = Math.min(1, p.life / p.max * 2);
      c.globalAlpha = a * p.a;
      switch (p.type) {
        case 'rain': c.strokeStyle = '#bcd8ff'; c.lineWidth = 1.5 * d; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.04 * d, p.y - p.vy * 0.04 * d); c.stroke(); break;
        case 'fish': this.emoji('🐟', p.x, p.y, 22 * d); break;
        case 'leaves': this.emoji('🍃', p.x, p.y, 18 * d); break;
        case 'waves': c.strokeStyle = '#d6efff'; c.lineWidth = 2 * d; c.beginPath(); c.arc(p.x, p.y, p.s * d * 3, Math.PI, 0); c.stroke(); break;
        case 'bubbles': c.strokeStyle = '#fff'; c.lineWidth = 1.5 * d; c.beginPath(); c.arc(p.x, p.y, p.s * d, 0, 6.3); c.stroke(); break;
        case 'stars': c.fillStyle = '#fff'; c.globalAlpha *= 0.5 + 0.5 * Math.sin(this.time * 6 + p.x); c.fillRect(p.x, p.y, 2 * d, 2 * d); break;
        default: c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.s * d, 0, 6.3); c.fill();
      }
    }
    c.globalAlpha = 1;
  }

  /** Создаёт одну частицу вида kind. */
  spawnParticle(kind) {
    const W = this.W / this.dpr, H = this.H / this.dpr, r = Math.random;
    const p = { type: kind, x: r() * W * this.dpr, y: -10, vx: 0, vy: 0, life: 3, max: 3, s: 2, a: 0.8, col: '#fff' };
    switch (kind) {
      case 'rain': p.vx = -120; p.vy = 700 + r() * 200; p.life = p.max = 1.2; p.a = 0.55; break;
      case 'snow': p.vx = -40 + r() * 80; p.vy = 60 + r() * 80; p.s = 1.5 + r() * 2.5; p.col = '#fff'; p.life = p.max = 8; break;
      case 'ash': p.vx = 20 + r() * 40; p.vy = 30 + r() * 50; p.s = 1.5 + r() * 2; p.col = '#aaa'; p.life = p.max = 9; p.a = 0.7; break;
      case 'embers': p.y = H * this.dpr + 10; p.vx = (r() - 0.5) * 60; p.vy = -60 - r() * 120; p.s = 1.5 + r() * 2; p.col = r() < 0.5 ? '#ff8a2a' : '#ffd24a'; p.life = p.max = 4; break;
      case 'dust': p.x = -10; p.y = r() * H * this.dpr; p.vx = 300 + r() * 300; p.vy = (r() - 0.5) * 60; p.s = 1.5 + r() * 2; p.col = '#c9a45c'; p.life = p.max = 3; p.a = 0.6; break;
      case 'spores': p.y = r() * H * this.dpr; p.vx = (r() - 0.5) * 40; p.vy = -10 - r() * 30; p.s = 2 + r() * 3; p.col = '#b36bff'; p.life = p.max = 6; p.a = 0.6; break;
      case 'bubbles': p.y = H * this.dpr + 10; p.vy = -40 - r() * 60; p.vx = (r() - 0.5) * 20; p.s = 3 + r() * 6; p.life = p.max = 7; p.a = 0.6; break;
      case 'sparks': p.y = r() * H * this.dpr; p.vx = (r() - 0.5) * 400; p.vy = (r() - 0.5) * 400; p.s = 1 + r() * 2; p.col = '#ffee66'; p.life = p.max = 0.5; break;
      case 'fish': p.vx = -30 + r() * 60; p.vy = 300 + r() * 200; p.life = p.max = 3; break;
      case 'leaves': p.vx = 80 + r() * 120; p.vy = 40 + r() * 80; p.life = p.max = 8; break;
      case 'waves': p.x = -10; p.y = r() * H * this.dpr; p.vx = 200 + r() * 150; p.s = 6 + r() * 10; p.life = p.max = 5; p.a = 0.35; break;
      case 'stars': p.y = r() * H * this.dpr; p.vy = 0; p.life = p.max = 3; p.a = 0.9; break;
      default: p.life = 0;
    }
    if (p.life > 0) this.particles.push(p);
  }

  /** Затемнение с кругом света вокруг игрока, костров и лавы. */
  drawDarkness(state, active) {
    let d = 0; for (const k of active) d = Math.max(d, (k.vis && k.vis.d) || 0);
    if (d < 0.02) return;
    const c = this.ctx, ppt = this.ppt;
    const cx = this.W / 2 + (state.me ? state.me.x - this.cam.x : 0) * ppt, cy = this.H / 2 + (state.me ? state.me.y - this.cam.y : 0) * ppt;
    const g = c.createRadialGradient(cx, cy, ppt * 1.2, cx, cy, ppt * 6);
    g.addColorStop(0, 'rgba(0,0,10,0)'); g.addColorStop(1, `rgba(0,0,10,${d})`);
    c.fillStyle = g; c.fillRect(0, 0, this.W, this.H);
    // костры подсвечивают тьму
    c.globalCompositeOperation = 'lighter';
    for (const s of state.structs) {
      if (s.k !== 'campfire') continue;
      const sx = this.W / 2 + (s.x - this.cam.x) * ppt, sy = this.H / 2 + (s.y - this.cam.y) * ppt;
      const gg = c.createRadialGradient(sx, sy, 0, sx, sy, ppt * 3.5); gg.addColorStop(0, `rgba(255,150,50,${0.35 * d})`); gg.addColorStop(1, 'rgba(255,150,50,0)');
      c.fillStyle = gg; c.fillRect(sx - ppt * 4, sy - ppt * 4, ppt * 8, ppt * 8);
    }
    c.globalCompositeOperation = 'source-over';
  }

  /** Мигающая красная виньетка при предупреждении. */
  drawWarnVignette(warning) {
    const c = this.ctx, a = 0.12 + 0.14 * (0.5 + 0.5 * Math.sin(this.time * 7));
    const g = c.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.35, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.75);
    g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,30,30,${a})`);
    c.fillStyle = g; c.fillRect(0, 0, this.W, this.H);
  }

  /**
   * Миникарта.
   * @param {HTMLCanvasElement} cv холст миникарты
   * @param {Object} state состояние клиента
   */
  drawMinimap(cv, state) {
    if (!this.tiles) return;
    const c = cv.getContext('2d'), W = cv.width, k = W / this.size;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, W, W); c.drawImage(this.miniCv, 0, 0, W, W);
    for (const cat of state.cats) {
      const z = cat.zone; if (!z) continue;
      c.fillStyle = cat.phase === 'warn' ? 'rgba(255,200,0,0.28)' : 'rgba(255,50,50,0.28)';
      if (z.t === 'circle') { c.beginPath(); c.arc(z.x * k, z.y * k, z.r * k, 0, 6.3); c.fill(); }
      else if (z.t === 'rect') c.fillRect(z.x0 * k, z.y0 * k, (z.x1 - z.x0) * k, (z.y1 - z.y0) * k);
      else if (z.t === 'line') { c.strokeStyle = c.fillStyle; c.lineWidth = z.w * k; c.beginPath(); c.moveTo(z.x0 * k, z.y0 * k); c.lineTo(z.x1 * k, z.y1 * k); c.stroke(); }
      else if (z.t === 'island') c.fillRect(0, 0, W, W);
    }
    for (const p of state.players) {
      if (!p.al) continue;
      c.fillStyle = p.color; c.strokeStyle = p.id === state.meId ? '#fff' : '#000'; c.lineWidth = p.id === state.meId ? 2 : 1;
      c.beginPath(); c.arc((p.rx ?? p.x) * k, (p.ry ?? p.y) * k, p.id === state.meId ? 3.5 : 2.5, 0, 6.3); c.fill(); c.stroke();
    }
  }
}
