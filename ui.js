/**
 * ui.js — всё управление DOM: экраны, HUD, панели, баннеры катаклизмов, лента событий, итоги.
 *
 * Что делает этот файл:
 *  Экспортирует функции, которые main.js вызывает при событиях игры. Логики игры здесь нет —
 *  только отображение и сбор действий пользователя (клики по предметам/рецептам).
 *  Все тексты берутся через i18n (t / tn).
 */
import { t, tn, has } from './i18n.js';
import { ITEMS, STRUCTS, RECIPES, STATUSES, CATS, EMOTES } from './shared.js';

/** Короткий доступ к элементу по id. */
export const $ = (id) => document.getElementById(id);

/** Палитра цветов персонажа. */
export const COLORS = ['#ffcc33', '#ff6b6b', '#ff8c42', '#6bd968', '#4fc3f7', '#7c83ff', '#c77dff', '#ff7ac8',
  '#ffffff', '#b0bec5', '#8d6e63', '#26a69a', '#d4e157', '#ef5350', '#42a5f5', '#ab47bc'];

/**
 * Показывает один экран.
 * @param {string} id connect|menu|lobby|game|results
 */
export function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + id));
}

/** Экран, активный сейчас. */
export function currentScreen() {
  const a = document.querySelector('.screen.active');
  return a ? a.id.replace('screen-', '') : '';
}

/**
 * Рисует палитру цветов.
 * @param {string} selected выбранный цвет
 * @param {(c:string)=>void} onPick колбэк выбора
 */
export function renderPalette(selected, onPick) {
  const box = $('colorPalette'); box.innerHTML = '';
  for (const c of COLORS) {
    const d = document.createElement('div');
    d.className = 'sw' + (c === selected ? ' sel' : ''); d.style.background = c;
    d.onclick = () => { onPick(c); renderPalette(c, onPick); };
    box.appendChild(d);
  }
}

/** Экран подключения: счётчики попыток. */
export function setConnect(s) {
  $('connectAttempt').textContent = t('connect.attempt', { n: s.attempt });
  $('connectElapsed').textContent = t('connect.elapsed', { n: s.elapsed });
  $('connectRetry').classList.toggle('hidden', s.state !== 'failed');
  if (s.state === 'failed') $('connectAttempt').textContent = t('connect.failed');
}

/** Баннер «соединение потеряно». */
export function setConnBanner(text) {
  const b = $('connBanner');
  if (!text) b.classList.add('hidden'); else { b.textContent = text; b.classList.remove('hidden'); }
}

/** Тост-уведомление. */
export function toast(text, ok = false) {
  const el = document.createElement('div'); el.className = 'toast' + (ok ? ' ok' : ''); el.textContent = text;
  $('toasts').appendChild(el); setTimeout(() => el.remove(), 3200);
}

/** Ошибка в меню. */
export function menuError(text) { $('menuError').textContent = text || ''; }

/**
 * Лобби: код, список игроков, настройки, кнопки.
 * @param {Object} room сообщение room
 * @param {number} meId id клиента
 */
export function renderLobby(room, meId) {
  $('lobbyCode').textContent = room.code;
  $('lobbyCount').textContent = t('lobby.count', { n: room.players.length, max: room.max });
  const ul = $('lobbyPlayers'); ul.innerHTML = '';
  for (const p of room.players) {
    const li = document.createElement('li');
    const tags = [];
    if (p.id === room.hostId) tags.push(`<span class="tag host">${t('lobby.host')}</span>`);
    if (p.id === meId) tags.push(`<span class="tag">${t('lobby.you')}</span>`);
    tags.push(p.connected ? `<span class="tag ${p.ready ? 'ok' : ''}">${t(p.ready ? 'lobby.isready' : 'lobby.notready')}</span>` : `<span class="tag off">${t('lobby.offline')}</span>`);
    li.innerHTML = `<span class="dot" style="background:${p.color}"></span><span class="nm"></span>${tags.join('')}`;
    li.querySelector('.nm').textContent = p.name;
    ul.appendChild(li);
  }
  const host = room.hostId === meId;
  $('optPvp').checked = !!room.settings.pvp; $('optChaos').checked = !!room.settings.chaos;
  $('optPvp').disabled = $('optChaos').disabled = !host;
  $('lobbyHostOnly').classList.toggle('hidden', host);
  $('btnStart').classList.toggle('hidden', !host);
  const me = room.players.find((p) => p.id === meId);
  $('btnReady').textContent = t(me && me.ready ? 'lobby.unready' : 'lobby.ready');
}

