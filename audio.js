/**
 * audio.js — звуковая подсистема клиента ISLAND OF CHAOS.
 *
 * Что делает этот файл:
 *  - полностью синтезирует звук через Web Audio API (осцилляторы, шум, фильтры,
 *    огибающие) — никаких внешних аудиофайлов;
 *  - экспортирует простой API: initAudio / resumeAudio / setMuted / isMuted /
 *    playSound / setSiren / setAmbient;
 *  - AudioContext создаётся лениво (по первому вызову initAudio/resumeAudio —
 *    обычно из обработчика клика/нажатия клавиши, как требуют браузеры);
 *  - все функции безопасны: если звук выключен, контекст недоступен или ещё не
 *    запущен — вызовы тихо ничего не делают (желаемые состояния сирены и фона
 *    запоминаются и применяются сразу после запуска контекста);
 *  - состояние «звук выключен» хранится в localStorage под ключом 'ioc_muted'.
 */

/** Ключ localStorage для флага «звук выключен». */
const MUTE_KEY = 'ioc_muted';
/** Общая громкость мастер-канала. */
const MASTER_VOL = 0.55;

/** @type {AudioContext|null} Аудиоконтекст (создаётся лениво). */
let ctx = null;
/** @type {GainNode|null} Мастер-громкость (через неё работает mute). */
let master = null;
/** @type {AudioBuffer|null} Общий буфер белого шума (2 секунды, зацикливается). */
let noiseBuf = null;
/** Флаг «звук выключен». */
let muted = false;
/** Желаемое состояние сирены (применяется после запуска контекста). */
let wantSiren = false;
/** Желаемый тип фона (применяется после запуска контекста). */
let wantAmbient = null;
/** Текущая сирена: {osc, lfo, gain} или null. */
let siren = null;
/** Текущий фон: {kind, out, srcs} или null. */
let ambient = null;
/** Время (сек контекста) последнего проигрывания каждого звука — защита от спама. */
const lastPlayed = {};

// Читаем сохранённое состояние mute (localStorage может быть недоступен).
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }

/**
 * Лениво создаёт AudioContext, мастер-канал с компрессором и буфер шума.
 * Повторные вызовы безопасны.
 * @returns {boolean} true, если контекст доступен
 */
export function initAudio() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    // Цепочка: master -> компрессор (чтобы наложение звуков не клипало) -> выход.
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ctx.destination);
    // Буфер белого шума: основа ветра, взрывов, воды и т.д.
    const len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // Применяем запомненные желания (сирена/фон), если их запросили до запуска.
    applySiren();
    applyAmbient();
    return true;
  } catch (e) {
    ctx = null; master = null; noiseBuf = null;
    return false;
  }
}

/**
 * Запускает/возобновляет контекст. Вызывать из обработчиков пользовательских
 * жестов (клик, нажатие клавиши, касание).
 */
export function resumeAudio() {
  if (!initAudio()) return;
  try {
    if (ctx.state === 'suspended') {
      const p = ctx.resume();
      if (p && p.then) p.then(() => { applySiren(); applyAmbient(); }).catch(() => {});
    }
  } catch (e) { /* игнорируем */ }
}

/**
 * Включает/выключает звук и запоминает выбор в localStorage.
 * @param {boolean} m true — выключить звук
 */
export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
  if (ctx && master) {
    try { master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, ctx.currentTime, 0.03); } catch (e) { /* ignore */ }
  }
}

/**
 * Выключен ли звук.
 * @returns {boolean}
 */
export function isMuted() { return muted; }

/**
 * Готов ли контекст принимать новые звуки.
 * @returns {boolean}
 */
function ready() {
  return !!ctx && !!master && ctx.state === 'running';
}

/* ------------------------------------------------------------------ */
/* Низкоуровневые «кирпичики» синтеза                                  */
/* ------------------------------------------------------------------ */

/**
 * Применяет огибающую «атака-спад» к параметру громкости.
 * @param {AudioParam} g параметр gain
 * @param {number} t0 время старта (сек контекста)
 * @param {number} a время атаки, сек
 * @param {number} peak пиковая громкость
 * @param {number} d время экспоненциального спада, сек
 */
