/**
 * main.js — оркестратор клиента ISLAND OF CHAOS.
 *
 * Что делает этот файл:
 *  - связывает сеть (net.js), ввод (input.js), отрисовку (render.js), звук (audio.js), интерфейс (ui.js);
 *  - хранит состояние `state` (см. PROTOCOL.md) и обрабатывает ВСЕ сообщения сервера;
 *  - отправляет ввод ~30 раз/сек и предсказывает движение своего игрока (moveStep из shared.js),
 *    затем сверяет предсказание с авторитетным снапшотом (реконсиляция по ack);
 *  - интерполирует чужих игроков и мобов (между двумя последними снапшотами);
 *  - управляет экранами: подключение → меню → лобби → игра → итоги.
 */
import { moveStep, EMOTES, ITEMS, CATS } from './shared.js';
import { Net } from './net.js';
import { Renderer } from './render.js';
import { initInput, getAxis, setInputEnabled, isTouch } from './input.js';
import { initAudio, resumeAudio, setMuted, isMuted, playSound, setSiren, setAmbient } from './audio.js';
import { t, setLang, getLang, applyI18n } from './i18n.js';
import * as ui from './ui.js';
const $ = ui.$;

/* ───────────── Состояние ───────────── */

/** Состояние для рендерера (структура описана в PROTOCOL.md). */
const state = {
  size: 64, tiles: null, flags: null, meId: 0, me: null, camera: { x: 32, y: 32 },
  players: [], mobs: [], loot: [], structs: [], cats: [], fxQueue: [], time: 0,
};
const ls = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

let profile = { name: ls.get('ioc_name', ''), color: ls.get('ioc_color', ui.COLORS[0]) };
let myId = null, room = null, hasOpened = false, inGame = false, ended = false;
let pred = { x: 32, y: 32, dir: 0 };          // предсказанная позиция
let predErr = { x: 0, y: 0 };                  // сглаживание расхождения
let pending = [];                              // неподтверждённые вводы
let seq = 0, lastInputAt = 0, lastSendAt = 0, lastAxisKey = '';
let snapAt = 0, snapInterval = 50;
let lastHp = 100, giveMode = false, specIdx = 0;
const ents = { players: new Map(), mobs: new Map() };   // для интерполяции
const emotes = new Map();                               // id → {e,t0}
let hudTimer = 0, panelTimer = 0;

const renderer = new Renderer($('game'));

/* ───────────── Сеть ───────────── */

const net = new Net({
  getHello: () => ({ name: profile.name, color: profile.color, token: ls.get('ioc_token', '') }),
  onMessage: onMessage,
  onPing: (ms) => { $('pingBox').textContent = t('hud.ping', { n: ms }); },
  onStatus: (s) => {
    if (s.state === 'open') {
      ui.setConnBanner('');
      if (!hasOpened) { hasOpened = true; ui.show('menu'); } else ui.toast(t('connect.restored'), true);
    } else if (!hasOpened) { ui.setConnect(s); }
    else if (s.state === 'closed' || s.state === 'connecting') ui.setConnBanner(t('connect.lost', { n: s.attempt }));
  },
});

/**
 * Обработка сообщения сервера.
 * @param {Object} m сообщение
 */
function onMessage(m) {
  switch (m.t) {
    case 'welcome': {
      const changed = myId !== null && myId !== m.id;
      myId = m.id; ls.set('ioc_token', m.token);
      if (changed) { // сервер перезапущен/забыл нас — возвращаемся в меню
        room = null; inGame = false; stopGame(); ui.show('menu'); ui.toast(t('err.offline'));
      }
      break;
    }
    case 'room': onRoom(m); break;
    case 'error': ui.toast(m.msg || m.code); ui.menuError(m.msg || ''); break;
    case 'init': onInit(m); break;
    case 'snap': onSnap(m); break;
    case 'tiles': if (state.tiles) renderer.applyTiles(m.d); break;
    case 'structs': onStructs(m); break;
    case 'cata': onCata(m); break;
    case 'log': onLog(m); break;
    case 'chat':
      if (inGame) ui.addChat($('gameChat'), m.name, m.color, m.text, true);
      ui.addChat($('lobbyChatLog'), m.name, m.color, m.text, false);
      break;
    case 'emote': emotes.set(m.from, { e: m.e, t0: performance.now() }); if (m.from !== myId) playSound('emote', 0.6); break;
    case 'end': onEnd(m); break;
    default: break;
  }
}