/**
 * Добавляет строку чата в контейнер.
 * @param {HTMLElement} box контейнер
 * @param {string} name ник
 * @param {string} color цвет
 * @param {string} text сообщение
 * @param {boolean} fade исчезать со временем (игровой чат)
 */
export function addChat(box, name, color, text, fade) {
  const d = document.createElement('div');
  const b = document.createElement('b'); b.style.color = color; b.textContent = name + ': ';
  d.appendChild(b); d.appendChild(document.createTextNode(text));
  box.appendChild(d);
  while (box.children.length > (fade ? 5 : 80)) box.firstChild.remove();
  if (fade) { setTimeout(() => d.classList.add('old'), 7000); setTimeout(() => d.remove(), 8500); } else box.scrollTop = box.scrollHeight;
}

/** Запись в ленту событий. */
export function addLog(kind, text) {
  const box = $('eventLog');
  const d = document.createElement('div'); d.className = kind || 'info'; d.textContent = text;
  box.appendChild(d);
  while (box.children.length > 6) box.firstChild.remove();
  setTimeout(() => d.classList.add('old'), 7000); setTimeout(() => d.remove(), 8500);
}

/** Перевод log-сообщения сервера. */
export function logText(m) {
  const key = 'log.' + m.key;
  const args = { ...(m.args || {}) };
  if (args.item) { const k = Object.keys(ITEMS).find((x) => ITEMS[x].name === args.item); if (k) args.item = tn('item', k); }
  return has(key) ? t(key, args) : (m.msg || '');
}

/** Обновление полосок HUD. */
export function updateHUD(me) {
  const set = (id, v) => {
    const el = $(id), p = Math.max(0, Math.min(100, v));
    el.querySelector('i').style.width = p + '%'; el.querySelector('b').textContent = Math.round(p);
    el.classList.toggle('low', p < 20);
  };
  set('barHp', me.hp); set('barHunger', me.hunger); set('barThirst', me.thirst); set('barStamina', me.stamina); set('barSanity', me.sanity);
  $('barHp').title = t('hud.hp'); $('barHunger').title = t('hud.hunger'); $('barThirst').title = t('hud.thirst');
  $('barStamina').title = t('hud.stamina'); $('barSanity').title = t('hud.sanity');
  $('tempVal').textContent = me.temp.toFixed(1);
  const tb = $('tempBox'); tb.classList.toggle('hot', me.temp > 38.5); tb.classList.toggle('cold', me.temp < 35); tb.title = t('hud.temp');
  const st = $('statuses'); st.innerHTML = '';
  for (const s of me.statuses) {
    const def = STATUSES[s.s]; if (!def) continue;
    const sp = document.createElement('span'); sp.className = def.neg ? 'neg' : ''; sp.textContent = def.icon + (s.t > 0 ? ' ' + s.t : ''); sp.title = tn('status', s.s, def.name);
    st.appendChild(sp);
  }
  const pb = $('protBox'), tags = me.prot.slice(0, 9);
  const extra = [];
  if (me.near && me.near.campfire) extra.push('🔥 ' + t('hud.nearfire'));
  if (me.raft) extra.push('🛶 ' + t('hud.raft'));
  const txt = [...extra, tags.length ? '🛡 ' + tags.map((x) => tn('tag', x)).join(', ') : ''].filter(Boolean).join(' · ');
  pb.textContent = txt; pb.classList.toggle('on', !!txt);
  $('blindOverlay').classList.toggle('on', me.statuses.some((s) => s.s === 'blind'));
}

/** Таймер до следующего катаклизма. */
export function setNext(nx) {
  const el = $('nextTimer');
  if (nx < 0) { el.textContent = t('hud.nonext'); el.className = 'next'; return; }
  el.textContent = t('hud.next', { n: nx });
  el.className = 'next' + (nx <= 5 ? ' now' : nx <= 12 ? ' soon' : '');
}