function envelope(g, t0, a, peak, d) {
  g.setValueAtTime(0.0001, t0);
  g.linearRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
  g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

/**
 * Проигрывает один тон (осциллятор -> [фильтр] -> огибающая -> мастер).
 * @param {object} o параметры:
 *   f — частота, Гц; f2 — конечная частота (глайд, экспоненциально);
 *   type — форма волны; dur — длительность, сек; vol — громкость;
 *   at — задержка старта, сек; a — атака, сек; lp — частота lowpass-фильтра;
 *   vib — глубина вибрато (Гц), vibf — частота вибрато (Гц)
 */
function tone(o) {
  const t0 = ctx.currentTime + (o.at || 0);
  const dur = o.dur || 0.2;
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(o.f2, 1), t0 + dur);
  const g = ctx.createGain();
  envelope(g.gain, t0, o.a || 0.005, o.vol == null ? 0.3 : o.vol, dur);
  let last = osc;
  const extra = [];
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    last.connect(f);
    last = f;
    extra.push(f);
  }
  last.connect(g);
  g.connect(master);
  // Вибрато: низкочастотный осциллятор, модулирующий частоту основного.
  let lfo = null;
  if (o.vib) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = o.vibf || 6;
    const lg = ctx.createGain();
    lg.gain.value = o.vib;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.1);
  }
  osc.start(t0);
  osc.stop(t0 + dur + 0.1);
  osc.onended = () => { try { g.disconnect(); extra.forEach((n) => n.disconnect()); } catch (e) { /* ignore */ } };
}

/**
 * Проигрывает всплеск шума через фильтр с огибающей.
 * @param {object} o параметры:
 *   dur — длительность; vol — громкость; at — задержка; a — атака;
 *   type — тип фильтра ('lowpass'|'highpass'|'bandpass'); f — частота фильтра;
 *   f2 — конечная частота фильтра (экспоненциальный свип); q — добротность
 */
function noise(o) {
  const t0 = ctx.currentTime + (o.at || 0);
  const dur = o.dur || 0.2;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'lowpass';
  f.frequency.setValueAtTime(o.f || 1000, t0);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(o.f2, 20), t0 + dur);
  f.Q.value = o.q == null ? 0.8 : o.q;
  const g = ctx.createGain();
  envelope(g.gain, t0, o.a || 0.005, o.vol == null ? 0.3 : o.vol, dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  // Случайное смещение внутри буфера, чтобы повторы звучали по-разному.
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + dur + 0.1);
  src.onended = () => { try { g.disconnect(); f.disconnect(); } catch (e) { /* ignore */ } };
}

/* ------------------------------------------------------------------ */
/* Библиотека звуков                                                   */
/* ------------------------------------------------------------------ */

/**
 * Таблица синтезаторов. Каждая функция принимает множитель громкости v
 * и планирует звук относительно ctx.currentTime. Все звуки короткие.
 * @type {Object<string, function(number):void>}
 */
