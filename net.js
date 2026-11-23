/**
 * net.js — сетевой слой клиента: WebSocket с автопереподключением и замером пинга.
 *
 * Что делает этот файл:
 *  - сам определяет адрес сервера: `wss://` на https, `ws://` локально, путь /ws;
 *  - при обрыве или недоступности (например, бесплатный Render «спит» и просыпается до ~60 с)
 *    повторяет попытки с нарастающей задержкой (1, 2, 3, 5 … ≤5 с) до ~90 секунд;
 *  - после открытия соединения сразу отправляет hello (ник, цвет, token для возврата в игру);
 *  - раз в 3 секунды измеряет пинг (ping → pong).
 */

/** Максимальная длительность попыток подряд (мс). */
const GIVE_UP_MS = 120000;

export class Net {
  /**
   * @param {Object} h обработчики
   * @param {() => Object} h.getHello данные для hello: {name,color,token}
   * @param {(m:Object)=>void} h.onMessage входящее сообщение
   * @param {(s:{state:string,attempt:number,elapsed:number})=>void} h.onStatus смена состояния
   * @param {(ms:number)=>void} h.onPing пинг в мс
   */
  constructor(h) {
    this.h = h;
    this.ws = null;
    this.attempt = 0;
    this.startedAt = 0;
    this.timer = null;
    this.pingTimer = null;
    this.closedByUser = false;
    this.open = false;
  }

  /** Адрес WebSocket по текущей странице. */
  url() {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    return `${proto}${location.host}/ws`;
  }

  /** Начинает (или возобновляет) подключение. */
  connect() {
    this.closedByUser = false;
    if (!this.startedAt) this.startedAt = Date.now();
    clearTimeout(this.timer);
    this.attempt++;
    this.h.onStatus({ state: 'connecting', attempt: this.attempt, elapsed: Math.round((Date.now() - this.startedAt) / 1000) });
    let ws;
    try { ws = new WebSocket(this.url()); } catch (e) { this.scheduleRetry(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.open = true; this.attempt = 0; this.startedAt = 0;
      this.send({ t: 'hello', ...this.h.getHello() });
      this.h.onStatus({ state: 'open', attempt: 0, elapsed: 0 });
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping', ts: Date.now() }), 3000);
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'pong') { this.h.onPing(Date.now() - m.ts); return; }
      try { this.h.onMessage(m); } catch (e) { console.error('Ошибка обработки сообщения', m && m.t, e); }
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      const was = this.open; this.open = false;
      if (this.closedByUser) return;
      if (was) this.startedAt = Date.now();
      this.h.onStatus({ state: 'closed', attempt: this.attempt, elapsed: 0 });
      this.scheduleRetry();
    };
    ws.onerror = () => { /* дальше сработает onclose */ };
  }

  /** Планирует повторную попытку. */
  scheduleRetry() {
    const elapsed = Date.now() - this.startedAt;
    if (elapsed > GIVE_UP_MS) {
      this.h.onStatus({ state: 'failed', attempt: this.attempt, elapsed: Math.round(elapsed / 1000) });
      return;
    }
    const delay = Math.min(5000, 1000 + this.attempt * 1000);
    this.timer = setTimeout(() => this.connect(), delay);
    this.h.onStatus({ state: 'connecting', attempt: this.attempt, elapsed: Math.round(elapsed / 1000) });
  }

  /** Ручной повтор после «failed». */
  retry() { this.attempt = 0; this.startedAt = Date.now(); this.connect(); }

  /**
   * Отправка сообщения (молча игнорируется, если соединение закрыто).
   * @param {Object} obj сообщение
   * @returns {boolean} отправлено ли
   */
  send(obj) {
    if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(obj)); return true; }
    return false;
  }
}