/** Состояние комнаты. */
function onRoom(m) {
  if (!m.code) { room = null; if (ui.currentScreen() !== 'menu') { stopGame(); ui.show('menu'); } return; }
  room = m;
  if (m.state === 'lobby') {
    if (ui.currentScreen() !== 'lobby') { stopGame(); ui.show('lobby'); }
    ui.renderLobby(m, myId);
  } else if (ui.currentScreen() === 'menu' || ui.currentScreen() === 'connect') ui.show('lobby');
  if (m.state === 'lobby') ui.renderLobby(m, myId);
}

/** Начало игры (или возврат в неё). */
function onInit(m) {
  ended = false; inGame = true;
  state.size = m.size; state.tiles = Uint8Array.from(m.tiles); state.flags = Uint8Array.from(m.flags);
  state.meId = m.youId; state.structs = m.structs.slice(); state.players = []; state.mobs = []; state.loot = []; state.cats = [];
  state.fxQueue = []; ents.players.clear(); ents.mobs.clear(); pending = []; seq = 0; emotes.clear();
  ui.clearBanners(); $('eventLog').innerHTML = ''; $('gameChat').innerHTML = '';
  renderer.resize(); renderer.setWorld(m.size, state.tiles, state.flags);
  for (const c of m.cats || []) onCata(c);
  state.me = null; ui.showSpec(null); ui.closePanels();
  ui.show('game'); setInputEnabled(true); $('touch').classList.toggle('hidden', !isTouch());
  playSound('start');
  lastFrame = performance.now();
  if (!loopRunning) { loopRunning = true; requestAnimationFrame(frame); }
}

/** Выход из игрового режима. */
function stopGame() {
  inGame = false; setInputEnabled(false); setSiren(false); setAmbient(null); ui.closePanels();
}

/** Конец раунда. */
function onEnd(m) {
  ended = true; inGame = false; setInputEnabled(false); setSiren(false); setAmbient(null); playSound('end');
  ui.renderResults(m, myId, room && room.hostId === myId);
  setTimeout(() => { if (ended) ui.show('results'); }, 1200);
}

/** Изменения построек. */
function onStructs(m) {
  if (m.add) for (const s of m.add) state.structs.push(s);
  if (m.del) state.structs = state.structs.filter((s) => !m.del.includes(s.id));
  if (m.upd) for (const u of m.upd) { const s = state.structs.find((x) => x.id === u.id); if (s) s.hp = u.hp; }
}

/** События катаклизмов. */
function onCata(m) {
  if (m.ev === 'end') {
    state.cats = state.cats.filter((c) => c.uid !== m.uid); updateAudioForCats(); return;
  }
  let c = state.cats.find((x) => x.uid === m.uid);
  if (!c) {
    c = { uid: m.uid, name: m.name, desc: m.desc, cat: m.cat, sev: m.sev, zone: m.zone, vis: m.vis, snd: m.snd, silent: m.silent, tags: m.tags, counter: m.counter, phase: 'warn', warnLeft: 0, warnTotal: m.warn || 1, tLeft: m.dur, durTotal: m.dur };
    state.cats.push(c);
  }
  if (m.ev === 'warn') {
    c.phase = 'warn'; c.warnLeft = m.warn; c.warnTotal = Math.max(m.warn, 1);
    if (!m.silent) playSound('warn');
  } else if (m.ev === 'start') {
    c.phase = 'active'; c.tLeft = m.dur; c.durTotal = m.dur; c.warnLeft = 0;
    playSound(m.silent ? 'warn' : 'start'); playSound(m.snd || 'rumble', 0.8);
  }
  updateAudioForCats();
}

/** Сирена и фоновый звук по текущим катаклизмам. */
function updateAudioForCats() {
  setSiren(state.cats.some((c) => c.phase === 'warn' && !c.silent));
  const act = state.cats.filter((c) => c.phase === 'active').sort((a, b) => b.sev - a.sev)[0];
  const amb = act && ['rumble', 'wind', 'water', 'buzz', 'wail'].includes(act.snd) ? act.snd : null;
  setAmbient(amb);
}

/** Сообщение ленты событий + звуки. */
function onLog(m) {
  const text = ui.logText(m);
  if (inGame && text) ui.addLog(m.kind, text);
  if (m.key === 'eat') playSound('eat'); else if (m.key === 'drink') playSound('drink');
  else if (m.key === 'gathered') playSound('gather', 0.6); else if (m.key === 'crafted' || m.key === 'built') playSound('craft');
  else if (m.key === 'died') playSound('death', 0.6); else if (m.key === 'stole') playSound('hurt', 0.5);
}