const SOUNDS = {
  /** Короткий клик интерфейса. */
  ui(v) {
    tone({ f: 880, type: 'sine', dur: 0.06, vol: 0.18 * v });
    tone({ f: 1320, type: 'sine', dur: 0.06, vol: 0.12 * v, at: 0.04 });
  },
  /** Предупреждение о катаклизме: тревожные чередующиеся биипы. */
  warn(v) {
    for (let i = 0; i < 3; i++) {
      tone({ f: i % 2 ? 660 : 880, type: 'square', dur: 0.13, vol: 0.16 * v, at: i * 0.17, lp: 2200 });
    }
  },
  /** Старт катаклизма: низкий удар с нарастающим свипом. */
  start(v) {
    tone({ f: 140, f2: 55, type: 'sawtooth', dur: 0.7, vol: 0.26 * v, lp: 700 });
    noise({ type: 'lowpass', f: 1200, f2: 80, dur: 0.6, vol: 0.28 * v });
    tone({ f: 70, f2: 35, type: 'sine', dur: 0.8, vol: 0.4 * v, at: 0.03 });
  },
  /** Конец катаклизма: восходящее мягкое арпеджио. */
  end(v) {
    const n = [523, 659, 784, 1047];
    for (let i = 0; i < n.length; i++) {
      tone({ f: n[i], type: 'triangle', dur: 0.35, vol: 0.2 * v, at: i * 0.11 });
    }
  },
  /** Раскат подземного грохота. */
  rumble(v) {
    noise({ type: 'lowpass', f: 160, f2: 60, dur: 1.3, a: 0.15, vol: 0.55 * v, q: 0.5 });
    tone({ f: 48, f2: 32, type: 'sine', dur: 1.3, a: 0.1, vol: 0.4 * v });
    tone({ f: 61, f2: 40, type: 'triangle', dur: 1.1, a: 0.2, vol: 0.12 * v, vib: 4, vibf: 11 });
  },
  /** Порыв ветра. */
  wind(v) {
    noise({ type: 'bandpass', f: 380, f2: 1300, dur: 0.7, a: 0.3, vol: 0.4 * v, q: 1.6 });
    noise({ type: 'bandpass', f: 1300, f2: 450, dur: 0.6, a: 0.05, vol: 0.3 * v, q: 1.4, at: 0.6 });
  },
  /** Плеск воды: шумовой всплеск и «пузырьки». */
  water(v) {
    noise({ type: 'lowpass', f: 900, f2: 300, dur: 0.7, a: 0.04, vol: 0.38 * v, q: 0.7 });
    for (let i = 0; i < 4; i++) {
      const f = 400 + Math.random() * 500;
      tone({ f, f2: f * 1.8, type: 'sine', dur: 0.09, vol: 0.14 * v, at: 0.05 + i * 0.1 + Math.random() * 0.05 });
    }
  },
  /** Взрыв: удар шума и падающий низкий тон. */
  boom(v) {
    noise({ type: 'lowpass', f: 1800, f2: 70, dur: 1.0, a: 0.004, vol: 0.7 * v, q: 0.6 });
    tone({ f: 110, f2: 28, type: 'sine', dur: 0.9, a: 0.004, vol: 0.7 * v });
    noise({ type: 'highpass', f: 2500, dur: 0.12, vol: 0.2 * v });
  },
  /** Электрический разряд (молния). */
  zap(v) {
    tone({ f: 2400, f2: 90, type: 'sawtooth', dur: 0.28, a: 0.002, vol: 0.2 * v, lp: 5000 });
    noise({ type: 'highpass', f: 2000, dur: 0.22, a: 0.002, vol: 0.4 * v });
    noise({ type: 'bandpass', f: 800, f2: 200, dur: 0.5, a: 0.02, vol: 0.3 * v, q: 0.9, at: 0.08 });
  },
  /** Жужжание (рой, электричество). */
  buzz(v) {
    tone({ f: 118, type: 'sawtooth', dur: 0.6, a: 0.06, vol: 0.2 * v, lp: 900, vib: 14, vibf: 28 });
    tone({ f: 236, type: 'square', dur: 0.5, a: 0.06, vol: 0.06 * v, lp: 1500, vib: 20, vibf: 31 });
  },
  /** Нежный колокольчик. */
  chime(v) {
    tone({ f: 1046, type: 'sine', dur: 0.9, a: 0.003, vol: 0.22 * v });
    tone({ f: 1568, type: 'sine', dur: 0.8, a: 0.003, vol: 0.12 * v, at: 0.02 });
    tone({ f: 2093, type: 'sine', dur: 0.5, a: 0.003, vol: 0.06 * v, at: 0.04 });
  },
  /** Жуткий вой/стон. */
  wail(v) {
    tone({ f: 300, f2: 720, type: 'sine', dur: 0.6, a: 0.15, vol: 0.2 * v, vib: 12, vibf: 6 });
    tone({ f: 720, f2: 250, type: 'sine', dur: 0.7, a: 0.02, vol: 0.2 * v, at: 0.55, vib: 14, vibf: 6.5 });
    tone({ f: 450, f2: 360, type: 'triangle', dur: 1.2, a: 0.3, vol: 0.06 * v, vib: 8, vibf: 5 });
  },
  /** Короткий «поп». */
  pop(v) {
    tone({ f: 650, f2: 180, type: 'sine', dur: 0.09, a: 0.002, vol: 0.3 * v });
    noise({ type: 'highpass', f: 3000, dur: 0.02, a: 0.001, vol: 0.1 * v });
  },
  /** Удар по цели. */
  hit(v) {
    noise({ type: 'bandpass', f: 1500, f2: 600, dur: 0.09, a: 0.002, vol: 0.4 * v, q: 1 });
    tone({ f: 220, f2: 70, type: 'square', dur: 0.1, a: 0.002, vol: 0.16 * v, lp: 900 });
  },
  /** Получение урона. */
  hurt(v) {
    tone({ f: 240, f2: 100, type: 'sawtooth', dur: 0.26, a: 0.003, vol: 0.28 * v, lp: 1100 });
    noise({ type: 'lowpass', f: 900, f2: 200, dur: 0.18, a: 0.002, vol: 0.3 * v });
  },
  /** Сбор ресурса: шорох и тихий щелчок. */
  gather(v) {
    noise({ type: 'highpass', f: 2200, dur: 0.07, a: 0.003, vol: 0.2 * v });
    noise({ type: 'highpass', f: 1800, dur: 0.09, a: 0.003, vol: 0.18 * v, at: 0.08 });
    tone({ f: 520, f2: 700, type: 'triangle', dur: 0.08, vol: 0.14 * v, at: 0.1 });
  },
  /** Крафт: два удара молотка и звон. */
  craft(v) {
    tone({ f: 700, f2: 420, type: 'triangle', dur: 0.07, a: 0.002, vol: 0.28 * v });
    noise({ type: 'bandpass', f: 2800, dur: 0.04, a: 0.001, vol: 0.15 * v });
    tone({ f: 980, f2: 600, type: 'triangle', dur: 0.07, a: 0.002, vol: 0.28 * v, at: 0.12 });
    tone({ f: 1568, type: 'sine', dur: 0.5, a: 0.003, vol: 0.14 * v, at: 0.24 });
    tone({ f: 2349, type: 'sine', dur: 0.4, a: 0.003, vol: 0.07 * v, at: 0.27 });
  },
  /** Еда: три хруста. */
  eat(v) {
    for (let i = 0; i < 3; i++) {
      noise({ type: 'bandpass', f: 1800 + Math.random() * 900, dur: 0.05, a: 0.002, vol: 0.38 * v, q: 1.5, at: i * 0.09 });
    }
  },
  /** Питьё: булькающие глотки. */
  drink(v) {
    for (let i = 0; i < 3; i++) {
      tone({ f: 260 + i * 20, f2: 520, type: 'sine', dur: 0.1, a: 0.01, vol: 0.22 * v, at: i * 0.15 });
    }
    noise({ type: 'lowpass', f: 700, dur: 0.4, a: 0.05, vol: 0.06 * v });
  },
  /** Смерть игрока: падающий тон и затухающий шум. */
  death(v) {
    tone({ f: 330, f2: 48, type: 'sawtooth', dur: 1.3, a: 0.01, vol: 0.3 * v, lp: 1200 });
    tone({ f: 165, f2: 40, type: 'sine', dur: 1.4, a: 0.01, vol: 0.3 * v, at: 0.05 });
    noise({ type: 'lowpass', f: 1000, f2: 60, dur: 1.0, vol: 0.25 * v });
  },
  /** Эмоция: весёлый «чирик» вверх. */
  emote(v) {
    tone({ f: 700, f2: 1100, type: 'sine', dur: 0.1, a: 0.003, vol: 0.2 * v });
    tone({ f: 1400, type: 'sine', dur: 0.12, a: 0.003, vol: 0.14 * v, at: 0.09 });
  },
};

