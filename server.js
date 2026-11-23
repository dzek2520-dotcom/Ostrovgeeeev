/**
 * index.js — точка входа сервера: Express + WebSocket.
 *
 * Что делает этот файл:
 *  - раздаёт файлы клиента из этой же папки (index.html, style.css, *.js);
 *  - GET /health — проверка работоспособности для Render (healthCheckPath);
 *  - WebSocket на том же порту по пути /ws (Render проксирует его как WSS);
 *  - слушает process.env.PORT на 0.0.0.0;
 *  - запускает игровой цикл (20 Гц) и «пинг-понг» для обнаружения мёртвых соединений.
 */
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';
import { TICK_RATE } from './shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const app = express();
app.disable('x-powered-by');
const manager = new RoomManager();
const startedAt = Date.now();

// Health check (Render). Возвращает также краткую статистику.
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round((Date.now() - startedAt) / 1000), ...manager.stats() });
});

// Статика клиента: отдаём только файлы клиента (серверный код наружу не раздаётся)
const CLIENT_FILES = new Set(['style.css', 'shared.js', 'main.js', 'net.js', 'input.js', 'render.js', 'ui.js', 'audio.js', 'i18n.js']);
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/:file', (req, res, next) => {
  if (!CLIENT_FILES.has(req.params.file)) return next();
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(path.join(__dirname, req.params.file));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  manager.attach(ws);
});

// Игровой цикл
const loop = setInterval(() => {
  try { manager.tick(); } catch (e) { console.error('[loop] ошибка тика', e); }
}, 1000 / TICK_RATE);

// Проверка живости соединений каждые 20 секунд (заодно не даёт прокси закрыть idle-соединение)
const hb = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* ignore */ }
  }
}, 20000);

server.listen(PORT, HOST, () => {
  console.log(`ISLAND OF CHAOS слушает http://${HOST}:${PORT}  (WebSocket: /ws)`);
});

/** Корректное завершение. */
function shutdown() {
  clearInterval(loop); clearInterval(hb);
  wss.close(); server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
