/**
 * i18n.js — локализация интерфейса (русский / английский).
 *
 * Что делает этот файл:
 *  - хранит словари строк ru/en для ВСЕГО интерфейса, названий предметов,
 *    построек, статусов, категорий катаклизмов, тегов угроз и log-ключей сервера;
 *  - `t(key, args)` — перевод с подстановкой {имя} из объекта args;
 *  - `setLang/getLang` — выбор языка (хранится в localStorage 'ioc_lang', по умолчанию ru);
 *  - `tn(prefix, id, fallback)` — перевод имени сущности (item.wood, struct.shelter, …);
 *  - `applyI18n(root)` — проставляет переводы в DOM по атрибутам
 *    data-i18n (текст), data-i18n-ph (placeholder), data-i18n-title (подсказка).
 */

/** Словари. Ключи одинаковые, значения — на разных языках. */
const DICT = {
  ru: {
    'app.title': 'Остров Хаоса',
    'app.tagline': 'Выживай. Помогай. Или предавай.',

    // --- Подключение ---
    'connect.title': 'Подключение к серверу…',
    'connect.hint': 'Бесплатный сервер Render засыпает без активности и может просыпаться до ~60 секунд. Пожалуйста, подождите — игра подключится сама.',
    'connect.attempt': 'Попытка подключения: {n}',
    'connect.elapsed': 'Прошло: {n} с',
    'connect.failed': 'Не удалось подключиться к серверу. Проверьте интернет и попробуйте ещё раз.',
    'connect.retry': 'Повторить',
    'connect.lost': 'Соединение потеряно. Переподключение… (попытка {n})',
    'connect.restored': 'Соединение восстановлено',

    // --- Главное меню ---
    'menu.name': 'Ваш ник',
    'menu.name.ph': 'Введите ник',
    'menu.color': 'Цвет персонажа',
    'menu.create': 'Создать комнату',
    'menu.quick': 'Быстрый поиск',
    'menu.code': 'Код комнаты',
    'menu.code.ph': 'КОД',
    'menu.join': 'Войти',
    'menu.lang': 'Язык',
    'menu.help': 'WASD/стрелки — движение · Shift — бег · E — действие · F/Пробел/ЛКМ — атака · Q — крафт · Tab — инвентарь · H — лечить · G — отдать · Enter — чат · 1–8 — эмоции',
    'menu.help.touch': 'Левый джойстик — движение. Кнопки справа: действие, атака, крафт, инвентарь, бег, лечение, чат, эмоции.',
    'sound.on': 'Звук: вкл',
    'sound.off': 'Звук: выкл',
    'err.name': 'Введите ник',
    'err.code': 'Введите код комнаты',
    'err.offline': 'Нет соединения с сервером',

    // --- Лобби ---
    'lobby.title': 'Лобби',
    'lobby.code': 'Код комнаты',
    'lobby.copy': 'Копировать код',
    'lobby.copylink': 'Копировать ссылку',
    'lobby.copied': 'Скопировано!',
    'lobby.players': 'Игроки',
    'lobby.settings': 'Настройки комнаты',
    'lobby.pvp': 'PvP (игроки могут атаковать друг друга)',
    'lobby.chaos': 'Режим «Хаос» (катаклизмы чаще и сильнее)',
    'lobby.hostonly': 'Настройки меняет только хост',
    'lobby.ready': 'Готов',
    'lobby.unready': 'Не готов',
    'lobby.start': 'Старт',
    'lobby.leave': 'Выйти',
    'lobby.host': 'хост',
    'lobby.isready': 'готов',
    'lobby.notready': 'ждёт',
    'lobby.offline': 'нет связи',
    'lobby.you': 'вы',
    'lobby.count': '{n} / {max}',

    // --- Чат ---
    'chat.ph': 'Сообщение…',
    'chat.send': 'Отправить',

    // --- HUD ---
    'hud.hp': 'Здоровье',
    'hud.hunger': 'Сытость',
    'hud.thirst': 'Жажда (вода)',
    'hud.stamina': 'Выносливость',
    'hud.sanity': 'Рассудок',
    'hud.temp': 'Температура тела',
    'hud.next': 'Следующий катаклизм через {n} с',
    'hud.nonext': 'Катаклизм: время неизвестно',
    'hud.ping': 'Пинг: {n} мс',
    'hud.leave': 'Выйти из игры',
    'hud.leave.confirm': 'Выйти из игры в меню?',
    'hud.protect': 'Защита:',
    'hud.nearfire': 'У костра',
    'hud.raft': 'Плот',
    'hud.keys': 'E — действие · F — атака · Q — крафт · Tab — инвентарь · Enter — чат',

    // --- Баннеры катаклизмов ---
    'banner.warn': 'Через {n} с',
    'banner.warn.sudden': 'Внезапно!',
    'banner.active': 'Идёт · осталось {n} с',
    'banner.threat': 'Угрозы:',
    'banner.counter': 'Защитит:',
    'banner.sev': 'Сила',

    // --- Инвентарь ---
    'inv.title': 'Инвентарь',
    'inv.empty': 'Пусто. Собирайте ресурсы на острове (клавиша E).',
    'inv.use': 'Использовать',
    'inv.give': 'Отдать',
    'inv.givemode': 'Режим передачи: нажмите на предмет, чтобы отдать его ближайшему игроку',
    'inv.hint': 'Нажмите на предмет — использовать. Кнопка → — отдать ближайшему игроку.',
    'inv.close': 'Закрыть',

    // --- Крафт ---
    'craft.title': 'Крафт и стройка',
    'craft.make': 'Создать',
    'craft.place': 'Построить',
    'craft.needs': 'Нужно:',
    'craft.near': 'рядом должен быть: {name}',
    'craft.ok': 'Доступно',
    'craft.no': 'Не хватает',
    'craft.item': 'Предмет',
    'craft.struct': 'Постройка',
    'craft.close': 'Закрыть',

    // --- Эмоции ---
    'emote.title': 'Эмоции',

    // --- Наблюдение ---
    'spec.title': 'Наблюдение за: {name}',
    'spec.dead': 'Вы погибли',
    'spec.hint': 'Нажмите на игрока или используйте стрелки',
    'spec.prev': 'Предыдущий',
    'spec.next': 'Следующий',

    // --- Результаты ---
    'results.title': 'Итоги раунда',
    'results.winner': 'Победитель: {name}',
    'results.nowinner': 'Никто не выжил',
    'results.duration': 'Длительность: {t}',
    'results.rank': '#',
    'results.player': 'Игрок',
    'results.time': 'Время',
    'results.alive': 'Статус',
    'results.res': 'Ресурсы',
    'results.surv': 'Выживание',
    'results.help': 'Помощь',
    'results.kills': 'Убийства',
    'results.alive.y': 'жив',
    'results.alive.n': 'погиб',
    'results.rematch': 'Реванш',
    'results.leave': 'В главное меню',
    'results.wait': 'Ожидаем, пока хост начнёт реванш…',

    // --- Статусы / общие ---
    'misc.you': 'вы',
    'misc.unknown': 'неизвестно',
    'misc.sec': 'с',

    // --- Названия предметов ---
    'item.wood': 'Дерево', 'item.stone': 'Камень', 'item.food': 'Еда', 'item.water': 'Вода',
    'item.metal': 'Металл', 'item.cloth': 'Ткань', 'item.fuel': 'Топливо', 'item.medicine': 'Лекарство',
    'item.artifact': 'Артефакт', 'item.cooked': 'Жаркое', 'item.fish': 'Рыба', 'item.jelly': 'Желе',
    'item.medkit': 'Аптечка', 'item.jacket': 'Куртка', 'item.spear': 'Копьё', 'item.armor': 'Броня',
    'item.gasmask': 'Противогаз', 'item.raft': 'Плот',

    // --- Постройки ---
    'struct.shelter': 'Укрытие', 'struct.campfire': 'Костёр', 'struct.bunker': 'Бункер',
    'struct.rod': 'Громоотвод', 'struct.dam': 'Дамба', 'struct.filter': 'Фильтр воды',

    // --- Статусы ---
    'status.burning': 'Горение', 'status.poisoned': 'Отравление', 'status.wet': 'Промок',
    'status.frozen': 'Обморожение', 'status.stunned': 'Оглушён', 'status.slowed': 'Замедлен',
    'status.blind': 'Ослеплён', 'status.confused': 'Дезориентация', 'status.floaty': 'Невесомость',
    'status.heavy': 'Тяжесть', 'status.irradiated': 'Радиация', 'status.bleeding': 'Кровотечение',
    'status.infected': 'Инфекция', 'status.hunted': 'Под прицелом', 'status.glowing': 'Сияние',

    // --- Категории катаклизмов ---
    'cat.nature': 'Природный', 'cat.bio': 'Биологический', 'cat.cosmic': 'Космический',
    'cat.magic': 'Абсурдный', 'cat.tech': 'Техногенный', 'cat.social': 'Социальный',

    // --- Теги угроз / защиты ---
    'tag.rain': 'дождь', 'tag.hail': 'град', 'tag.wind': 'ветер', 'tag.sun': 'солнце', 'tag.heat': 'жара',
    'tag.cold': 'холод', 'tag.ash': 'пепел', 'tag.impact': 'удары', 'tag.dark': 'тьма', 'tag.fear': 'страх',
    'tag.fog': 'туман', 'tag.lightning': 'молнии', 'tag.flood': 'потоп', 'tag.water': 'вода',
    'tag.quake': 'землетрясение', 'tag.radiation': 'радиация', 'tag.toxic': 'токсины', 'tag.gas': 'газ',
    'tag.smoke': 'дым', 'tag.spores': 'споры', 'tag.fire': 'огонь', 'tag.explosion': 'взрывы',
    'tag.disease': 'болезнь', 'tag.gravity': 'гравитация', 'tag.curse': 'проклятие', 'tag.magic': 'магия', 'tag.emp': 'ЭМИ', 'tag.blade': 'клинки', 'tag.bite': 'укусы',

    // --- Log-ключи сервера ---
    'log.joined': '{name} присоединился к игре',
    'log.left': '{name} покинул игру',
    'log.died': '☠️ {name} погиб{cause}',
    'log.host': '{name} теперь хост',
    'log.started': 'Игра началась! Выживайте!',
    'log.gathered': 'Добыто: {item} ×{n}',
    'log.crafted': 'Создано: {item}',
    'log.built': 'Построено: {item}',
    'log.helped': '{name} помог игроку {to}',
    'log.gave': '{name} отдал {item} игроку {to}',
    'log.stole': '🏴‍☠️ Украдено: {item}!',
    'log.cata_warn': '⚠️ Катаклизм «{name}» через {n} с!',
    'log.cata_start': '💥 Начался катаклизм: {name}',
    'log.cata_end': '✅ Катаклизм закончился: {name}',
    'log.cata_sudden': '❗ Внезапно: {name}!',
    'log.eat': 'Вы съели: {item}',
    'log.drink': 'Вы напились {item}',
    'log.healed': '❤️ {name} исцелён',
    'log.noitem': 'Нет такого предмета',
    'log.nocraft': 'Не хватает ресурсов или нет нужной постройки рядом',
    'log.far': 'Слишком далеко',
    'log.reconnect': '{name} переподключился',
    'log.won': '🏆 {name} победил!',
  },

  en: {
    'app.title': 'Island of Chaos',
    'app.tagline': 'Survive. Help. Or betray.',

    'connect.title': 'Connecting to server…',
    'connect.hint': 'The free Render server sleeps when idle and may take up to ~60 seconds to wake up. Please wait — the game will connect by itself.',
    'connect.attempt': 'Connection attempt: {n}',
    'connect.elapsed': 'Elapsed: {n} s',
    'connect.failed': 'Could not connect to the server. Check your internet and try again.',
    'connect.retry': 'Retry',
    'connect.lost': 'Connection lost. Reconnecting… (attempt {n})',
    'connect.restored': 'Connection restored',

    'menu.name': 'Your nickname',
    'menu.name.ph': 'Enter nickname',
    'menu.color': 'Character color',
    'menu.create': 'Create room',
    'menu.quick': 'Quick match',
    'menu.code': 'Room code',
    'menu.code.ph': 'CODE',
    'menu.join': 'Join',
    'menu.lang': 'Language',
    'menu.help': 'WASD/arrows — move · Shift — sprint · E — interact · F/Space/LMB — attack · Q — craft · Tab — inventory · H — heal · G — give · Enter — chat · 1–8 — emotes',
    'menu.help.touch': 'Left joystick — move. Right buttons: interact, attack, craft, inventory, sprint, heal, chat, emotes.',
    'sound.on': 'Sound: on',
    'sound.off': 'Sound: off',
    'err.name': 'Enter a nickname',
    'err.code': 'Enter a room code',
    'err.offline': 'No connection to the server',

    'lobby.title': 'Lobby',
    'lobby.code': 'Room code',
    'lobby.copy': 'Copy code',
    'lobby.copylink': 'Copy link',
    'lobby.copied': 'Copied!',
    'lobby.players': 'Players',
    'lobby.settings': 'Room settings',
    'lobby.pvp': 'PvP (players can attack each other)',
    'lobby.chaos': 'Chaos mode (more frequent, harsher disasters)',
    'lobby.hostonly': 'Only the host can change settings',
    'lobby.ready': 'Ready',
    'lobby.unready': 'Not ready',
    'lobby.start': 'Start',
    'lobby.leave': 'Leave',
    'lobby.host': 'host',
    'lobby.isready': 'ready',
    'lobby.notready': 'waiting',
    'lobby.offline': 'offline',
    'lobby.you': 'you',
    'lobby.count': '{n} / {max}',

    'chat.ph': 'Message…',
    'chat.send': 'Send',

    'hud.hp': 'Health',
    'hud.hunger': 'Hunger',
    'hud.thirst': 'Thirst (water)',
    'hud.stamina': 'Stamina',
    'hud.sanity': 'Sanity',
    'hud.temp': 'Body temperature',
    'hud.next': 'Next disaster in {n} s',
    'hud.nonext': 'Disaster: time unknown',
    'hud.ping': 'Ping: {n} ms',
    'hud.leave': 'Leave game',
    'hud.leave.confirm': 'Leave the game and return to the menu?',
    'hud.protect': 'Protected from:',
    'hud.nearfire': 'By the fire',
    'hud.raft': 'Raft',
    'hud.keys': 'E — interact · F — attack · Q — craft · Tab — inventory · Enter — chat',

    'banner.warn': 'In {n} s',
    'banner.warn.sudden': 'Sudden!',
    'banner.active': 'Active · {n} s left',
    'banner.threat': 'Threats:',
    'banner.counter': 'Protects:',
    'banner.sev': 'Severity',

    'inv.title': 'Inventory',
    'inv.empty': 'Empty. Gather resources on the island (E key).',
    'inv.use': 'Use',
    'inv.give': 'Give',
    'inv.givemode': 'Give mode: tap an item to give it to the nearest player',
    'inv.hint': 'Tap an item to use it. The → button gives it to the nearest player.',
    'inv.close': 'Close',

    'craft.title': 'Crafting & building',
    'craft.make': 'Craft',
    'craft.place': 'Build',
    'craft.needs': 'Needs:',
    'craft.near': 'must be nearby: {name}',
    'craft.ok': 'Available',
    'craft.no': 'Missing',
    'craft.item': 'Item',
    'craft.struct': 'Structure',
    'craft.close': 'Close',

    'emote.title': 'Emotes',

    'spec.title': 'Spectating: {name}',
    'spec.dead': 'You died',
    'spec.hint': 'Click a player or use the arrows',
    'spec.prev': 'Previous',
    'spec.next': 'Next',

    'results.title': 'Round results',
    'results.winner': 'Winner: {name}',
    'results.nowinner': 'Nobody survived',
    'results.duration': 'Duration: {t}',
    'results.rank': '#',
    'results.player': 'Player',
    'results.time': 'Time',
    'results.alive': 'Status',
    'results.res': 'Resources',
    'results.surv': 'Survival',
    'results.help': 'Help',
    'results.kills': 'Kills',
    'results.alive.y': 'alive',
    'results.alive.n': 'dead',
    'results.rematch': 'Rematch',
    'results.leave': 'Main menu',
    'results.wait': 'Waiting for the host to start a rematch…',

    'misc.you': 'you',
    'misc.unknown': 'unknown',
    'misc.sec': 's',

    'item.wood': 'Wood', 'item.stone': 'Stone', 'item.food': 'Food', 'item.water': 'Water',
    'item.metal': 'Metal', 'item.cloth': 'Cloth', 'item.fuel': 'Fuel', 'item.medicine': 'Medicine',
    'item.artifact': 'Artifact', 'item.cooked': 'Roast', 'item.fish': 'Fish', 'item.jelly': 'Jelly',
    'item.medkit': 'Medkit', 'item.jacket': 'Jacket', 'item.spear': 'Spear', 'item.armor': 'Armor',
    'item.gasmask': 'Gas mask', 'item.raft': 'Raft',

    'struct.shelter': 'Shelter', 'struct.campfire': 'Campfire', 'struct.bunker': 'Bunker',
    'struct.rod': 'Lightning rod', 'struct.dam': 'Dam', 'struct.filter': 'Water filter',

    'status.burning': 'Burning', 'status.poisoned': 'Poisoned', 'status.wet': 'Wet',
    'status.frozen': 'Frostbite', 'status.stunned': 'Stunned', 'status.slowed': 'Slowed',
    'status.blind': 'Blinded', 'status.confused': 'Confused', 'status.floaty': 'Weightless',
    'status.heavy': 'Heavy', 'status.irradiated': 'Irradiated', 'status.bleeding': 'Bleeding',
    'status.infected': 'Infected', 'status.hunted': 'Hunted', 'status.glowing': 'Glowing',

    'cat.nature': 'Natural', 'cat.bio': 'Biological', 'cat.cosmic': 'Cosmic',
    'cat.magic': 'Absurd', 'cat.tech': 'Man-made', 'cat.social': 'Social',

    'tag.rain': 'rain', 'tag.hail': 'hail', 'tag.wind': 'wind', 'tag.sun': 'sun', 'tag.heat': 'heat',
    'tag.cold': 'cold', 'tag.ash': 'ash', 'tag.impact': 'impacts', 'tag.dark': 'darkness', 'tag.fear': 'fear',
    'tag.fog': 'fog', 'tag.lightning': 'lightning', 'tag.flood': 'flood', 'tag.water': 'water',
    'tag.quake': 'earthquake', 'tag.radiation': 'radiation', 'tag.toxic': 'toxins', 'tag.gas': 'gas',
    'tag.smoke': 'smoke', 'tag.spores': 'spores', 'tag.fire': 'fire', 'tag.explosion': 'explosions',
    'tag.disease': 'disease', 'tag.gravity': 'gravity', 'tag.curse': 'curse', 'tag.magic': 'magic', 'tag.emp': 'EMP', 'tag.blade': 'blades', 'tag.bite': 'bites',

    'log.joined': '{name} joined the game',
    'log.left': '{name} left the game',
    'log.died': '☠️ {name} died{cause}',
    'log.host': '{name} is now the host',
    'log.started': 'The game has started! Survive!',
    'log.gathered': 'Gathered: {item} ×{n}',
    'log.crafted': 'Crafted: {item}',
    'log.built': 'Built: {item}',
    'log.helped': '{name} helped {to}',
    'log.gave': '{name} gave {item} to {to}',
    'log.stole': '🏴‍☠️ Stolen: {item}!',
    'log.cata_warn': '⚠️ Disaster "{name}" in {n} s!',
    'log.cata_start': '💥 Disaster started: {name}',
    'log.cata_end': '✅ Disaster ended: {name}',
    'log.cata_sudden': '❗ Sudden: {name}!',
    'log.eat': 'You ate: {item}',
    'log.drink': 'You drank {item}',
    'log.healed': '❤️ {name} was healed',
    'log.noitem': 'You do not have that item',
    'log.nocraft': 'Not enough resources or the required structure is not nearby',
    'log.far': 'Too far away',
    'log.reconnect': '{name} reconnected',
    'log.won': '🏆 {name} won!',
  },
};

