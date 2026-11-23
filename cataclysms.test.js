/**
 * cataclysms.test.js — тесты каталога катаклизмов и утилит.
 *
 * Что делает этот файл:
 *  - проверяет, что катаклизмов ≥ 1000, id и названия уникальны, поля заполнены;
 *  - проверяет детерминизм генератора и разнообразие эффектов (не просто переименования);
 *  - проверяет ГСЧ, валидацию и ограничитель частоты.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCatalog } from './catalog.js';
import { generateCatalog } from './generator.js';
import { ARCHETYPES } from './archetypes.js';
import { mulberry32, hashString } from './rng.js';
import { sanitizeName, sanitizeColor, sanitizeCode, clamp } from './validate.js';
import { TokenBucket } from './rateLimit.js';

test('каталог содержит не менее 1000 катаклизмов', () => assert.ok(getCatalog().length >= 1000));
test('ручных архетипов не менее 120', () => assert.ok(ARCHETYPES.length >= 120));

test('id и названия уникальны', () => {
  const c = getCatalog();
  assert.equal(new Set(c.map((x) => x.id)).size, c.length);
  assert.equal(new Set(c.map((x) => x.name)).size, c.length);
});

test('все обязательные поля заполнены', () => {
  for (const c of getCatalog()) {
    for (const f of ['id', 'name', 'description', 'tags', 'counterTags', 'severity', 'warningTime', 'duration', 'cooldown', 'zone', 'effects', 'visuals', 'sound', 'weight', 'minPlayers', 'canCombineWith']) {
      assert.ok(c[f] !== undefined && c[f] !== null, `${c.id}: нет ${f}`);
    }
    assert.ok(c.description.length > 10);
    assert.ok(c.severity >= 1 && c.severity <= 10);
  }
});

test('генератор детерминирован', () => {
  const a = generateCatalog(), b = generateCatalog();
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  assert.deepEqual(a.map((x) => x.name), b.map((x) => x.name));
});

test('эффекты разнообразны: много уникальных наборов', () => {
  const sigs = new Set(getCatalog().map((c) => JSON.stringify(c.effects)));
  assert.ok(sigs.size > 900, 'уникальных наборов эффектов: ' + sigs.size);
});

test('ГСЧ воспроизводим', () => {
  const a = mulberry32(5), b = mulberry32(5);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  assert.equal(hashString('abc'), hashString('abc'));
});

test('валидация ввода', () => {
  assert.ok(!/[<>]/.test(sanitizeName('<b>Вася</b>')));
  assert.equal(sanitizeColor('red'), '#ffcc33');
  assert.equal(sanitizeCode('ab-c d'), 'ABCD');
  assert.equal(clamp(9, 0, 5), 5);
});

test('ограничитель частоты', () => {
  const b = new TokenBucket(1, 3);
  assert.ok(b.take() && b.take() && b.take());
  assert.equal(b.take(), false);
});
