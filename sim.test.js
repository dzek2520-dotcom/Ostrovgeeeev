/**
 * sim.test.js — тест игровой симуляции без сети.
 *
 * Что делает этот файл:
 *  - гоняет Game ускоренно (десятки минут игрового времени) с «ботами»;
 *  - проверяет отсутствие исключений, корректность снапшотов и конца раунда;
 *  - принудительно запускает КАЖДЫЙ тип эффекта каталога (по одному катаклизму из каждого архетипа);
 *  - проверяет детерминизм мира по seed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './game.js';
import { World } from './world.js';
import { getCatalog } from './catalog.js';

/** Создаёт игру с n ботами и сборщиком отправленных сообщений. */
function makeGame(n, settings = { pvp: false, chaos: false }, seed = 12345) {
  const sent = [];
  const members = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: 'Бот' + (i + 1), color: '#ffcc33' }));
  let ended = null;
  const game = new Game({
    code: 'TEST', seed, members, settings,
    io: { send: (id, m) => sent.push([id, m]), broadcast: (m) => sent.push([0, m]) },
    onEnd: (r) => { ended = r; },
  });
  return { game, sent, ended: () => ended };
}

test('мир детерминирован по seed', () => {
  const a = new World(777), b = new World(777), c = new World(778);
  assert.deepEqual(Array.from(a.tiles), Array.from(b.tiles));
  assert.notDeepEqual(Array.from(a.tiles), Array.from(c.tiles));
});

test('остров содержит все биомы', () => {
  const w = new World(42), seen = new Set(w.tiles);
  for (const t of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) assert.ok(seen.has(t), 'нет тайла типа ' + t);
});

test('10 минут игры с ботами без исключений', () => {
  const { game, ended } = makeGame(4, { pvp: false, chaos: true });
  let t = 0;
  while (t < 600 && !ended()) {
    for (const p of game.players.values()) {
      // бот бегает по кругу и иногда добывает
      game.handle(p.id, { t: 'input', seq: game.tickN, dx: Math.cos(t / 3 + p.id), dy: Math.sin(t / 3 + p.id), sprint: false, dt: 0.05 });
      if (game.tickN % 10 === 0) game.handle(p.id, { t: 'interact' });
      if (game.tickN % 40 === 0) game.handle(p.id, { t: 'use', item: 'food' });
    }
    game.tick(0.05); t += 0.05;
  }
  assert.ok(game.time > 20);
});

test('каждый архетип катаклизма исполняется без ошибок', () => {
  const cat = getCatalog();
  const seen = new Set();
  const { game } = makeGame(3, { pvp: true, chaos: false }, 999);
  for (const def of cat) {
    if (seen.has(def.base)) continue;
    seen.add(def.base);
    game.cata.launch(def, true);
    for (let i = 0; i < 60; i++) {           // 3 сек игрового времени
      for (const p of game.players.values()) { p.hp = 100; p.alive = true; }
      game.tick(0.05);
    }
    game.cata.active.length = 0;
  }
  assert.ok(seen.size >= 120);
});

test('снапшот содержит нужные поля и корректный JSON', () => {
  const { game, sent } = makeGame(2);
  game.tick(0.05);
  const snap = sent.map(([, m]) => m).find((m) => typeof m === 'string' && m.includes('"t":"snap"'));
  const o = JSON.parse(snap);
  for (const k of ['ack', 'me', 'tick', 'tm', 'nx', 'p', 'm', 'l', 'fx']) assert.ok(k in o, 'нет ' + k);
  for (const k of ['x', 'y', 'hp', 'hunger', 'thirst', 'temp', 'stamina', 'sanity', 'inv', 'statuses', 'prot', 'alive', 'sm', 'raft']) assert.ok(k in o.me, 'нет me.' + k);
});

test('конец раунда: один игрок погиб — игра окончена с таблицей', () => {
  const { game, ended } = makeGame(1);
  const p = [...game.players.values()][0];
  game.damage(p, 999, 'тест');
  game.tick(0.05);
  assert.ok(ended());
  assert.equal(ended().results.length, 1);
});

test('крафт и постройка', () => {
  const { game } = makeGame(1);
  const p = [...game.players.values()][0];
  Object.assign(p.inv, { wood: 10, stone: 10, cloth: 5, metal: 10 });
  game.handle(p.id, { t: 'craft', id: 'jacket' });
  assert.equal(p.inv.jacket, 1);
  game.handle(p.id, { t: 'place', id: 'campfire' });
  assert.equal(game.structs.size, 1);
  game.computeProt(p);
});

test('защита: куртка снижает урон от холода', () => {
  const { game } = makeGame(1);
  const p = [...game.players.values()][0];
  p.inv.jacket = 1; game.computeProt(p);
  assert.ok(p.prot.has('cold'));
});