/** Иконки предметов/построек, дающих защиту от тега. */
function protectors(tag) {
  const out = [];
  for (const [k, it] of Object.entries(ITEMS)) if (it.gear && it.gear.includes(tag)) out.push(it.icon);
  for (const [k, s] of Object.entries(STRUCTS)) if (s.prot.includes(tag)) out.push(s.icon);
  return out;
}

const bannerEls = new Map();
/**
 * Обновляет баннеры активных/предстоящих катаклизмов.
 * @param {Object[]} cats state.cats
 */
export function updateBanners(cats) {
  const box = $('banners'), alive = new Set();
  for (const c of cats) {
    alive.add(c.uid);
    let el = bannerEls.get(c.uid);
    if (!el) {
      el = document.createElement('div'); el.className = 'ban';
      el.style.setProperty('--c', (CATS[c.cat] && CATS[c.cat].color) || '#ff7a3d');
      const icons = new Set(); for (const tg of c.counter || []) for (const i of protectors(tg)) icons.add(i);
      el.innerHTML = '<div class="t"><span class="n"></span><em></em></div><div class="d"></div><div class="g"></div><div class="g c"></div><div class="pb"><i></i></div>';
      el.querySelector('.d').textContent = c.desc || '';
      el.querySelector('.g').textContent = (c.tags && c.tags.length) ? t('banner.threat') + ' ' + c.tags.map((x) => tn('tag', x)).join(', ') : '';
      el.querySelector('.c').textContent = (c.counter && c.counter.length) ? t('banner.counter') + ' ' + [...icons].slice(0, 8).join(' ') + ' (' + c.counter.slice(0, 4).map((x) => tn('tag', x)).join(', ') + ')' : '';
      if (!c.tags || !c.tags.length) el.querySelector('.g').remove();
      if (!c.counter || !c.counter.length) el.querySelector('.c').remove();
      box.appendChild(el); bannerEls.set(c.uid, el);
    }
    const ci = (CATS[c.cat] && CATS[c.cat].icon) || '⚠️';
    el.classList.toggle('warn', c.phase === 'warn');
    el.querySelector('.n').innerHTML = `${ci} `; el.querySelector('.n').append(c.name);
    const stars = '★'.repeat(Math.min(10, c.sev));
    const left = c.phase === 'warn' ? (c.silent ? t('banner.warn.sudden') : t('banner.warn', { n: Math.max(0, Math.ceil(c.warnLeft)) })) : t('banner.active', { n: Math.max(0, Math.ceil(c.tLeft)) });
    el.querySelector('em').innerHTML = `<span class="sev" title="${t('banner.sev')}">${stars.slice(0, 5)}</span> `; el.querySelector('em').append(left);
    const frac = c.phase === 'warn' ? c.warnLeft / (c.warnTotal || 1) : c.tLeft / (c.durTotal || 1);
    el.querySelector('.pb i').style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
  }
  for (const [uid, el] of bannerEls) if (!alive.has(uid)) { el.remove(); bannerEls.delete(uid); }
}

/** Сбрасывает баннеры (новая игра). */
export function clearBanners() { $('banners').innerHTML = ''; bannerEls.clear(); }

/** Панели: переключение/закрытие. */
export function togglePanel(id) { const el = $(id); const on = el.classList.contains('hidden'); closePanels(); if (on) el.classList.remove('hidden'); return on; }
export function closePanels() { for (const id of ['invPanel', 'craftPanel', 'emotePanel']) $(id).classList.add('hidden'); }
export function panelOpen(id) { return !$(id).classList.contains('hidden'); }

/**
 * Инвентарь.
 * @param {Object} me состояние игрока
 * @param {(item:string)=>void} onClick клик по предмету (использовать / отдать в режиме передачи)
 * @param {(item:string)=>void} onGive кнопка «→»
 */
export function renderInventory(me, onClick, onGive) {
  const box = $('invList'); box.innerHTML = '';
  const keys = Object.keys(me.inv);
  if (!keys.length) { box.innerHTML = `<p class="hint">${t('inv.empty')}</p>`; return; }
  for (const k of keys) {
    const it = ITEMS[k]; if (!it) continue;
    const usable = !!(it.eat || it.drink || it.heal || it.sanity);
    const d = document.createElement('div'); d.className = 'slot' + (usable ? '' : ' gear');
    d.innerHTML = `<div class="ic">${it.icon}</div><div class="nm">${tn('item', k, it.name)}</div><div class="n">${me.inv[k]}</div>${it.gear ? '<div class="gv">🛡</div>' : ''}`;
    d.title = it.gear ? it.gear.map((x) => tn('tag', x)).join(', ') : '';
    if (usable) d.onclick = () => onClick(k);
    const g = document.createElement('button'); g.className = 'chip'; g.style.cssText = 'position:absolute;right:3px;bottom:3px;padding:1px 6px;font-size:11px';
    g.textContent = '→'; g.title = t('inv.give'); g.onclick = (e) => { e.stopPropagation(); onGive(k); };
    d.appendChild(g); box.appendChild(d);
  }
}

