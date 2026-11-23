/**
 * effects.js — менеджер активных катаклизмов и исполнитель их эффектов.
 *
 * Что делает этот файл:
 *  - класс CataclysmManager хранит активные катаклизмы (фазы warn → active → end);
 *  - launch(def, silent) создаёт экземпляр: определяет конкретную зону, рассылает предупреждение;
 *  - update(dt) каждый тик исполняет эффекты (см. fx.js): урон, статусы,
 *    изменение показателей, изменение тайлов, спавн мобов, дождь предметов, физика, удары,
 *    кража, телепорт, обмен местами, лечение, охота;
 *  - защита: у каждого эффекта есть `ct` (теги защиты). Если у игрока в p.prot есть любой
 *    из них — вредное действие ослабляется (урон ×0.1, статусы блокируются, потери ×0.2).
 */
import { SIZE, F, T, ITEMS } from './shared.js';
import { resolveZone, inZone, randomPointInZone, zoneCenter } from './zones.js';
import { spawnMob } from './mobs.js';

/** Задержка «телеграфа» удара перед попаданием, сек. */
const STRIKE_DELAY = { boom: 0.9, meteor: 1.0, bolt: 0.6, splash: 0.8, hail: 0.35 };
/** Максимум одновременных мобов. */
const MOB_CAP = 45;

export class CataclysmManager {
  /**
   * @param {import('./game.js').Game} game игра-владелец
   */
  constructor(game) {
    this.game = game;
    this.active = [];      // экземпляры катаклизмов
    this.pending = [];     // отложенные удары
    this.uidSeq = 1;
  }

  /**
   * Запускает катаклизм: фаза предупреждения (или сразу старт, если внезапный).
   * @param {Object} def запись каталога
   * @param {boolean} silent true — без предупреждения
   * @returns {Object} экземпляр
   */
  launch(def, silent = false) {
    const g = this.game;
    const zone = resolveZone(def.zone, g.world, g.rng);
    const inst = {
      uid: this.uidSeq++, def, zone,
      phase: silent ? 'active' : 'warn',
      warnLeft: silent ? 0 : def.warningTime,
      tLeft: def.duration,
      silent,
      state: def.effects.map(() => ({ t: 0, acc: 0 })),
      touched: new Set(),
    };
    this.active.push(inst);
    g.broadcast({ t: 'cata', ev: silent ? 'start' : 'warn', ...this.payload(inst) });
    g.log(silent ? 'warn' : 'warn', silent ? 'cata_sudden' : 'cata_warn',
      { name: def.name, n: def.warningTime }, silent ? `❗ Внезапно: ${def.name}!` : `⚠️ Катаклизм «${def.name}» через ${def.warningTime} с!`);
    return inst;
  }

  /**
   * Формирует сообщение о катаклизме для клиента.
   * @param {Object} inst экземпляр
   * @returns {Object}
   */
  payload(inst) {
    const d = inst.def;
    return {
      uid: inst.uid, id: d.id, name: d.name, desc: d.description, cat: d.category, sev: d.severity,
      warn: Math.max(0, Math.ceil(inst.warnLeft)), dur: Math.ceil(inst.tLeft),
      zone: inst.zone, zoneName: d.zone.text, tags: d.tags, counter: d.counterTags,
      vis: d.visuals, snd: d.sound, silent: inst.silent,
    };
  }

  /** Список для сообщения init (при входе/переподключении). */
  snapshotForInit() {
    return this.active.map((inst) => ({ ev: inst.phase === 'warn' ? 'warn' : 'start', ...this.payload(inst) }));
  }

  /** Число активных (не закончившихся) катаклизмов. */
  count() { return this.active.length; }

  /**
   * Шаг симуляции катаклизмов.
   * @param {number} dt секунды
   */
  update(dt) {
    const g = this.game;
    // отложенные удары
    this.resolvePending();
    for (let a = this.active.length - 1; a >= 0; a--) {
      const inst = this.active[a];
      if (inst.phase === 'warn') {
        inst.warnLeft -= dt;
        if (inst.warnLeft <= 0) {
          inst.phase = 'active';
          g.broadcast({ t: 'cata', ev: 'start', ...this.payload(inst) });
          g.log('bad', 'cata_start', { name: inst.def.name }, `💥 Начался катаклизм: ${inst.def.name}`);
        }
        continue;
      }
      inst.tLeft -= dt;
      this.runEffects(inst, dt);
      if (inst.tLeft <= 0) {
        this.active.splice(a, 1);
        g.broadcast({ t: 'cata', ev: 'end', uid: inst.uid, id: inst.def.id, name: inst.def.name });
        g.log('good', 'cata_end', { name: inst.def.name }, `✅ Катаклизм закончился: ${inst.def.name}`);
        for (const id of inst.touched) { const p = g.players.get(id); if (p && p.alive) p.stats.surv++; }
      }
    }
  }

