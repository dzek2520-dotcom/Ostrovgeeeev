/**
 * director.js — «Режиссёр катаклизмов» (Director AI).
 *
 * Что делает этот файл:
 *  Выбирает, какой катаклизм запустить следующим, и когда. Учитывает:
 *   - число живых игроков (minPlayers записи);
 *   - время игры: допустимая тяжесть растёт (сложность растёт со временем);
 *   - состояние игроков: если все ослаблены — чаще «добрые» катаклизмы и мягче;
 *     если игроки здоровы — выше шанс тяжёлых;
 *   - недавние события: не повторяет последние базовые архетипы, соблюдает cooldown записи,
 *     избегает подряд одинаковой категории;
 *   - комбо: с растущим шансом запускает второй, совместимый катаклизм одновременно;
 *   - «внезапные» катаклизмы без предупреждения (редко; в режиме Хаос — чаще);
 *   - режим «Хаос»: катаклизмы идут один за другим почти без пауз.
 */
import { getCatalog } from './catalog.js';
import { weightedPick } from './rng.js';

/** Сколько последних базовых архетипов нельзя повторять. */
const RECENT_BLOCK = 10;

export class Director {
  /**
   * @param {import('./game.js').Game} game игра
   */
  constructor(game) {
    this.game = game;
    this.catalog = getCatalog();
    this.nextAt = 20;       // первый катаклизм через ~20 сек
    this.recent = [];       // последние base-id
    this.lastCats = [];     // последние категории
    this.lastUsed = new Map(); // id → игровое время запуска
  }

  /** Секунд до следующего запуска (для HUD). */
  nextIn() { return Math.max(0, Math.ceil(this.nextAt - this.game.time)); }

  /**
   * Максимальная допустимая тяжесть в данный момент.
   * @returns {number}
   */
  maxSeverity() {
    const t = this.game.time, chaos = this.game.settings.chaos;
    return Math.min(10, chaos ? 3 + Math.floor(t / 30) : 2 + Math.floor(t / 50));
  }

  /**
   * Шаг режиссёра. Вызывается каждый тик.
   */
  update() {
    const g = this.game;
    if (g.time < this.nextAt) return;
    const chaos = g.settings.chaos;
    const maxConc = chaos ? 4 : 2;
    if (g.cata.count() >= maxConc) { this.nextAt = g.time + 2; return; }
    const alive = g.alivePlayers().length;
    if (!alive) return;
    const def = this.pick(alive);
    if (def) {
      const silent = g.rng() < (chaos ? 0.2 : 0.07);
      this.launch(def, silent);
      // комбо-катаклизм
      const comboChance = Math.min(chaos ? 0.5 : 0.35, 0.05 + g.time / 1200 + (chaos ? 0.15 : 0));
      if (g.rng() < comboChance && g.cata.count() < maxConc) {
        const second = this.pick(alive, def);
        if (second) this.launch(second, g.rng() < 0.1);
      }
    }
    // пауза до следующего запуска
    const base = chaos ? Math.max(3, 10 - g.time / 60) : Math.max(14, 34 - g.time / 25);
    this.nextAt = g.time + base * (0.75 + g.rng() * 0.5);
  }

  /**
   * Запускает катаклизм и запоминает историю.
   * @param {Object} def запись каталога
   * @param {boolean} silent без предупреждения
   */
  launch(def, silent) {
    this.game.cata.launch(def, silent);
    this.recent.push(def.base); if (this.recent.length > RECENT_BLOCK) this.recent.shift();
    this.lastCats.push(def.category); if (this.lastCats.length > 2) this.lastCats.shift();
    this.lastUsed.set(def.id, this.game.time);
  }

  /**
   * Выбирает катаклизм по весам с учётом состояния игры.
   * @param {number} alive число живых игроков
   * @param {Object} [partner] первый катаклизм комбо (тогда выбираем совместимый)
   * @returns {Object|null}
   */
  pick(alive, partner) {
    const g = this.game, t = g.time;
    const maxSev = this.maxSeverity();
    const minSev = Math.max(1, maxSev - 5);
    const al = g.alivePlayers();
    const avgHp = al.reduce((s, p) => s + p.hp, 0) / (al.length || 1);
    const weak = avgHp < 45;
    const activeBases = new Set(g.cata.active.map((a) => a.def.base));
    const cand = this.catalog.filter((c) => {
      if (c.minPlayers > alive) return false;
      if (c.severity > maxSev || c.severity < minSev) return false;
      if (this.recent.includes(c.base) || activeBases.has(c.base)) return false;
      if ((this.lastUsed.get(c.id) || -1e9) + c.cooldown > t) return false;
      if (partner) {
        if (c.category === partner.category) return false;
        if (!partner.canCombineWith.includes(c.category) || c.severity + partner.severity > 14) return false;
      }
      return true;
    });
    return weightedPick(g.rng, cand, (c) => {
      let w = c.weight;
      if (this.lastCats.includes(c.category)) w *= 0.45;             // разнообразие категорий
      if (c.severity >= maxSev - 1) w *= 1.4;                          // ближе к потолку сложности
      const good = c.effects.some((e) => e.good);
      if (weak && good) w *= 2.5;                                      // поддержка ослабленных
      if (weak && c.severity >= 8) w *= 0.3;
      if (!weak && avgHp > 80 && c.severity >= 6) w *= 1.3;           // здоровым — вызов
      return w;
    });
  }
}