/**
 * Меню крафта.
 * @param {Object} me состояние игрока
 * @param {(r:Object)=>void} onMake действие по рецепту
 */
export function renderCraft(me, onMake) {
  const box = $('craftList'); box.innerHTML = '';
  for (const r of RECIPES) {
    const info = r.kind === 'item' ? ITEMS[r.id] : STRUCTS[r.id];
    let ok = true;
    const cost = Object.entries(r.cost).map(([k, n]) => {
      const have = me.inv[k] || 0; if (have < n) ok = false;
      return `<span class="${have < n ? 'lack' : ''}">${ITEMS[k].icon} ${have}/${n}</span>`;
    }).join('');
    const needNear = r.near && !(me.near && me.near[r.near]);
    if (needNear) ok = false;
    const prot = r.kind === 'item' ? (info.gear || []) : info.prot;
    const row = document.createElement('div'); row.className = 'rec' + (ok ? '' : ' no');
    row.innerHTML = `<div class="ic">${info.icon}</div><div class="info"><b>${tn(r.kind === 'item' ? 'item' : 'struct', r.id, info.name)}</b> <span class="muted">(${t(r.kind === 'item' ? 'craft.item' : 'craft.struct')})</span>
      <div class="cost">${cost}</div>${r.near ? `<div class="muted">${t('craft.near', { name: tn('struct', r.near) })}</div>` : ''}
      ${prot.length ? `<div class="prot2">🛡 ${prot.slice(0, 10).map((x) => tn('tag', x)).join(', ')}</div>` : ''}</div>`;
    const b = document.createElement('button'); b.className = 'btn small'; b.textContent = t(r.kind === 'item' ? 'craft.make' : 'craft.place'); b.disabled = !ok;
    b.onclick = () => onMake(r);
    row.appendChild(b); box.appendChild(row);
  }
}

/** Панель эмоций. */
export function renderEmotes(onPick) {
  const box = $('emotePanel'); box.innerHTML = '';
  EMOTES.forEach((e, i) => { const b = document.createElement('button'); b.textContent = e; b.onclick = () => onPick(i); box.appendChild(b); });
}

/** Панель наблюдения. */
export function showSpec(name) {
  const el = $('specBar');
  if (!name) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden'); $('specName').textContent = t('spec.title', { name });
}

/** Форматирует секунды как м:сс. */
function fmtTime(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

/**
 * Экран результатов.
 * @param {Object} end сообщение end
 * @param {number} meId id клиента
 * @param {boolean} isHost хост ли клиент
 */
export function renderResults(end, meId, isHost) {
  const win = end.results.find((r) => r.id === end.winnerId);
  $('resWinner').textContent = win ? t('results.winner', { name: win.name }) : t('results.nowinner');
  $('resDuration').textContent = t('results.duration', { t: fmtTime(end.duration) });
  const body = $('resBody'); body.innerHTML = '';
  for (const r of end.results) {
    const tr = document.createElement('tr');
    if (r.id === end.winnerId) tr.className = 'win'; else if (r.id === meId) tr.className = 'me';
    tr.innerHTML = `<td>${r.rank}</td><td><span class="dot" style="display:inline-block;vertical-align:middle;background:${r.color}"></span> <span class="n"></span></td><td>${fmtTime(r.time)}</td><td>${t(r.alive ? 'results.alive.y' : 'results.alive.n')}</td><td>${r.res}</td><td>${r.surv}</td><td>${r.help}</td><td>${r.kills}</td>`;
    tr.querySelector('.n').textContent = r.name;
    body.appendChild(tr);
  }
  $('btnRematch').classList.toggle('hidden', !isHost);
  $('resWait').classList.toggle('hidden', isHost);
}