/**
 * Проигрывает именованный звук.
 * @param {string} name имя звука ('ui','warn','start','end','rumble','wind','water',
 *   'boom','zap','buzz','chime','wail','pop','hit','hurt','gather','craft','eat',
 *   'drink','death','emote'); неизвестные имена игнорируются
 * @param {number} [vol=1] множитель громкости 0..1+
 */
export function playSound(name, vol = 1) {
  if (muted || !ready()) return;
  const fn = SOUNDS[name];
  if (!fn) return;
  try {
    // Защита от спама: один и тот же звук не чаще, чем раз в 45 мс.
    const now = ctx.currentTime;
    if (lastPlayed[name] !== undefined && now - lastPlayed[name] < 0.045) return;
    lastPlayed[name] = now;
    fn(Math.max(0, +vol || 0));
  } catch (e) { /* звук не должен ломать игру */ }
}

/* ------------------------------------------------------------------ */
/* Сирена                                                              */
/* ------------------------------------------------------------------ */

/**
 * Включает или выключает циклическую сирену (качающийся тон).
 * Желаемое состояние запоминается, поэтому вызов до запуска контекста безопасен.
 * @param {boolean} on true — сирена звучит
 */
export function setSiren(on) {
  wantSiren = !!on;
  applySiren();
}