/** Снапшот состояния от сервера. */
function onSnap(m) {
  const now = performance.now();
  if (snapAt) snapInterval = Math.min(150, Math.max(30, now - snapAt)); snapAt = now;
  const me = m.me, prev = state.me;
  // звуки по изменению здоровья
  if (prev && me.hp < lastHp - 2.5) playSound('hurt', Math.min(1, (lastHp - me.hp) / 20));
  lastHp = me.hp;
  state.me = { ...me }; state.time = m.tm; ui.setNext(m.nx);
  // реконсиляция предсказания
  const old = { x: pred.x + predErr.x, y: pred.y + predErr.y };
  pending = pending.filter((i) => i.seq > m.ack);
  const p = { x: me.x, y: me.y, dir: pred.dir };
  if (me.alive) for (const i of pending) stepLocal(p, i.dx, i.dy, i.sprint, i.dt);
  const dist = Math.hypot(old.x - p.x, old.y - p.y);
  if (dist > 2 || !prev) { predErr.x = predErr.y = 0; } else { predErr.x = old.x - p.x; predErr.y = old.y - p.y; }
  pred.x = p.x; pred.y = p.y;
  // игроки
  const seen = new Set();
  state.players = m.p.map((s) => {
    seen.add(s.id);
    let e = ents.players.get(s.id);
    const info = room && room.players ? room.players.find((x) => x.id === s.id) : null;
    if (!e) { e = { id: s.id, name: info ? info.name : '?', color: info ? info.color : '#fff', rx: s.x, ry: s.y, px: s.x, py: s.y, x: s.x, y: s.y }; ents.players.set(s.id, e); }
    else if (info) { e.name = info.name; e.color = info.color; }
    e.px = e.rx; e.py = e.ry; e.x = s.x; e.y = s.y; e.hp = s.hp; e.d = s.d; e.al = s.al; e.sp = s.sp; e.s = s.s; e.t0 = now;
    const em = emotes.get(s.id); e.emote = em && now - em.t0 < 2500 ? em : null;
    return e;
  });
  // мобы
  const mseen = new Set();
  state.mobs = m.m.map((s) => {
    mseen.add(s.id);
    let e = ents.mobs.get(s.id);
    if (!e) { e = { id: s.id, k: s.k, rx: s.x, ry: s.y, px: s.x, py: s.y }; ents.mobs.set(s.id, e); }
    e.px = e.rx; e.py = e.ry; e.x = s.x; e.y = s.y; e.hp = s.hp; e.mh = s.mh; e.t0 = now;
    return e;
  });
  for (const id of [...ents.mobs.keys()]) if (!mseen.has(id)) ents.mobs.delete(id);
  state.loot = m.l;
  // события эффектов + звуки
  for (const f of m.fx) {
    state.fxQueue.push(f);
    const near = Math.hypot(f.x - state.me.x, f.y - state.me.y) < 14;
    if (!near) continue;
    const snd = { boom: 'boom', bolt: 'zap', splash: 'pop', death: 'death', hit: 'hit', heal: 'chime', tele: 'zap' }[f.k];
    if (snd) playSound(snd, 0.55);
  }
}

/** Один шаг локального предсказания. */
function stepLocal(p, dx, dy, sprint, dt) {
  const me = state.me; if (!me || !state.tiles) return;
  const inv = me.invert ? -1 : 1;
  moveStep(state.tiles, state.flags, p, dx * inv, dy * inv, sprint && me.stamina > 0, dt, me.sm || 1, me.raft);
}

/* ───────────── Игровой цикл ───────────── */

let lastFrame = 0, loopRunning = false;