  /**
   * Исполняет эффекты одного активного катаклизма.
   * @param {Object} inst экземпляр
   * @param {number} dt секунды
   */
  runEffects(inst, dt) {
    const g = this.game, def = inst.def, zone = inst.zone, w = g.world;
    // игроки внутри зоны
    const members = [];
    for (const p of g.players.values()) {
      if (!p.alive) continue;
      if (inZone(zone, w, p.x, p.y)) { members.push(p); inst.touched.add(p.id); }
    }
    for (let n = 0; n < def.effects.length; n++) {
      const fx = def.effects[n], s = inst.state[n];
      const prot = (p) => fx.ct && fx.ct.length && fx.ct.some((t) => p.prot.has(t));
      switch (fx.fx) {
        case 'dmg':
          for (const p of members) g.damage(p, fx.dps * dt * (prot(p) ? 0.1 : 1), def.name);
          break;
        case 'status':
          for (const p of members) if (!prot(p) && g.rng() < fx.p * dt) g.addStatus(p, fx.s, fx.dur);
          break;
        case 'drain':
          for (const p of members) {
            let v = fx.v;
            const harmful = fx.stat === 'temp' ? Math.abs(v) > 0 && fx.ct && fx.ct.length > 0 : v < 0;
            if (harmful && prot(p)) v *= 0.2;
            g.addStat(p, fx.stat, v * dt);
          }
          break;
        case 'tiles': {
          s.acc += fx.rate * dt;
          let guard = 0;
          while (s.acc >= 1 && guard++ < 20) {
            s.acc -= 1;
            for (let tries = 0; tries < 10; tries++) {
              const pt = randomPointInZone(zone, w, g.rng, false);
              if (w.applyOp(fx.op, Math.floor(pt.x), Math.floor(pt.y))) break;
            }
          }
          break;
        }
        case 'spawn':
          s.t -= dt;
          if (s.t <= 0) {
            s.t = fx.every * (0.7 + g.rng() * 0.6);
            for (let i = 0; i < fx.n && g.mobs.size < MOB_CAP; i++) {
              const pt = randomPointInZone(zone, w, g.rng, true);
              if (w.isWalkable(pt.x, pt.y)) spawnMob(g, fx.mob, pt.x, pt.y);
            }
          }
          break;
        case 'loot':
          s.t -= dt;
          if (s.t <= 0) {
            s.t = fx.every * (0.7 + g.rng() * 0.6);
            for (let i = 0; i < fx.n; i++) {
              const pt = randomPointInZone(zone, w, g.rng, true);
              if (w.isWalkable(pt.x, pt.y) && ITEMS[fx.item]) g.dropLoot(pt.x, pt.y, fx.item, 1);
            }
          }
          break;
        case 'physics': {
          const c = zoneCenter(zone);
          for (const p of members) {
            if (fx.sm) p.env.sm = Math.min(p.env.sm, fx.sm);
            if (fx.invert && !(fx.ct && fx.ct.some((t) => p.prot.has(t)))) p.env.invert = true;
            if (fx.push) { const k = prot(p) ? 0.35 : 1; g.shove(p, fx.push[0] * k, fx.push[1] * k, dt); }
            if (fx.pull) {
              const dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy) || 1;
              g.shove(p, (dx / d) * fx.pull, (dy / d) * fx.pull, dt);
            }
          }
          break;
        }
        case 'strike':
          s.t -= dt;
          if (s.t <= 0) {
            s.t = fx.every * (0.6 + g.rng() * 0.8);
            this.scheduleStrike(inst, fx, members);
          }
          break;
        case 'structdmg':
          for (const st of [...g.structs.values()]) if (inZone(zone, w, st.x, st.y)) g.damageStruct(st, fx.dps * dt);
          break;
        case 'steal':
          s.t -= dt;
          if (s.t <= 0) {
            s.t = fx.every * (0.7 + g.rng() * 0.6);
            const victims = members.filter((p) => !prot(p));
            if (victims.length) g.stealFrom(victims[Math.floor(g.rng() * victims.length)]);
          }
          break;
        case 'tele':
          s.t -= dt;
          if (s.t <= 0 && members.length) {
            s.t = fx.every * (0.7 + g.rng() * 0.6);
            const p = members[Math.floor(g.rng() * members.length)];
            if (!prot(p)) g.teleport(p);
          }
          break;
        case 'swap':
          s.t -= dt;
          if (s.t <= 0 && g.alivePlayers().length >= 2) {
            s.t = fx.every * (0.7 + g.rng() * 0.6);
            const al = g.alivePlayers();
            const a = al[Math.floor(g.rng() * al.length)];
            let b = al[Math.floor(g.rng() * al.length)];
            if (a !== b) g.swapPlayers(a, b);
          }
          break;
        case 'heal':
          for (const p of members) g.heal(p, fx.hps * dt);
          break;
        case 'hunt':
          s.t -= dt;
          if (s.t <= 0) {
            s.t = fx.every * (0.7 + g.rng() * 0.6);
            const al = g.alivePlayers();
            if (al.length) {
              const victim = al[Math.floor(g.rng() * al.length)];
              g.addStatus(victim, 'hunted', 10);
              for (let i = 0; i < 2 && g.mobs.size < MOB_CAP; i++) {
                const ang = g.rng() * Math.PI * 2;
                const x = victim.x + Math.cos(ang) * 7, y = victim.y + Math.sin(ang) * 7;
                if (g.world.isWalkable(x, y)) spawnMob(g, i === 0 ? 'wolf' : 'mutant', x, y, victim.id);
              }
            }
          }
          break;
        default: break;
      }
    }
  }

  /**
   * Планирует точечный удар с «телеграфом» (кольцом предупреждения).
   * @param {Object} inst катаклизм
   * @param {Object} fx эффект strike
   * @param {Object[]} members игроки в зоне
   */
  scheduleStrike(inst, fx, members) {
    const g = this.game;
    let pt;
    if (members.length && g.rng() < 0.55) {
      // целимся рядом со случайным игроком — события происходят «рядом с вами»
      const p = members[Math.floor(g.rng() * members.length)];
      pt = { x: p.x + (g.rng() - 0.5) * 4, y: p.y + (g.rng() - 0.5) * 4 };
    } else pt = randomPointInZone(inst.zone, g.world, g.rng, fx.kind !== 'splash');
    pt.x = Math.max(0.5, Math.min(SIZE - 0.5, pt.x)); pt.y = Math.max(0.5, Math.min(SIZE - 0.5, pt.y));
    const delay = STRIKE_DELAY[fx.kind] || 0.8;
    this.pending.push({ at: g.time + delay, x: pt.x, y: pt.y, r: fx.r, dmg: fx.dmg, kind: fx.kind, ct: fx.ct, name: inst.def.name });
    if (fx.kind !== 'hail') g.fx({ k: 'mark', x: pt.x, y: pt.y, r: fx.r });
  }

  /** Исполняет созревшие удары. */
  resolvePending() {
    const g = this.game, now = g.time;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const s = this.pending[i];
      if (s.at > now) continue;
      this.pending.splice(i, 1);
      let { x, y } = s, absorbed = false;
      if (s.kind === 'bolt') {
        // громоотвод в радиусе перехватывает молнию
        for (const st of g.structs.values()) {
          if (st.k === 'rod' && Math.hypot(st.x - x, st.y - y) < 7) { x = st.x; y = st.y; g.damageStruct(st, 12); absorbed = true; break; }
        }
      }
      g.fx({ k: s.kind === 'bolt' ? 'bolt' : s.kind === 'splash' ? 'splash' : 'boom', x, y, r: s.r });
      if (absorbed) continue;
      // урон игрокам, мобам и постройкам
      for (const p of g.players.values()) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= s.r + 0.3) {
          const prot = s.ct && s.ct.length && s.ct.some((t) => p.prot.has(t));
          g.damage(p, s.dmg * (1 - d / (s.r + 0.6) * 0.5) * (prot ? 0.1 : 1), s.name);
          if (s.kind === 'boom' || s.kind === 'meteor') if (!prot) g.addStatus(p, 'stunned', 0.8);
          if (s.kind === 'splash' && !prot) g.addStatus(p, 'wet', 8);
        }
      }
      for (const m of [...g.mobs.values()]) if (Math.hypot(m.x - x, m.y - y) <= s.r) g.hurtMob(m, s.dmg, null);
      for (const st of [...g.structs.values()]) if (Math.hypot(st.x - x, st.y - y) <= s.r + 0.4) g.damageStruct(st, s.dmg * 0.8);
      // след на карте
      const ix = Math.floor(x), iy = Math.floor(y);
      if (s.kind === 'meteor') { g.world.applyOp('crater', ix, iy); g.world.setFlag(iy * SIZE + ix, F.FIRE, 8); }
      else if (s.kind === 'bolt') g.world.applyOp('burn', ix, iy);
      else if (s.kind === 'splash') g.world.setFlag(iy * SIZE + ix, F.WET, 15);
    }
  }
}