/**
 * Приводит реальную сирену в соответствие с желаемым состоянием.
 */
function applySiren() {
  if (!ctx || !master) return;
  try {
    if (wantSiren && !siren) {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 660;
      // Треугольный LFO качает частоту 400..920 Гц с периодом 1.8 с.
      const lfo = ctx.createOscillator();
      lfo.type = 'triangle';
      lfo.frequency.value = 0.55;
      const depth = ctx.createGain();
      depth.gain.value = 260;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1700;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.1, t + 0.25);
      osc.connect(lp);
      lp.connect(gain);
      gain.connect(master);
      osc.start(t);
      lfo.start(t);
      siren = { osc, lfo, gain, lp, depth };
    } else if (!wantSiren && siren) {
      const s = siren;
      siren = null;
      const t = ctx.currentTime;
      s.gain.gain.cancelScheduledValues(t);
      s.gain.gain.setValueAtTime(s.gain.gain.value, t);
      s.gain.gain.linearRampToValueAtTime(0.0001, t + 0.3);
      try { s.osc.stop(t + 0.35); s.lfo.stop(t + 0.35); } catch (e) { /* ignore */ }
      s.osc.onended = () => { try { s.gain.disconnect(); s.lp.disconnect(); s.depth.disconnect(); } catch (e) { /* ignore */ } };
    }
  } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Фоновые звуки катаклизмов                                           */
/* ------------------------------------------------------------------ */

/**
 * Создаёт зацикленный шумовой источник через фильтр.
 * @param {AudioNode} dest куда подключить
 * @param {string} type тип фильтра
 * @param {number} freq частота фильтра
 * @param {number} q добротность
 * @param {number} vol громкость ветки
 * @returns {{src:AudioBufferSourceNode, filter:BiquadFilterNode, gain:GainNode}}
 */
function loopNoise(dest, type, freq, q, vol) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start(ctx.currentTime, Math.random() * 1.5);
  return { src, filter, gain };
}

/**
 * Подключает медленный LFO к параметру.
 * @param {AudioParam} param целевой параметр
 * @param {number} freq частота LFO, Гц
 * @param {number} depth глубина модуляции
 * @param {string} [type='sine'] форма волны LFO
 * @returns {OscillatorNode} запущенный LFO (нужно остановить при выключении)
 */
function lfoTo(param, freq, depth, type = 'sine') {
  const lfo = ctx.createOscillator();
  lfo.type = type;
  lfo.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = depth;
  lfo.connect(g);
  g.connect(param);
  lfo.start();
  return lfo;
}

/**
 * Строит граф фона нужного типа.
 * @param {string} kind 'rumble'|'wind'|'water'|'buzz'|'wail'
 * @param {GainNode} out выходной узел группы
 * @returns {AudioScheduledSourceNode[]|null} источники для остановки или null для неизвестного типа
 */
