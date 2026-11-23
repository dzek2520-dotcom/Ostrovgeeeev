/**
 * input.js — ввод игрока: клавиатура, мышь и сенсорное управление (джойстик + кнопки).
 *
 * Что делает этот файл:
 *  - initInput(cb): подписывается на события и вызывает колбэки действий
 *    (onInteract, onAttack, onCraft, onInv, onChat, onEmote, onHeal, onGive, onEscape, onEmotePanel);
 *  - getAxis(): текущая ось движения {dx, dy, sprint}; объединяет клавиатуру и джойстик;
 *  - isTouch(): определяет сенсорное устройство (тогда показывается виртуальное управление).
 *  Клавиши: WASD/стрелки — движение, Shift — бег, E — действие, F/Пробел/ЛКМ — атака,
 *  Q — крафт, Tab — инвентарь, H — лечить, G — отдать, Enter — чат, 1–8 — эмоции, Esc — закрыть.
 */

const keys = new Set();
let joy = { x: 0, y: 0, id: null };
let sprintBtn = false;
let enabled = false;

/** Сенсорное ли устройство. */
export function isTouch() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
}

/** Включает/выключает обработку игрового ввода (только на экране игры). */
export function setInputEnabled(v) {
  enabled = v;
  if (!v) { keys.clear(); joy = { x: 0, y: 0, id: null }; sprintBtn = false; }
}

/**
 * Текущая ось движения.
 * @returns {{dx:number,dy:number,sprint:boolean}}
 */
export function getAxis() {
  let dx = 0, dy = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
  if (dx || dy) { const l = Math.hypot(dx, dy); dx /= l; dy /= l; }
  if (joy.id !== null) { dx = joy.x; dy = joy.y; }
  return { dx, dy, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') || sprintBtn };
}

/**
 * Подписка на события ввода.
 * @param {Object} cb колбэки действий
 */
export function initInput(cb) {
  // ── Клавиатура ──
  window.addEventListener('keydown', (e) => {
    if (!enabled) return;
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (typing) { if (e.code === 'Escape') { e.target.blur(); cb.onEscape && cb.onEscape(); } return; }
    if (e.repeat && e.code !== 'KeyE') { if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); return; }
    switch (e.code) {
      case 'KeyE': cb.onInteract && cb.onInteract(); break;
      case 'KeyF': case 'Space': e.preventDefault(); cb.onAttack && cb.onAttack(); break;
      case 'KeyQ': cb.onCraft && cb.onCraft(); break;
      case 'Tab': e.preventDefault(); cb.onInv && cb.onInv(); break;
      case 'KeyH': cb.onHeal && cb.onHeal(); break;
      case 'KeyG': cb.onGive && cb.onGive(); break;
      case 'Enter': e.preventDefault(); cb.onChat && cb.onChat(); break;
      case 'Escape': cb.onEscape && cb.onEscape(); break;
      case 'KeyT': cb.onEmotePanel && cb.onEmotePanel(); break;
      default:
        if (/^Digit[1-8]$/.test(e.code)) cb.onEmote && cb.onEmote(Number(e.code.slice(5)) - 1);
        else if (e.code.startsWith('Arrow')) e.preventDefault();
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // ── Мышь: ЛКМ по холсту — атака ──
  const cv = document.getElementById('game');
  cv.addEventListener('mousedown', (e) => { if (enabled && e.button === 0 && !isTouchEvent(e)) cb.onAttack && cb.onAttack(); });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── Виртуальный джойстик ──
  const joyEl = document.getElementById('joy'), knob = document.getElementById('joyKnob');
  const R = 50;
  /** Обновляет вектор джойстика по координатам указателя. */
  const upd = (e) => {
    const r = joyEl.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(x, y);
    if (l > R) { x = x / l * R; y = y / l * R; }
    knob.style.transform = `translate(${x}px,${y}px)`;
    const dead = 0.18;
    joy.x = Math.abs(x / R) < dead ? 0 : x / R; joy.y = Math.abs(y / R) < dead ? 0 : y / R;
  };
  joyEl.addEventListener('pointerdown', (e) => { joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); upd(e); e.preventDefault(); });
  joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) upd(e); });
  const end = (e) => { if (e.pointerId === joy.id) { joy = { x: 0, y: 0, id: null }; knob.style.transform = ''; } };
  joyEl.addEventListener('pointerup', end); joyEl.addEventListener('pointercancel', end);

  // ── Кнопки справа ──
  document.querySelectorAll('.tb').forEach((b) => {
    const act = b.dataset.act;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!enabled) return;
      if (act === 'sprint') { sprintBtn = true; b.classList.add('on'); return; }
      const map = { interact: cb.onInteract, attack: cb.onAttack, craft: cb.onCraft, inv: cb.onInv, heal: cb.onHeal, emote: cb.onEmotePanel, chat: cb.onChat };
      if (map[act]) map[act]();
    });
    if (act === 'sprint') {
      const off = () => { sprintBtn = false; b.classList.remove('on'); };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    }
  });
}

/** Событие мыши порождено касанием? (эмуляция мыши на тач-экранах) */
function isTouchEvent(e) { return e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents; }
