/**
 * rooms.js — комнаты, лобби, сессии игроков и маршрутизация сообщений.
 *
 * Что делает этот файл:
 *  Класс RoomManager обслуживает все WebSocket-подключения:
 *   - hello: регистрация игрока (ник, цвет) либо переподключение по token (в течение 60 с);
 *   - create / join / quick / leave: создание комнаты по коду, вход, быстрый поиск;
 *   - ready / settings / start: готовность, настройки хоста (PvP, Хаос), запуск раунда;
 *   - input / interact / attack / craft / place / use / give / heal: пересылаются в Game;
 *   - chat / emote: чат и быстрые эмоции с ограничением частоты;
 *   - rematch: возврат комнаты в лобби после конца раунда;
 *   - tick(): шаг всех идущих игр + обслуживание таймаутов отключений.
 *  Защита от флуда: у каждого соединения «ведро токенов» (общее и для чата).
 */
import { randomBytes } from 'node:crypto';
import { MAX_PLAYERS, EMOTES, VERSION } from './shared.js';
import { Game } from './game.js';
import { sanitizeName, sanitizeColor, sanitizeChat, sanitizeCode } from './validate.js';
import { TokenBucket } from './rateLimit.js';

/** Сколько секунд сохраняется место отключившегося игрока в игре. */
const GRACE_PLAYING = 75;
/** Сколько секунд сохраняется место отключившегося в лобби. */
const GRACE_LOBBY = 12;
/** Алфавит кодов комнат (без похожих символов). */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  constructor() {
    /** @type {Map<string, Object>} комнаты по коду */
    this.rooms = new Map();
    /** @type {Map<string, Object>} участники по token */
    this.sessions = new Map();
    this.idSeq = 1;
    this.lastTick = Date.now();
  }

  /** Статистика для /health. */
  stats() {
    let players = 0, playing = 0;
    for (const r of this.rooms.values()) { players += r.members.size; if (r.state === 'playing') playing++; }
    return { rooms: this.rooms.size, players, playing };
  }

  /* ───────────── Подключения ───────────── */

  /**
   * Регистрирует новое WebSocket-соединение.
   * @param {import('ws').WebSocket} ws сокет
   */
  attach(ws) {
    const conn = { ws, member: null, bucket: new TokenBucket(90, 140), chat: new TokenBucket(1.2, 4), strikes: 0 };
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      if (!conn.bucket.take()) { if (++conn.strikes > 400) ws.close(1008, 'rate limit'); return; }
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      try { this.onMessage(conn, msg); } catch (e) { console.error('[rooms] ошибка обработчика', msg.t, e); }
    });
    ws.on('close', () => this.onClose(conn));
    ws.on('error', () => { /* закрытие обработает close */ });
  }

  /** Сокет закрылся: помечаем участника отключённым (место держится). */
  onClose(conn) {
    const m = conn.member;
    if (!m || m.conn !== conn) return;
    m.conn = null; m.connected = false; m.discAt = Date.now();
    const room = this.rooms.get(m.room);
    if (room) {
      if (room.game) room.game.setConnected(m.id, false);
      this.pushRoom(room);
    }
  }

  /** Отправка одному участнику (строка или объект). */
  sendTo(m, msg) {
    const ws = m.conn && m.conn.ws;
    if (!ws || ws.readyState !== 1) return;
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
    if (ws.bufferedAmount > 1_000_000) return;   // медленный клиент — пропускаем кадр
    ws.send(msg);
  }

  /** Отправка ошибки клиенту. */
  err(m, code, msg) { this.sendTo(m, { t: 'error', code, msg }); }

  /* ───────────── Маршрутизация ───────────── */

  /**
   * Обработка одного сообщения клиента.
   * @param {Object} conn соединение
   * @param {Object} msg сообщение
   */
  onMessage(conn, msg) {
    if (msg.t === 'hello') return this.hello(conn, msg);
    const m = conn.member;
    if (!m) return;
    if (msg.t === 'ping') return this.sendTo(m, { t: 'pong', ts: msg.ts });
    // profile: смена ника/цвета до входа в комнату
    if (msg.t === 'profile') { if (!m.room) { m.name = sanitizeName(msg.name) || m.name; m.color = sanitizeColor(msg.color); } return; }
    const room = this.rooms.get(m.room);
    switch (msg.t) {
      case 'create': return this.create(m);
      case 'join': return this.join(m, sanitizeCode(msg.code));
      case 'quick': return this.quick(m);
      case 'leave': return this.leave(m);
      default: break;
    }
    if (!room) return;
    switch (msg.t) {
      case 'ready': if (room.state === 'lobby') { m.ready = !!msg.ready; this.pushRoom(room); } break;
      case 'settings':
        if (room.hostId === m.id && room.state === 'lobby' && msg.settings) {
          room.settings = { pvp: !!msg.settings.pvp, chaos: !!msg.settings.chaos };
          this.pushRoom(room);
        }
        break;
      case 'start': this.start(room, m); break;
      case 'rematch':
        if (room.hostId === m.id && room.state === 'ended') {
          room.state = 'lobby'; room.game = null;
          for (const x of room.members.values()) x.ready = false;
          this.pushRoom(room);
        }
        break;
      case 'chat': {
        if (!conn.chat.take()) return;
        const text = sanitizeChat(msg.text);
        if (text) this.roomBroadcast(room, { t: 'chat', from: m.id, name: m.name, color: m.color, text });
        break;
      }
      case 'emote':
        if (EMOTES.includes(msg.e) && conn.chat.take(0.5)) this.roomBroadcast(room, { t: 'emote', from: m.id, e: msg.e });
        break;
      default:
        if (room.state === 'playing' && room.game) room.game.handle(m.id, msg);
    }
  }

  /** hello: новый игрок или переподключение по token. */
  hello(conn, msg) {
    if (conn.member) return;
    const tok = typeof msg.token === 'string' ? msg.token : '';
    const old = tok && this.sessions.get(tok);
    if (old) {
      // переподключение: старый сокет (если был) закрываем
      if (old.conn && old.conn !== conn) { const oc = old.conn; old.conn = null; try { oc.ws.close(); } catch { /* ignore */ } }
      old.conn = conn; old.connected = true; old.discAt = 0; conn.member = old;
      this.sendTo(old, { t: 'welcome', id: old.id, token: old.token, v: VERSION });
      const room = this.rooms.get(old.room);
      if (room) {
        this.pushRoom(room);
        if (room.game && room.state === 'playing') { room.game.setConnected(old.id, true); this.sendTo(old, room.game.buildInit(old.id)); }
        if (room.state === 'ended' && room.lastEnd) this.sendTo(old, room.lastEnd);
      }
      return;
    }
    const id = this.idSeq++;
    const m = {
      id, token: randomBytes(12).toString('hex'), name: sanitizeName(msg.name) || `Игрок${id}`,
      color: sanitizeColor(msg.color), conn, connected: true, ready: false, room: null, discAt: 0,
    };
    conn.member = m;
    this.sessions.set(m.token, m);
    this.sendTo(m, { t: 'welcome', id, token: m.token, v: VERSION });
  }

  /* ───────────── Комнаты ───────────── */

  /** Генерирует свободный код комнаты. */
  newCode() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  /** Создаёт комнату и делает участника хостом. */
  create(m) {
    this.leave(m, true);
    const code = this.newCode();
    const room = { code, hostId: m.id, members: new Map(), state: 'lobby', settings: { pvp: false, chaos: false }, game: null, lastEnd: null };
    this.rooms.set(code, room);
    this.enter(room, m);
  }

  /** Вход в комнату по коду. */
  join(m, code) {
    if (!code) return this.err(m, 'code', 'Введите код комнаты');
    const room = this.rooms.get(code);
    if (!room) return this.err(m, 'nocode', 'Комната не найдена');
    if (room.members.has(m.id)) return this.pushRoom(room);
    if (room.state !== 'lobby') return this.err(m, 'busy', 'Игра в этой комнате уже идёт');
    if (room.members.size >= MAX_PLAYERS) return this.err(m, 'full', 'Комната заполнена');
    this.leave(m, true);
    this.enter(room, m);
  }

  /** Быстрый поиск: любая открытая комната либо новая. */
  quick(m) {
    for (const room of this.rooms.values()) {
      if (room.state === 'lobby' && room.members.size < MAX_PLAYERS && !room.members.has(m.id)) return this.join(m, room.code);
    }
    this.create(m);
  }

  /** Добавляет участника в комнату и уведомляет всех. */
  enter(room, m) {
    room.members.set(m.id, m); m.room = room.code; m.ready = false;
    this.pushRoom(room);
    this.roomBroadcast(room, { t: 'log', kind: 'info', key: 'joined', args: { name: m.name }, msg: `${m.name} присоединился к игре` });
  }

  /**
   * Выход из комнаты.
   * @param {Object} m участник
   * @param {boolean} [silent] не слать «покинул» (при переходе в другую комнату)
   */
  leave(m, silent) {
    const room = this.rooms.get(m.room);
    if (!room) return;
    room.members.delete(m.id);
    if (room.game && room.state === 'playing') {
      const p = room.game.players.get(m.id);
      if (p && p.alive) room.game.die(p, 'покинул остров');
    }
    m.room = null; m.ready = false;
    this.sendTo(m, { t: 'room', code: null });
    if (!silent) this.roomBroadcast(room, { t: 'log', kind: 'info', key: 'left', args: { name: m.name }, msg: `${m.name} покинул игру` });
    this.afterMemberGone(room);
  }

  /** Проверка пустой комнаты и передача хоста. */
  afterMemberGone(room) {
    if (room.members.size === 0) { this.closeRoom(room); return; }
    if (!room.members.has(room.hostId)) {
      const next = [...room.members.values()].find((x) => x.connected) || [...room.members.values()][0];
      room.hostId = next.id;
      this.roomBroadcast(room, { t: 'log', kind: 'info', key: 'host', args: { name: next.name }, msg: `${next.name} теперь хост` });
    }
    this.pushRoom(room);
  }

  /** Удаляет комнату и сессии её участников. */
  closeRoom(room) {
    this.rooms.delete(room.code);
    room.game = null;
  }

  /** Старт игры (только хост). */
  start(room, m) {
    if (room.hostId !== m.id || room.state !== 'lobby') return;
    const members = [...room.members.values()].filter((x) => x.connected);
    if (!members.length) return;
    room.state = 'playing';
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const self = this;
    room.game = new Game({
      code: room.code, seed, members: members.map((x) => ({ id: x.id, name: x.name, color: x.color })),
      settings: room.settings,
      io: {
        send: (id, msg) => { const x = room.members.get(id); if (x) self.sendTo(x, msg); },
        broadcast: (msg) => self.roomBroadcast(room, msg),
      },
      onEnd: (res) => {
        room.state = 'ended';
        room.lastEnd = { t: 'end', ...res };
        self.roomBroadcast(room, room.lastEnd);
        self.pushRoom(room);
      },
    });
    // участники, не попавшие в игру (отключены), просто остаются наблюдателями лобби
    this.pushRoom(room);
    for (const x of members) this.sendTo(x, room.game.buildInit(x.id));
  }

  /** Рассылка всем подключённым участникам комнаты. */
  roomBroadcast(room, msg) {
    const s = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const x of room.members.values()) this.sendTo(x, s);
  }

  /** Рассылка состояния комнаты. */
  pushRoom(room) {
    this.roomBroadcast(room, {
      t: 'room', code: room.code, hostId: room.hostId, state: room.state, settings: room.settings, max: MAX_PLAYERS,
      players: [...room.members.values()].map((x) => ({ id: x.id, name: x.name, color: x.color, ready: x.ready, connected: x.connected })),
    });
  }

  /* ───────────── Цикл ───────────── */

  /** Шаг всех игр и обслуживание таймаутов. Вызывается ~20 раз/сек. */
  tick() {
    const now = Date.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    for (const room of [...this.rooms.values()]) {
      if (room.state === 'playing' && room.game) room.game.tick(dt);
      // убираем надолго отключённых
      for (const m of [...room.members.values()]) {
        if (m.connected || !m.discAt) continue;
        const grace = room.state === 'playing' ? GRACE_PLAYING : GRACE_LOBBY;
        if (now - m.discAt > grace * 1000) {
          if (room.state === 'lobby') {
            this.roomBroadcast(room, { t: 'log', kind: 'info', key: 'left', args: { name: m.name }, msg: `${m.name} покинул игру` });
          }
          room.members.delete(m.id);
          this.sessions.delete(m.token);
          m.room = null;
          this.afterMemberGone(room);
        }
      }
    }
  }
}