/** Текущий язык. */
let lang = 'ru';
try {
  const saved = localStorage.getItem('ioc_lang');
  if (saved === 'ru' || saved === 'en') lang = saved;
} catch (e) { /* localStorage может быть недоступен — остаёмся на ru */ }

/**
 * Возвращает текущий язык.
 * @returns {'ru'|'en'}
 */
export function getLang() { return lang; }

/**
 * Устанавливает язык и запоминает его в localStorage.
 * @param {'ru'|'en'} l код языка
 * @returns {void}
 */
export function setLang(l) {
  if (!DICT[l]) return;
  lang = l;
  try { localStorage.setItem('ioc_lang', l); } catch (e) { /* игнорируем */ }
  try { document.documentElement.lang = l; } catch (e) { /* нет DOM */ }
}

/**
 * Есть ли перевод для ключа (в текущем языке или в русском).
 * @param {string} key ключ
 * @returns {boolean}
 */
export function has(key) {
  return key in DICT[lang] || key in DICT.ru;
}

/**
 * Подстановка {имя} из args в шаблон. Отсутствующие значения → пустая строка.
 * @param {string} s шаблон
 * @param {Object} [args] значения
 * @returns {string}
 */
function fmt(s, args) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (args && args[k] != null ? args[k] : ''));
}

/**
 * Перевод строки по ключу.
 * @param {string} key ключ словаря
 * @param {Object} [args] значения для подстановки {name}, {n}, …
 * @returns {string} строка; если ключа нет — сам ключ
 */
export function t(key, args) {
  const s = DICT[lang][key] !== undefined ? DICT[lang][key] : DICT.ru[key];
  if (s === undefined) return key;
  return fmt(s, args);
}

/**
 * Перевод имени сущности: `prefix.id` или запасной вариант.
 * @param {string} prefix 'item' | 'struct' | 'status' | 'cat' | 'tag'
 * @param {string} id идентификатор
 * @param {string} [fallback] что вернуть, если перевода нет (по умолчанию id)
 * @returns {string}
 */
export function tn(prefix, id, fallback) {
  const k = prefix + '.' + id;
  return has(k) ? t(k) : (fallback !== undefined ? fallback : String(id));
}

/**
 * Применяет переводы ко всем элементам внутри root.
 * data-i18n → textContent, data-i18n-ph → placeholder, data-i18n-title → title.
 * @param {ParentNode} [root] корень поиска (по умолчанию document)
 * @returns {void}
 */
export function applyI18n(root) {
  const r = root || document;
  r.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
  r.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
  r.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
}