/** Кадр: ввод, предсказание, интерполяция, отрисовка. */
function frame(now) {
  if (!inGame) { loopRunning = false; return; }
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  const me = state.me;
  if (me && state.tiles) {
    // ввод ~30 Гц
    if (me.alive && now - lastInputAt >= 33 && !isTyping()) {
      const ax = getAxis(), idt = Math.min(0.1, (now - lastInputAt) / 1000); lastInputAt = now;
      const moving = Math.hypot(ax.dx, ax.dy) > 0.05, key = `${ax.dx.toFixed(2)},${ax.dy.toFixed(2)},${ax.sprint}`;
      if (moving || key !== lastAxisKey || pending.length || now - lastSendAt > 250) {
        const inp = { seq: ++seq, dx: +ax.dx.toFixed(3), dy: +ax.dy.toFixed(3), sprint: ax.sprint, dt: +idt.toFixed(3) };
        if (net.send({ t: 'input', ...inp })) {
          pending.push(inp); if (pending.length > 60) pending.shift();
          stepLocal(pred, inp.dx, inp.dy, inp.sprint, inp.dt);
          lastSendAt = now;
        }
        lastAxisKey = key;
      }
    }
    // затухание ошибки предсказания
    const k = Math.pow(0.002, dt); predErr.x *= k; predErr.y *= k;
    // интерполяция чужих
    const a = (n, e) => Math.min(1, (n - e.t0) / (snapInterval * 1.05));
    for (const e of state.players) { const al = a(now, e); e.rx = e.px + (e.x - e.px) * al; e.ry = e.py + (e.y - e.py) * al; }
    for (const e of state.mobs) { const al = a(now, e); e.rx = e.px + (e.x - e.px) * al; e.ry = e.py + (e.y - e.py) * al; }
    // свой игрок — по предсказанию
    const meEnt = state.players.find((p) => p.id === state.meId);
    if (meEnt && me.alive) { meEnt.rx = pred.x + predErr.x; meEnt.ry = pred.y + predErr.y; meEnt.d = pred.dir; }
    state.me.x = pred.x + predErr.x; state.me.y = pred.y + predErr.y;
    updateCamera(dt);
    // локальные таймеры катаклизмов
    for (const c of state.cats) { if (c.phase === 'warn') c.warnLeft -= dt; else c.tLeft -= dt; }
    // HUD ~10 Гц
    hudTimer += dt; if (hudTimer > 0.1) { hudTimer = 0; ui.updateHUD(me); ui.updateBanners(state.cats); }
    panelTimer += dt; if (panelTimer > 0.4) { panelTimer = 0; refreshPanels(); }
  }
  renderer.draw(state, dt);
  renderer.drawMinimap($('minimap'), state);
  requestAnimationFrame(frame);
}

/** Камера: свой игрок или наблюдаемый. */
function updateCamera(dt) {
  const me = state.me; let tx = state.me.x, ty = state.me.y;
  if (!me.alive) {
    const alive = state.players.filter((p) => p.al && p.id !== state.meId);
    if (alive.length) {
      specIdx = ((specIdx % alive.length) + alive.length) % alive.length;
      const p = alive[specIdx]; tx = p.rx; ty = p.ry; ui.showSpec(p.name);
    } else ui.showSpec(null);
  }
  const k = Math.min(1, dt * 10);
  state.camera.x += (tx - state.camera.x) * k; state.camera.y += (ty - state.camera.y) * k;
}

/** Обновляет открытые панели (инвентарь/крафт). */
function refreshPanels() {
  if (!state.me) return;
  if (ui.panelOpen('invPanel')) ui.renderInventory(state.me, onInvClick, (k) => net.send({ t: 'give', item: k }));
  if (ui.panelOpen('craftPanel')) ui.renderCraft(state.me, onCraft);
}

/** Идёт ли ввод текста. */
function isTyping() { const a = document.activeElement; return a && a.tagName === 'INPUT'; }

/* ───────────── Действия ───────────── */

/** Клик по предмету: использовать или отдать (режим передачи). */
function onInvClick(item) {
  if (giveMode) { net.send({ t: 'give', item }); giveMode = false; } else net.send({ t: 'use', item });
}
/** Рецепт крафта/постройки. */
function onCraft(r) { net.send({ t: r.kind === 'item' ? 'craft' : 'place', id: r.id }); }
/** Эмоция по индексу. */
function sendEmote(i) { if (EMOTES[i]) { net.send({ t: 'emote', e: EMOTES[i] }); ui.closePanels(); } }

initInput({
  onInteract: () => net.send({ t: 'interact' }),
  onAttack: () => { net.send({ t: 'attack' }); playSound('hit', 0.3); },
  onCraft: () => { if (ui.togglePanel('craftPanel') && state.me) ui.renderCraft(state.me, onCraft); },
  onInv: () => { giveMode = false; if (ui.togglePanel('invPanel') && state.me) ui.renderInventory(state.me, onInvClick, (k) => net.send({ t: 'give', item: k })); },
  onHeal: () => net.send({ t: 'heal' }),
  onGive: () => { giveMode = true; if (!ui.panelOpen('invPanel')) { ui.togglePanel('invPanel'); } ui.renderInventory(state.me, onInvClick, (k) => net.send({ t: 'give', item: k })); ui.toast(t('inv.givemode'), true); },
  onChat: () => { const f = $('chatForm'); f.classList.remove('hidden'); $('chatInput').focus(); },
  onEmote: sendEmote,
  onEmotePanel: () => { if (ui.togglePanel('emotePanel')) ui.renderEmotes(sendEmote); },
  onEscape: () => { ui.closePanels(); $('chatForm').classList.add('hidden'); giveMode = false; },
});
document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => $(b.dataset.close).classList.add('hidden'); });
$('chatForm').onsubmit = (e) => {
  e.preventDefault(); const v = $('chatInput').value.trim();
  if (v) net.send({ t: 'chat', text: v });
  $('chatInput').value = ''; $('chatInput').blur(); $('chatForm').classList.add('hidden');
};
$('specPrev').onclick = () => { specIdx--; }; $('specNext').onclick = () => { specIdx++; };
$('btnLeaveGame').onclick = () => { if (confirm(t('hud.leave.confirm'))) { net.send({ t: 'leave' }); stopGame(); ui.show('menu'); } };