function buildAmbient(kind, out) {
  const srcs = [];
  if (kind === 'rumble') {
    // Низкий гул: шум через lowpass + глубокий синус с дрожью.
    const n = loopNoise(out, 'lowpass', 140, 0.6, 0.9);
    srcs.push(n.src, lfoTo(n.gain.gain, 0.7, 0.35));
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 42;
    const og = ctx.createGain(); og.gain.value = 0.35;
    o.connect(og); og.connect(out); o.start();
    srcs.push(o, lfoTo(o.frequency, 0.3, 6));
  } else if (kind === 'wind') {
    // Ветер: полосовой шум, центральная частота плавает, громкость «порывами».
    const n = loopNoise(out, 'bandpass', 600, 1.2, 0.8);
    srcs.push(n.src, lfoTo(n.filter.frequency, 0.18, 350), lfoTo(n.gain.gain, 0.27, 0.35));
    const n2 = loopNoise(out, 'highpass', 2500, 0.7, 0.07);
    srcs.push(n2.src);
  } else if (kind === 'water') {
    // Вода: низкочастотный шум волн, накатывающий медленным LFO, плюс «шипение» пены.
    const n = loopNoise(out, 'lowpass', 700, 0.5, 0.55);
    srcs.push(n.src, lfoTo(n.gain.gain, 0.12, 0.35), lfoTo(n.filter.frequency, 0.12, 300));
    const foam = loopNoise(out, 'highpass', 3000, 0.5, 0.1);
    srcs.push(foam.src, lfoTo(foam.gain.gain, 0.12, 0.07));
  } else if (kind === 'buzz') {
    // Электрический гул: пила 100 Гц с амплитудной модуляцией + высокий писк.
    const o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = 100;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 800;
    const og = ctx.createGain(); og.gain.value = 0.22;
    o.connect(lp); lp.connect(og); og.connect(out); o.start();
    srcs.push(o, lfoTo(og.gain, 50, 0.1, 'square'), lfoTo(o.frequency, 0.4, 4));
    const hiss = loopNoise(out, 'bandpass', 3500, 4, 0.06);
    srcs.push(hiss.src, lfoTo(hiss.gain.gain, 7, 0.05));
  } else if (kind === 'wail') {
    // Заунывный вой: два медленно скользящих синуса с вибрато.
    const make = (f, depth, rate, vol) => {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = vol;
      o.connect(g); g.connect(out); o.start();
      srcs.push(o, lfoTo(o.frequency, rate, depth), lfoTo(g.gain, rate * 0.5, vol * 0.6));
    };
    make(330, 110, 0.15, 0.12);
    make(497, 90, 0.11, 0.08);
    const n = loopNoise(out, 'bandpass', 900, 3, 0.04);
    srcs.push(n.src);
  } else {
    return null;
  }
  return srcs;
}

/**
 * Включает фон на время активного катаклизма (плавная смена с кроссфейдом).
 * @param {string|null} kind 'rumble'|'wind'|'water'|'buzz'|'wail' или null
 */
export function setAmbient(kind) {
  wantAmbient = kind || null;
  applyAmbient();
}

/**
 * Приводит реальный фон в соответствие с желаемым.
 */
function applyAmbient() {
  if (!ctx || !master) return;
  try {
    if (ambient && ambient.kind === wantAmbient) return;
    // Плавно гасим старый фон и останавливаем его источники после затухания.
    if (ambient) {
      const old = ambient;
      ambient = null;
      const t = ctx.currentTime;
      old.out.gain.cancelScheduledValues(t);
      old.out.gain.setValueAtTime(old.out.gain.value, t);
      old.out.gain.linearRampToValueAtTime(0.0001, t + 1.0);
      setTimeout(() => {
        old.srcs.forEach((s) => { try { s.stop(); } catch (e) { /* ignore */ } });
        try { old.out.disconnect(); } catch (e) { /* ignore */ }
      }, 1300);
    }
    if (wantAmbient) {
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, ctx.currentTime);
      out.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 1.8); // плавное включение
      out.connect(master);
      const srcs = buildAmbient(wantAmbient, out);
      if (srcs) ambient = { kind: wantAmbient, out, srcs };
      else { try { out.disconnect(); } catch (e) { /* ignore */ } }
    }
  } catch (e) { /* ignore */ }
}
