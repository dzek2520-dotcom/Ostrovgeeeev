/**
 * mobs.js — существа (мобы): появление, поведение, атаки, награды.
 *
 * Что делает этот файл:
 *  - spawnMob(game, kind, x, y, targetId) — создаёт моба; targetId — «охота» на конкретного игрока;
 *  - updateMobs(game, dt) — простой ИИ: преследование ближайшего игрока в радиусе, иначе
 *    блуждание; атака с перезарядкой; воришки (чайки, пираты) крадут предмет и убегают;
 *    призраки снижают рассудок и проходят сквозь препятствия;
 *  - MOB_DROPS — что выпадает с убитого моба.
 */
import { MOBS, SIZE, T } from './shared.js';

/** Награда за убийство: [предмет, количество, шанс]. */
const MOB_DROPS = {
  crab: [['food', 1, 1]], gull: [['food', 1, 0.7], ['cloth', 1, 0.3]],
  mutant: [['food', 2, 1], ['medicine', 1, 0.5]], zombie: [['cloth', 1, 0.6], ['medicine', 1, 0.3]],
  wolf: [['food', 2, 1], ['cloth', 1, 0.6]], pirate: [['metal', 2, 0.8], ['cloth', 1, 0.5], ['wood', 1, 0.5]],
  swarm: [], jelly: [['food', 1, 0.6]], spirit: [['artifact', 1, 0.25]], golem: [['stone', 4, 1], ['metal', 2, 0.8]],
};

/**
 * Создаёт моба.
 * @param {import('./game.js').Game} game игра
 * @param {string} kind ключ из MOBS
 * @param {number} x координата X
 * @param {number} y координата Y
 * @param {number|null} [targetId] id игрока-цели (охота)
 * @returns {Object|null} моб
 */
export function spawnMob(game, kind, x, y, targetId = null) {
  const def = MOBS[kind];
  if (!def) return null;
  const m = {
    id: game.nextId++, k: kind, x, y, hp: def.hp, mh: def.hp, target: targetId,
    atk: 0, ttl: 70 + game.rng() * 40, wa: game.rng() * 6.28, wt: 0, fleeing: false,
  };
  game.mobs.set(m.id, m);
  return m;
}

/**
 * Проходим ли тайл для моба.
 * @param {import('./game.js').Game} game игра
 * @param {Object} m моб
 * @param {number} x координата
 * @param {number} y координата
 */
function canStand(game, m, x, y) {
  if (x < 0.3 || y < 0.3 || x > SIZE - 0.3 || y > SIZE - 0.3) return false;
  if (m.k === 'spirit' || m.k === 'swarm' || m.k === 'gull') return true; // летают/проходят
  const t = game.world.typeAt(x, y);
  return t !== T.OCEAN && t !== T.LAVA && t !== T.CRACK && t !== T.LAKE;
}

/**
 * Обновляет всех мобов.
 * @param {import('./game.js').Game} game игра
 * @param {number} dt секунды
 */
export function updateMobs(game, dt) {
  for (const m of [...game.mobs.values()]) {
    const def = MOBS[m.k];
    m.ttl -= dt; m.atk -= dt;
    if (m.ttl <= 0) { game.mobs.delete(m.id); continue; }
    // выбираем цель
    let target = null;
    if (m.target != null) { const p = game.players.get(m.target); if (p && p.alive) target = p; else m.target = null; }
    if (!target && !m.fleeing) {
      let best = 11;
      for (const p of game.players.values()) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        if (d < best) { best = d; target = p; }
      }
    }
    let dx = 0, dy = 0;
    if (m.fleeing) {
      // убегает от ближайшего игрока
      const p = game.nearestPlayer(m.x, m.y, 30);
      if (p) { dx = m.x - p.x; dy = m.y - p.y; }
      m.ttl = Math.min(m.ttl, 6);
    } else if (target) {
      dx = target.x - m.x; dy = target.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.75 + def.size * 0.4) {
        if (m.atk <= 0) {
          m.atk = 1.0;
          const armor = target.prot.has('bite') || target.prot.has('blade');
          game.damage(target, def.dmg * (armor ? 0.35 : 1), def.name);
          game.fx({ k: 'hit', x: target.x, y: target.y });
          if (def.sanityDmg) game.addStat(target, 'sanity', -def.sanityDmg);
          if (def.thief) { game.stealFrom(target); m.fleeing = true; }
        }
        dx = dy = 0;
      }
    } else {
      // блуждание
      m.wt -= dt;
      if (m.wt <= 0) { m.wa += (game.rng() - 0.5) * 2.4; m.wt = 1 + game.rng() * 2; }
      dx = Math.cos(m.wa) * 0.4; dy = Math.sin(m.wa) * 0.4;
    }
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      const tf = m.k === 'spirit' ? 1 : (game.world.typeAt(m.x, m.y) === T.SHALLOW ? 0.7 : 1);
      const sp = def.speed * tf * dt / len;
      const nx = m.x + dx * sp, ny = m.y + dy * sp;
      if (canStand(game, m, nx, m.y)) m.x = nx; else m.wa += 1.5;
      if (canStand(game, m, m.x, ny)) m.y = ny; else m.wa += 1.5;
    }
  }
}

/**
 * Дроп с убитого моба.
 * @param {import('./game.js').Game} game игра
 * @param {Object} m моб
 */
export function dropFromMob(game, m) {
  for (const [item, n, chance] of MOB_DROPS[m.k] || []) {
    if (game.rng() < chance) game.dropLoot(m.x + (game.rng() - 0.5), m.y + (game.rng() - 0.5), item, n);
  }
}