/* ───────────── Меню и лобби ───────────── */

/** Сохраняет профиль и отправляет его на сервер. */
function pushProfile() {
  profile.name = $('nameInput').value.trim().slice(0, 16);
  ls.set('ioc_name', profile.name); ls.set('ioc_color', profile.color);
  net.send({ t: 'profile', name: profile.name, color: profile.color });
}
/** Проверка ника перед входом. */
function needName() { pushProfile(); if (!profile.name) { ui.menuError(t('err.name')); return false; } ui.menuError(''); return true; }

$('btnCreate').onclick = () => { if (needName()) net.send({ t: 'create' }); };
$('btnQuick').onclick = () => { if (needName()) net.send({ t: 'quick' }); };
$('btnJoin').onclick = () => {
  if (!needName()) return;
  const code = $('codeInput').value.trim().toUpperCase();
  if (!code) { ui.menuError(t('err.code')); return; }
  net.send({ t: 'join', code });
};
$('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnJoin').click(); });
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnCreate').click(); });
$('btnReady').onclick = () => { const me = room && room.players.find((p) => p.id === myId); net.send({ t: 'ready', ready: !(me && me.ready) }); };
$('btnStart').onclick = () => net.send({ t: 'start' });
$('btnLeaveLobby').onclick = () => { net.send({ t: 'leave' }); ui.show('menu'); };
const sendSettings = () => net.send({ t: 'settings', settings: { pvp: $('optPvp').checked, chaos: $('optChaos').checked } });
$('optPvp').onchange = sendSettings; $('optChaos').onchange = sendSettings;
$('lobbyChatForm').onsubmit = (e) => { e.preventDefault(); const v = $('lobbyChatInput').value.trim(); if (v) net.send({ t: 'chat', text: v }); $('lobbyChatInput').value = ''; };
const copy = async (text) => { try { await navigator.clipboard.writeText(text); ui.toast(t('lobby.copied'), true); } catch { prompt('', text); } };
$('btnCopy').onclick = () => room && copy(room.code);
$('btnCopyLink').onclick = () => room && copy(`${location.origin}/?room=${room.code}`);
$('btnRematch').onclick = () => net.send({ t: 'rematch' });
$('btnResLeave').onclick = () => { net.send({ t: 'leave' }); ended = false; ui.show('menu'); };
$('connectRetry').onclick = () => { $('connectRetry').classList.add('hidden'); net.retry(); };

/** Обновляет подписи с учётом языка. */
function refreshText() {
  applyI18n(document);
  $('menuHelp').textContent = t(isTouch() ? 'menu.help.touch' : 'menu.help');
  $('langBtn').textContent = getLang().toUpperCase();
  document.querySelectorAll('[data-sound-toggle]').forEach((b) => { b.textContent = isMuted() ? '🔇' : '🔊'; });
  if (room && room.state === 'lobby') ui.renderLobby(room, myId);
}
$('langBtn').onclick = () => { setLang(getLang() === 'ru' ? 'en' : 'ru'); refreshText(); };
document.querySelectorAll('[data-sound-toggle]').forEach((b) => { b.onclick = () => { setMuted(!isMuted()); refreshText(); }; });

// Аудио нельзя запускать без жеста пользователя
const unlock = () => { initAudio(); resumeAudio(); };
window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));

/* ───────────── Запуск ───────────── */

$('nameInput').value = profile.name;
ui.renderPalette(profile.color, (c) => { profile.color = c; ls.set('ioc_color', c); });
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) $('codeInput').value = urlRoom.toUpperCase().slice(0, 4);
renderer.resize();
refreshText();
ui.setConnect({ state: 'connecting', attempt: 1, elapsed: 0 });
net.connect();
