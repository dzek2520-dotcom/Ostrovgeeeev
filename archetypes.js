/**
 * archetypes.js — вручную написанные базовые катаклизмы («архетипы»).
 *
 * Что делает этот файл:
 *  Экспортирует массив ARCHETYPES (125 штук). Каждый архетип — самостоятельный
 *  катаклизм со своей механикой, а также «заготовка» для процедурного генератора
 *  (generator.js), который умножает их на модификаторы, масштабы, зоны и побочные эффекты.
 *
 *  Формат записи (функция A):
 *   A(id, имя, род, категория, тяжесть, описание, опции)
 *   род: 'm' | 'f' | 'n' | 'p' — нужен генератору для согласования прилагательных;
 *   опции:
 *     t   — теги угроз (чем катаклизм опасен);
 *     c   — counterTags: теги защиты (какой предмет/постройка/биом спасает);
 *     z   — группа допустимых зон (см. ZONE_GROUPS в modifiers.js);
 *     w   — вес выпадения; warn — секунд предупреждения; dur — длительность;
 *     fx  — эффекты (см. fx.js); v — визуал; s — звук; min — мин. игроков;
 *     cmb — с какими категориями может комбинироваться.
 *
 *  Защита: если у игрока есть ЛЮБОЙ из тегов `c` (экипировка, постройка рядом,
 *  биом), вредные эффекты ослабляются (подробнее — effects.js).
 */
import { dmg, st, dr, tl, sp, lt, ph, strike, sd, steal, tele, swap, heal, hunt, vis } from './fx.js';

/** Накопитель архетипов. */
export const ARCHETYPES = [];

/**
 * Регистрирует архетип.
 * @param {string} id уникальный ключ
 * @param {string} name название (именительный падеж)
 * @param {'m'|'f'|'n'|'p'} g грамматический род/число
 * @param {string} cat категория: nature|bio|cosmic|magic|tech|social
 * @param {number} sev тяжесть 1..10
 * @param {string} desc описание для игрока
 * @param {Object} o опции (см. шапку файла)
 * @returns {void}
 */
function A(id, name, g, cat, sev, desc, o = {}) {
  ARCHETYPES.push({
    id, name, g, cat, sev, desc,
    tags: o.t || [], counter: o.c || [], z: o.z || 'ANY', w: o.w || 1,
    warn: o.warn || 8 + sev, dur: o.dur || 30, fx: o.fx || [],
    vis: o.v || vis('#000000', 0, 0, 'none'), snd: o.s || 'rumble',
    min: o.min || 1, cmb: o.cmb || ['nature', 'bio', 'cosmic', 'magic', 'tech'],
  });
}

/* ══════════════ ПРИРОДНЫЕ ══════════════ */
A('earthquake', 'Землетрясение', 'n', 'nature', 6, 'Земля трескается, постройки рушатся, в почве возникают трещины.',
  { t: ['quake', 'impact'], c: ['quake'], z: 'ANY', dur: 25, s: 'rumble', fx: [dmg(2, 'quake'), tl('crack', 0.12), sd(4), st('stunned', 1.5, 0.12)], v: vis('#3a2a1a', 0.12, 8, 'dust') });
A('tsunami', 'Цунами', 'n', 'nature', 8, 'Гигантская волна заливает побережье и смывает всё на пути.',
  { t: ['flood', 'water', 'impact'], c: ['flood', 'water'], z: 'COAST', dur: 22, s: 'water', fx: [tl('flood', 3.5), dmg(3, 'flood'), st('wet', 12, 0.8), ph({ push: [0.6, 0] }), sd(5)], v: vis('#1b6fb0', 0.22, 6, 'waves') });
A('eruption', 'Извержение вулкана', 'n', 'nature', 8, 'Вулкан выбрасывает раскалённые бомбы и пускает лаву.',
  { t: ['fire', 'explosion', 'heat'], c: ['fire', 'explosion', 'heat'], z: 'VOLCANO', dur: 35, s: 'boom', fx: [strike('meteor', 1.6, 1.6, 30), tl('lava', 0.35), dr('temp', 0.6), st('burning', 4, 0.08)], v: vis('#ff4d00', 0.2, 6, 'embers', 0.15) });
A('tornado', 'Торнадо', 'n', 'nature', 7, 'Воронка ветра швыряет игроков и разносит лагеря.',
  { t: ['wind', 'impact'], c: ['wind'], z: 'LOCAL', dur: 25, s: 'wind', fx: [ph({ push: [2.4, -1.4], sm: 0.8 }), dmg(2.5, 'wind'), sd(5), st('confused', 3, 0.15)], v: vis('#aab4bd', 0.14, 5, 'leaves') });
A('hail', 'Град', 'm', 'nature', 4, 'С неба падают ледяные шарики размером с кулак.',
  { t: ['hail', 'impact'], c: ['hail', 'impact'], z: 'WIDE', dur: 24, s: 'pop', fx: [strike('hail', 0.35, 0.7, 7), sd(1), dr('temp', -0.2)], v: vis('#cfe7f5', 0.1, 2, 'snow') });
A('meteor_shower', 'Метеоритный дождь', 'm', 'nature', 8, 'Горящие обломки падают с неба и оставляют воронки.',
  { t: ['impact', 'explosion', 'fire'], c: ['impact', 'explosion'], z: 'WIDE', dur: 28, s: 'boom', fx: [strike('meteor', 1.2, 2, 35), tl('crater', 0.2)], v: vis('#ff7b2e', 0.1, 4, 'embers') });
A('lightning_storm', 'Грозовой шторм', 'm', 'nature', 6, 'Молнии бьют в открытые места. Громоотвод спасёт.',
  { t: ['lightning', 'rain'], c: ['lightning'], z: 'WIDE', dur: 32, s: 'zap', fx: [strike('bolt', 0.9, 1.2, 28), st('wet', 10, 0.5)], v: vis('#2a3550', 0.18, 2, 'rain', 0.25) });
A('drought', 'Засуха', 'f', 'nature', 4, 'Водоёмы мелеют, жажда мучает быстрее.',
  { t: ['heat', 'sun'], c: ['sun', 'heat'], z: 'WIDE', dur: 55, s: 'wind', fx: [dr('thirst', -1.1), dr('temp', 0.25), tl('dry', 0.5)], v: vis('#ffcf6b', 0.12, 0, 'dust') });
A('flood', 'Наводнение', 'n', 'nature', 6, 'Вода медленно поднимается и затапливает низины.',
  { t: ['flood', 'water'], c: ['flood', 'water'], z: 'ANY', dur: 45, s: 'water', fx: [tl('flood', 2.2), st('wet', 12, 0.6), dmg(0.6, 'flood')], v: vis('#2f89c9', 0.15, 1, 'rain') });
A('avalanche', 'Лавина', 'f', 'nature', 6, 'Камни и снег сходят с холмов полосой разрушения.',
  { t: ['impact'], c: ['impact', 'quake'], z: 'LINE', dur: 14, s: 'rumble', fx: [dmg(7, 'impact'), st('stunned', 2, 0.3), sd(8)], v: vis('#e6eef5', 0.12, 6, 'snow') });
A('sandstorm', 'Песчаная буря', 'f', 'nature', 5, 'Ветер с песком слепит и режет кожу.',
  { t: ['wind', 'ash'], c: ['ash', 'wind'], z: 'WIDE', dur: 35, s: 'wind', fx: [st('blind', 4, 0.6), dmg(0.9, 'ash'), ph({ sm: 0.8, push: [1.2, 0.3] })], v: vis('#c9a45c', 0.28, 2, 'dust', 0.1) });
A('wildfire', 'Лесной пожар', 'm', 'nature', 7, 'Огонь стремительно перекидывается с дерева на дерево.',
  { t: ['fire', 'smoke', 'heat'], c: ['fire', 'smoke'], z: 'ANY', dur: 45, s: 'wind', fx: [tl('burn', 1.4), dr('temp', 0.5), st('blind', 3, 0.15)], v: vis('#ff5a00', 0.18, 1, 'embers', 0.1) });
A('fog', 'Густой туман', 'm', 'nature', 3, 'Видимость падает, рассудок плывёт.',
  { t: ['fog', 'fear'], c: ['fog', 'fear'], z: 'WIDE', dur: 50, s: 'wail', fx: [dr('sanity', -0.35), ph({ sm: 0.9 }), st('blind', 3, 0.25)], v: vis('#cfd8dc', 0.3, 0, 'none', 0.2) });
A('acid_rain', 'Кислотный дождь', 'm', 'nature', 6, 'Едкий дождь разъедает кожу, постройки и землю.',
  { t: ['toxic', 'rain'], c: ['toxic', 'rain'], z: 'WIDE', dur: 40, s: 'buzz', fx: [dmg(1.6, 'toxic'), sd(2.5), tl('toxic', 0.4), st('poisoned', 8, 0.1)], v: vis('#9be15d', 0.2, 0, 'rain') });
A('blizzard', 'Метель', 'f', 'nature', 6, 'Ледяной ветер, снег и нулевая видимость.',
  { t: ['cold', 'wind'], c: ['cold', 'wind'], z: 'WIDE', dur: 40, s: 'wind', fx: [dr('temp', -1.3), ph({ sm: 0.75, push: [-1, 0.4] }), st('blind', 3, 0.3), tl('freeze', 0.3)], v: vis('#e8f3ff', 0.3, 1, 'snow') });
A('heatwave', 'Аномальная жара', 'f', 'nature', 5, 'Раскалённый воздух и солнце без пощады.',
  { t: ['heat', 'sun'], c: ['heat', 'sun'], z: 'WIDE', dur: 45, s: 'wind', fx: [dr('temp', 1.1), dr('thirst', -0.7), st('burning', 3, 0.04)], v: vis('#ff9a3d', 0.2, 0, 'dust') });
A('cold_snap', 'Резкое похолодание', 'n', 'nature', 4, 'Температура падает, вода замерзает.',
  { t: ['cold'], c: ['cold'], z: 'WIDE', dur: 45, s: 'wind', fx: [dr('temp', -0.9), tl('freeze', 0.4)], v: vis('#a9d6ff', 0.15, 0, 'snow') });
A('monsoon', 'Муссон', 'm', 'nature', 5, 'Нескончаемый ливень и сильный ветер.',
  { t: ['rain', 'wind', 'flood'], c: ['rain', 'wind'], z: 'WIDE', dur: 45, s: 'water', fx: [tl('flood', 0.9), st('wet', 10, 0.6), sd(0.8), ph({ push: [1.0, 0.5], sm: 0.9 })], v: vis('#3a5f86', 0.22, 1, 'rain', 0.2) });
A('geyser', 'Гейзерное поле', 'n', 'nature', 5, 'Из земли бьют струи кипятка.',
  { t: ['heat', 'water'], c: ['heat', 'water'], z: 'LOCAL', dur: 30, s: 'pop', fx: [strike('splash', 1.4, 1.3, 16), st('burning', 3, 0.1)], v: vis('#d7ecf5', 0.1, 2, 'bubbles') });
A('sinkhole', 'Провал грунта', 'm', 'nature', 6, 'Земля внезапно проваливается, оставляя бездонные трещины.',
  { t: ['quake'], c: ['quake'], z: 'LOCAL', dur: 18, s: 'rumble', fx: [tl('crack', 0.35), dmg(4, 'quake')], v: vis('#2a1d12', 0.1, 6, 'dust') });
A('landslide', 'Оползень', 'm', 'nature', 5, 'Склоны сползают, превращаясь в груды камня.',
  { t: ['impact'], c: ['impact', 'quake'], z: 'LINE', dur: 20, s: 'rumble', fx: [dmg(4, 'impact'), tl('rock', 0.4), st('slowed', 5, 0.4)], v: vis('#7a6a58', 0.1, 4, 'dust') });
A('ashfall', 'Пепельный дождь', 'm', 'nature', 5, 'Серый пепел засыпает остров, трудно дышать.',
  { t: ['ash', 'gas'], c: ['ash', 'gas'], z: 'WIDE', dur: 45, s: 'wind', fx: [dmg(0.8, 'ash'), tl('ash', 0.6), ph({ sm: 0.85 }), st('blind', 3, 0.2)], v: vis('#6b6663', 0.28, 0, 'ash', 0.2) });
A('pyroclastic', 'Пирокластический поток', 'm', 'nature', 9, 'Раскалённая лавина газа и пепла стекает со склонов вулкана.',
  { t: ['heat', 'fire', 'ash'], c: ['heat', 'fire'], z: 'VOLCANO', dur: 18, s: 'boom', fx: [dmg(7, 'heat'), tl('ash', 1.2), st('burning', 5, 0.35)], v: vis('#7a3b22', 0.3, 5, 'ash', 0.3) });
A('aurora', 'Полярное сияние', 'n', 'nature', 1, 'Небо переливается светом; души успокаиваются.',
  { t: [], c: [], z: 'ISLAND', dur: 40, w: 0.8, s: 'chime', fx: [dr('sanity', 1.4), st('glowing', 10, 0.8)], v: vis('#5cffc4', 0.16, 0, 'stars') });
A('rainbow', 'Радужный цветок', 'm', 'nature', 1, 'Всё расцветает: раны затягиваются, из земли лезет еда.',
  { t: [], c: [], z: 'WIDE', dur: 35, w: 0.8, s: 'chime', fx: [heal(1.6), lt('food', 1, 4), lt('medicine', 1, 9)], v: vis('#ffb3f0', 0.1, 0, 'leaves') });
A('low_tide', 'Сильный отлив', 'm', 'nature', 2, 'Море отступает: на мели видно рыбу и ракушки.',
  { t: [], c: [], z: 'COAST', dur: 35, w: 0.9, s: 'water', fx: [tl('dry', 0.8), lt('fish', 1, 2.5)], v: vis('#7fc9e8', 0.08, 0, 'bubbles') });
A('whirlpool', 'Водоворот', 'm', 'nature', 6, 'Воронка затягивает всё, что оказалось рядом.',
  { t: ['water', 'flood'], c: ['water', 'flood'], z: 'WET', dur: 25, s: 'water', fx: [ph({ pull: 3.2 }), dmg(2.2, 'water'), st('confused', 3, 0.2)], v: vis('#2b78a8', 0.15, 3, 'waves') });
A('hot_springs', 'Горячие источники', 'm', 'nature', 1, 'Тёплая вода лечит и греет.',
  { t: [], c: [], z: 'LOCAL', dur: 40, w: 0.7, s: 'chime', fx: [heal(1.4), dr('temp', 0.6)], v: vis('#f4d7ff', 0.08, 0, 'bubbles') });
A('permafrost', 'Вечная мерзлота', 'f', 'nature', 5, 'Земля покрывается льдом, ходить скользко.',
  { t: ['cold'], c: ['cold'], z: 'WIDE', dur: 40, s: 'wind', fx: [tl('freeze', 0.9), dr('temp', -0.6)], v: vis('#bfe8f5', 0.18, 0, 'snow') });
A('volcanic_bombs', 'Вулканические бомбы', 'p', 'nature', 7, 'Куски лавы падают дождём вокруг вулкана.',
  { t: ['explosion', 'fire', 'impact'], c: ['explosion', 'impact'], z: 'VOLCANO', dur: 25, s: 'boom', fx: [strike('meteor', 0.7, 1.3, 24), tl('burn', 0.3)], v: vis('#ff6b1a', 0.14, 4, 'embers') });
A('mudslide', 'Грязевой сель', 'm', 'nature', 5, 'Вязкая грязь стекает по склонам и затягивает ноги.',
  { t: ['impact'], c: ['impact'], z: 'LOCAL', dur: 35, s: 'water', fx: [tl('mud', 1.1), ph({ sm: 0.7 }), dmg(1, 'impact')], v: vis('#6b5236', 0.15, 2, 'bubbles') });
A('ball_lightning', 'Шаровые молнии', 'p', 'nature', 6, 'Светящиеся шары плывут над островом и взрываются при контакте.',
  { t: ['lightning', 'explosion'], c: ['lightning', 'explosion'], z: 'LOCAL', dur: 30, s: 'zap', fx: [strike('bolt', 1.4, 1.8, 22), sp('spirit', 1, 10)], v: vis('#9fb6ff', 0.14, 2, 'sparks', 0.1) });
A('dust_devils', 'Пылевые вихри', 'p', 'nature', 4, 'Десятки маленьких смерчей кружат по острову.',
  { t: ['wind', 'ash'], c: ['wind', 'ash'], z: 'WIDE', dur: 30, s: 'wind', fx: [ph({ push: [1.6, -1.1] }), st('confused', 2, 0.15), dmg(0.8, 'wind')], v: vis('#c7a468', 0.16, 2, 'dust') });
A('firestorm', 'Огненный шторм', 'm', 'nature', 9, 'Огонь создаёт собственный ветер и пожирает всё.',
  { t: ['fire', 'heat', 'wind'], c: ['fire', 'heat'], z: 'WIDE', dur: 30, s: 'boom', fx: [tl('burn', 2.2), dmg(4, 'fire'), st('burning', 4, 0.3), ph({ push: [1.5, 0] })], v: vis('#ff3d00', 0.28, 4, 'embers', 0.1) });
A('thundersnow', 'Грозовой снегопад', 'm', 'nature', 6, 'Молнии сверкают сквозь снежную пелену.',
  { t: ['lightning', 'cold'], c: ['lightning', 'cold'], z: 'WIDE', dur: 35, s: 'zap', fx: [strike('bolt', 1.6, 1, 22), dr('temp', -0.7)], v: vis('#c8d6ee', 0.22, 2, 'snow', 0.15) });
A('freak_wave', 'Волна-убийца', 'f', 'nature', 7, 'Одиночная чудовищная волна накрывает береговую полосу.',
  { t: ['water', 'flood', 'impact'], c: ['water', 'flood'], z: 'COAST', dur: 15, s: 'water', fx: [strike('splash', 1.2, 3, 26), tl('flood', 2.5), ph({ push: [0.8, 0.8] })], v: vis('#1f7fc4', 0.2, 5, 'waves') });
A('rockfall', 'Камнепад', 'm', 'nature', 5, 'Камни сыплются со скал.',
  { t: ['impact'], c: ['impact', 'hail'], z: 'LOCAL', dur: 25, s: 'boom', fx: [strike('boom', 0.8, 1, 20), tl('rock', 0.15)], v: vis('#807468', 0.08, 3, 'dust') });
A('quicksand', 'Зыбучие пески', 'p', 'nature', 4, 'Пляж превращается в вязкую ловушку.',
  { t: [], c: [], z: 'COAST', dur: 40, s: 'rumble', fx: [tl('mud', 0.8), ph({ sm: 0.6 }), st('slowed', 4, 0.4)], v: vis('#cdb06a', 0.1, 1, 'dust') });
A('ice_storm', 'Ледяной шторм', 'm', 'nature', 6, 'Град и мороз одновременно.',
  { t: ['hail', 'cold'], c: ['hail', 'cold'], z: 'WIDE', dur: 35, s: 'wind', fx: [strike('hail', 0.5, 0.8, 8), dr('temp', -0.9), tl('freeze', 0.5)], v: vis('#bfe3ff', 0.2, 2, 'snow') });
A('salt_rain', 'Солёный дождь', 'm', 'nature', 3, 'Дождь из морской воды: пить хочется ещё больше.',
  { t: ['rain'], c: ['rain'], z: 'WIDE', dur: 40, s: 'water', fx: [dr('thirst', -0.9), st('wet', 8, 0.5), dmg(0.4, 'toxic')], v: vis('#9ad0e8', 0.14, 0, 'rain') });
A('sinking', 'Оседание острова', 'n', 'nature', 8, 'Остров медленно уходит под воду по краям.',
  { t: ['flood', 'water'], c: ['flood', 'water'], z: 'COAST', dur: 50, w: 0.7, s: 'rumble', fx: [tl('sink', 1.3), dmg(0.8, 'flood')], v: vis('#1d5d96', 0.14, 3, 'waves') });
A('fertile_rain', 'Плодородный ливень', 'm', 'nature', 1, 'Дождь оживляет землю: растёт лес, падают плоды.',
  { t: [], c: [], z: 'WIDE', dur: 40, w: 0.8, s: 'water', fx: [tl('grow', 0.9), lt('wood', 1, 3), lt('food', 1, 5)], v: vis('#7bd88f', 0.12, 0, 'rain') });
A('calm_mist', 'Целебная дымка', 'f', 'nature', 1, 'Прохладная дымка исцеляет тело и ум.',
  { t: [], c: [], z: 'LOCAL', dur: 40, w: 0.7, s: 'chime', fx: [heal(1.1), dr('sanity', 0.8)], v: vis('#d9ffee', 0.18, 0, 'bubbles') });
A('sea_storm', 'Морской шторм', 'm', 'nature', 6, 'Волны бьют по берегу, ветер валит с ног.',
  { t: ['wind', 'water', 'rain'], c: ['wind', 'water'], z: 'COAST', dur: 38, s: 'wind', fx: [ph({ push: [-1.4, 0], sm: 0.85 }), strike('splash', 1.5, 1.6, 12), st('wet', 8, 0.5)], v: vis('#2c4f77', 0.2, 3, 'rain', 0.2) });
A('thermal_vents', 'Подводные термы', 'p', 'nature', 3, 'Тёплая вода выносит на мелководье рыбу.',
  { t: [], c: [], z: 'COAST', dur: 40, w: 0.8, s: 'pop', fx: [lt('fish', 1, 2), dr('temp', 0.3)], v: vis('#bde6ff', 0.06, 0, 'bubbles') });

/* ══════════════ БИОЛОГИЧЕСКИЕ ══════════════ */
A('plague', 'Чума', 'f', 'bio', 7, 'Болезнь передаётся по воздуху и от игрока к игроку.',
  { t: ['disease'], c: ['disease', 'gas'], z: 'WIDE', dur: 55, s: 'wail', fx: [st('infected', 30, 0.2), dmg(0.5, 'disease'), dr('stamina', -0.8)], v: vis('#7d9c4a', 0.16, 0, 'spores', 0.1) });
A('insect_swarm', 'Рой насекомых', 'm', 'bio', 4, 'Тучи жалящих насекомых заполняют воздух.',
  { t: ['bite'], c: ['bite', 'smoke'], z: 'LOCAL', dur: 35, s: 'buzz', fx: [sp('swarm', 4, 4), st('slowed', 3, 0.1)], v: vis('#3a3a1a', 0.1, 0, 'dust') });
A('mutant_animals', 'Мутировавшие животные', 'p', 'bio', 7, 'Местная фауна изменилась — и она голодна.',
  { t: ['bite', 'blade'], c: ['bite', 'blade'], z: 'LOCAL', dur: 45, s: 'wail', fx: [sp('mutant', 1, 7), sp('crab', 2, 6)], v: vis('#5aa05a', 0.1, 0, 'spores', 0.1) });
A('toxic_mushrooms', 'Ядовитые грибы', 'p', 'bio', 4, 'Грибы вырастают за секунды и выпускают споры.',
  { t: ['spores', 'toxic'], c: ['spores', 'toxic'], z: 'LOCAL', dur: 40, s: 'pop', fx: [tl('spore', 0.9), st('poisoned', 10, 0.2), dr('sanity', -0.2)], v: vis('#b36bff', 0.14, 0, 'spores') });
A('zombie_mold', 'Зомби-плесень', 'f', 'bio', 8, 'Споры поднимают мёртвых животных и… не только.',
  { t: ['spores', 'disease', 'bite'], c: ['spores', 'bite'], z: 'LOCAL', dur: 50, s: 'wail', fx: [tl('spore', 0.7), sp('zombie', 1, 6), st('infected', 20, 0.1)], v: vis('#6aa83a', 0.18, 0, 'spores', 0.2) });
A('wolf_pack', 'Волчья стая', 'f', 'bio', 6, 'Стая волков выходит на охоту.',
  { t: ['bite', 'fear'], c: ['bite', 'fear'], z: 'LOCAL', dur: 40, s: 'wail', fx: [sp('wolf', 1, 5)], v: vis('#1b2433', 0.12, 0, 'none', 0.25) });
A('crab_invasion', 'Нашествие крабов', 'n', 'bio', 4, 'Клешни повсюду — крабы лезут из воды.',
  { t: ['bite'], c: ['bite', 'blade'], z: 'COAST', dur: 40, s: 'pop', fx: [sp('crab', 2, 3)], v: vis('#e86a50', 0.06, 0, 'none') });
A('jellyfish_bloom', 'Цветение медуз', 'n', 'bio', 4, 'Мелководье кишит жгучими медузами.',
  { t: ['bite', 'toxic'], c: ['toxic', 'bite'], z: 'COAST', dur: 40, s: 'pop', fx: [sp('jelly', 2, 4), st('poisoned', 6, 0.1)], v: vis('#ff9ad8', 0.1, 0, 'bubbles') });
A('pollen', 'Аллергенная пыльца', 'f', 'bio', 3, 'Жёлтое облако пыльцы: слезятся глаза, трудно бежать.',
  { t: ['spores', 'gas'], c: ['spores', 'gas'], z: 'WIDE', dur: 40, s: 'wind', fx: [st('blind', 3, 0.3), ph({ sm: 0.85 }), dr('stamina', -1.2)], v: vis('#f2e05a', 0.22, 0, 'dust') });
A('rabid_gulls', 'Бешеные чайки', 'p', 'bio', 4, 'Чайки нападают и воруют еду.',
  { t: ['bite'], c: ['bite'], z: 'COAST', dur: 35, s: 'wail', fx: [sp('gull', 2, 4), steal(12)], v: vis('#d9e2ec', 0.06, 0, 'none') });
A('swamp_fever', 'Болотная лихорадка', 'f', 'bio', 5, 'Миазмы болота вызывают жар и бред.',
  { t: ['disease', 'gas'], c: ['disease', 'gas'], z: 'SWAMPY', dur: 50, s: 'wail', fx: [st('infected', 20, 0.2), dr('temp', 0.4), dr('sanity', -0.3)], v: vis('#7a8c3a', 0.2, 0, 'spores', 0.15) });
A('locusts', 'Саранча', 'f', 'bio', 5, 'Саранча пожирает посевы и еду в запасах.',
  { t: ['bite'], c: ['bite', 'smoke'], z: 'WIDE', dur: 40, s: 'buzz', fx: [dr('hunger', -0.9), sp('swarm', 3, 5)], v: vis('#8a7a2a', 0.12, 0, 'dust') });
A('algae_bloom', 'Цветение водорослей', 'n', 'bio', 3, 'Вода зеленеет и становится ядовитой.',
  { t: ['toxic', 'water'], c: ['toxic', 'gas'], z: 'WET', dur: 50, s: 'pop', fx: [tl('toxic', 0.5), dr('thirst', -0.6), st('poisoned', 8, 0.15)], v: vis('#4fb04f', 0.14, 0, 'bubbles') });
A('parasites', 'Паразиты', 'p', 'bio', 4, 'Невидимые паразиты высасывают силы.',
  { t: ['disease'], c: ['disease'], z: 'ISLAND', dur: 50, s: 'wail', fx: [dr('hunger', -0.7), dr('stamina', -0.9), st('infected', 15, 0.1)], v: vis('#8f5a2a', 0.08, 0, 'none') });
A('healing_herbs', 'Цветение целебных трав', 'n', 'bio', 1, 'Повсюду вырастают лекарственные травы.',
  { t: [], c: [], z: 'WIDE', dur: 40, w: 0.8, s: 'chime', fx: [lt('medicine', 1, 3), heal(0.6)], v: vis('#8cff8c', 0.1, 0, 'leaves') });
A('bat_colony', 'Стая летучих мышей', 'f', 'bio', 3, 'Тысячи мышей закрывают небо.',
  { t: ['bite', 'dark'], c: ['bite', 'dark'], z: 'LOCAL', dur: 30, s: 'wail', fx: [sp('swarm', 3, 4), st('blind', 2, 0.2)], v: vis('#1a1426', 0.2, 0, 'none', 0.35) });

/* ══════════════ КОСМИЧЕСКИЕ ══════════════ */
A('eclipse', 'Затмение', 'n', 'cosmic', 4, 'Солнце гаснет. Холод и страх расползаются по острову.',
  { t: ['dark', 'fear', 'cold'], c: ['dark', 'fear'], z: 'ISLAND', dur: 45, s: 'wail', fx: [dr('sanity', -0.7), dr('temp', -0.4), sp('spirit', 1, 12)], v: vis('#10101f', 0.25, 0, 'stars', 0.6) });
A('gravity_shift', 'Смена гравитации', 'f', 'cosmic', 6, 'Вес меняется: прыжки, спотыкания, тяжесть.',
  { t: ['gravity'], c: ['gravity', 'magic'], z: 'WIDE', dur: 35, s: 'wail', fx: [st('heavy', 6, 0.4), ph({ sm: 0.65 }), dr('stamina', -1.4)], v: vis('#6b4bd6', 0.16, 3, 'stars') });
A('satellite_fall', 'Падение спутника', 'n', 'cosmic', 9, 'Обломки спутника врезаются в остров.',
  { t: ['impact', 'explosion', 'fire'], c: ['explosion', 'impact'], z: 'LOCAL', dur: 14, w: 0.7, s: 'boom', fx: [strike('meteor', 1.8, 3.2, 55), lt('metal', 2, 4), tl('crater', 0.4)], v: vis('#ff9650', 0.15, 7, 'embers') });
A('solar_flare', 'Солнечная вспышка', 'f', 'cosmic', 6, 'Ослепляющая вспышка и волна жара.',
  { t: ['heat', 'sun', 'emp'], c: ['sun', 'heat'], z: 'ISLAND', dur: 25, s: 'zap', fx: [dr('temp', 1.5), st('blind', 4, 0.5), st('burning', 3, 0.06)], v: vis('#fff3a0', 0.4, 2, 'sparks') });
A('mini_black_hole', 'Мини-чёрная дыра', 'f', 'cosmic', 9, 'Крошечная чёрная дыра всасывает всё, что рядом.',
  { t: ['gravity', 'impact'], c: ['gravity', 'magic'], z: 'LOCAL', dur: 20, w: 0.6, s: 'rumble', fx: [ph({ pull: 5 }), dmg(5, 'gravity'), tl('crater', 0.2)], v: vis('#150a2a', 0.25, 5, 'stars', 0.4) });
A('comet_tail', 'Хвост кометы', 'm', 'cosmic', 3, 'Остров проходит сквозь хвост кометы: сыпется космический металл.',
  { t: ['impact'], c: ['impact'], z: 'WIDE', dur: 35, w: 0.8, s: 'chime', fx: [lt('metal', 1, 2.5), strike('hail', 1.6, 0.8, 6)], v: vis('#a9e2ff', 0.1, 1, 'stars') });
A('cosmic_radiation', 'Космическая радиация', 'f', 'cosmic', 6, 'Поток частиц из космоса заражает землю и людей.',
  { t: ['radiation'], c: ['radiation'], z: 'WIDE', dur: 45, s: 'buzz', fx: [tl('rad', 0.6), st('irradiated', 20, 0.15), dmg(0.7, 'radiation')], v: vis('#e0ff4a', 0.15, 0, 'sparks') });
A('lunar_tide', 'Лунный прилив', 'm', 'cosmic', 5, 'Огромная луна тянет океан на берег.',
  { t: ['flood', 'water'], c: ['flood', 'water'], z: 'COAST', dur: 40, s: 'water', fx: [tl('flood', 1.6), ph({ pull: 1.2 })], v: vis('#c7d6ff', 0.15, 2, 'waves', 0.1) });
A('starfall', 'Звездопад желаний', 'm', 'cosmic', 1, 'Падающие звёзды оставляют артефакты и спокойствие.',
  { t: [], c: [], z: 'ISLAND', dur: 35, w: 0.6, s: 'chime', fx: [lt('artifact', 1, 12), dr('sanity', 0.7)], v: vis('#ffe9a6', 0.1, 0, 'stars', 0.15) });
A('time_slip', 'Сдвиг времени', 'm', 'cosmic', 5, 'Пространство дрожит, игроков перебрасывает по острову.',
  { t: ['gravity'], c: ['gravity', 'magic'], z: 'ISLAND', dur: 30, s: 'zap', fx: [tele(7), st('confused', 4, 0.2)], v: vis('#7aa0ff', 0.14, 3, 'stars') });
A('antigravity', 'Антигравитация', 'f', 'cosmic', 3, 'Всё парит и скользит; бегать легко, а остановиться трудно.',
  { t: ['gravity'], c: ['gravity'], z: 'WIDE', dur: 35, w: 0.8, s: 'chime', fx: [ph({ sm: 1.35 }), st('floaty', 5, 0.8), dr('stamina', 1.2)], v: vis('#bde0ff', 0.12, 0, 'bubbles') });
A('neutron_mist', 'Нейтронная дымка', 'f', 'cosmic', 7, 'Светящийся туман пробирает до костей.',
  { t: ['radiation', 'gas'], c: ['radiation', 'gas'], z: 'LOCAL', dur: 35, s: 'buzz', fx: [dmg(2.5, 'radiation'), st('irradiated', 15, 0.3), tl('rad', 0.5)], v: vis('#9cff6a', 0.2, 0, 'sparks', 0.2) });

/* ══════════════ МАГИЧЕСКИЕ / АБСУРДНЫЕ ══════════════ */
A('fish_rain', 'Дождь из рыб', 'm', 'magic', 1, 'С неба падает рыба. Ешьте, пока свежая!',
  { t: [], c: [], z: 'WIDE', dur: 30, w: 1.2, s: 'pop', fx: [lt('fish', 2, 1.2), strike('splash', 3, 0.5, 2)], v: vis('#7fb7ff', 0.08, 0, 'fish') });
A('living_trees', 'Оживающие деревья', 'p', 'magic', 6, 'Деревья выдёргивают корни и идут за вами.',
  { t: ['impact', 'blade'], c: ['impact', 'blade'], z: 'LOCAL', dur: 40, s: 'wail', fx: [sp('golem', 1, 14), sp('mutant', 1, 10)], v: vis('#2f6b2f', 0.12, 2, 'leaves') });
A('giant_gulls', 'Гигантские чайки', 'p', 'magic', 5, 'Чайки размером с собаку воруют всё подряд.',
  { t: ['bite'], c: ['bite'], z: 'COAST', dur: 35, s: 'wail', fx: [sp('gull', 3, 5), steal(8)], v: vis('#f4f4ff', 0.05, 0, 'none') });
A('vanishing_items', 'Исчезающие предметы', 'p', 'magic', 4, 'Вещи пропадают из рюкзаков.',
  { t: ['curse'], c: ['magic', 'curse'], z: 'ISLAND', dur: 35, s: 'chime', fx: [steal(5), dr('sanity', -0.2)], v: vis('#d0b8ff', 0.1, 0, 'stars') });
A('control_inversion', 'Инверсия управления', 'f', 'magic', 4, 'Право — это лево, вверх — это вниз.',
  { t: ['curse'], c: ['magic', 'curse'], z: 'ISLAND', dur: 30, w: 1.2, s: 'zap', fx: [ph({ invert: true }), st('confused', 4, 0.5)], v: vis('#ff6bd6', 0.14, 1, 'sparks') });
A('talking_rocks', 'Говорящие камни', 'p', 'magic', 3, 'Камни шепчут страшные тайны и сводят с ума.',
  { t: ['fear', 'curse'], c: ['fear', 'magic'], z: 'LOCAL', dur: 40, s: 'wail', fx: [dr('sanity', -0.8), sp('spirit', 1, 15)], v: vis('#7a7a99', 0.12, 0, 'none', 0.2) });
A('jelly_rain', 'Дождь из желе', 'm', 'magic', 1, 'Сладкое желе падает с небес: вкусно и вязко.',
  { t: [], c: [], z: 'WIDE', dur: 35, w: 1.1, s: 'pop', fx: [lt('jelly', 2, 1.4), ph({ sm: 0.85 })], v: vis('#ff7ac8', 0.14, 0, 'bubbles') });
A('drifting_island', 'Дрейф острова', 'm', 'magic', 4, 'Остров уплывает: всё скользит в одну сторону.',
  { t: [], c: [], z: 'ISLAND', dur: 45, w: 0.8, s: 'water', fx: [ph({ push: [0.9, 0.6] }), dr('stamina', -0.4)], v: vis('#5aa0d9', 0.1, 3, 'waves') });
A('whispering_fog', 'Шепчущий туман', 'm', 'magic', 5, 'Из тумана слышатся голоса тех, кого уже нет.',
  { t: ['fog', 'fear', 'curse'], c: ['fog', 'fear', 'magic'], z: 'WIDE', dur: 40, s: 'wail', fx: [dr('sanity', -0.9), sp('spirit', 1, 9)], v: vis('#c9c1e8', 0.3, 0, 'none', 0.3) });
A('sock_rain', 'Дождь из носков', 'm', 'magic', 1, 'Откуда столько носков? Зато ткань пригодится.',
  { t: [], c: [], z: 'WIDE', dur: 30, w: 1.0, s: 'pop', fx: [lt('cloth', 2, 1.5)], v: vis('#ffd36b', 0.08, 0, 'leaves') });
A('dancing_shadows', 'Танцующие тени', 'p', 'magic', 5, 'Тени отрываются от земли и нападают.',
  { t: ['fear', 'dark'], c: ['fear', 'dark'], z: 'LOCAL', dur: 40, s: 'wail', fx: [sp('spirit', 2, 7), dr('sanity', -0.5)], v: vis('#150f26', 0.2, 0, 'none', 0.45) });
A('ghost_parade', 'Парад призраков', 'm', 'magic', 5, 'Призраки маршируют по острову и пугают живых.',
  { t: ['fear', 'curse'], c: ['fear', 'magic'], z: 'WIDE', dur: 40, s: 'wail', fx: [sp('spirit', 2, 8), dr('sanity', -0.6)], v: vis('#a8c8ff', 0.16, 0, 'stars', 0.25) });
A('mirror_swap', 'Зеркальный обмен', 'm', 'magic', 3, 'Игроки меняются местами без предупреждения.',
  { t: ['curse'], c: ['magic'], z: 'ISLAND', dur: 35, w: 1.1, s: 'zap', fx: [swap(5), st('confused', 3, 0.2)], v: vis('#d6f0ff', 0.12, 1, 'sparks') });
A('teleport_storm', 'Телепортационная буря', 'f', 'magic', 4, 'Воздух искрит — и вас выбрасывает в случайное место.',
  { t: ['curse'], c: ['magic'], z: 'ISLAND', dur: 30, s: 'zap', fx: [tele(4), st('confused', 3, 0.3)], v: vis('#6bd6ff', 0.14, 2, 'sparks') });
A('candy_rain', 'Конфетный дождь', 'm', 'magic', 1, 'Липкие конфеты сыплются дождём. Рассудок в восторге.',
  { t: [], c: [], z: 'WIDE', dur: 30, w: 1.0, s: 'chime', fx: [lt('food', 1, 1.8), dr('sanity', 0.5), ph({ sm: 0.9 })], v: vis('#ff9ad8', 0.12, 0, 'leaves') });
A('magnetic_anomaly', 'Магнитная аномалия', 'f', 'magic', 4, 'Металл притягивается, компасы сходят с ума.',
  { t: ['emp'], c: ['emp'], z: 'LOCAL', dur: 35, s: 'buzz', fx: [steal(9), st('confused', 3, 0.2), ph({ pull: 1.5 })], v: vis('#b0b8d0', 0.1, 1, 'sparks') });
A('opposite_day', 'День наоборот', 'm', 'magic', 3, 'Дерево кормит, а еда ранит. Или наоборот?',
  { t: ['curse'], c: ['magic', 'curse'], z: 'ISLAND', dur: 30, w: 1.0, s: 'chime', fx: [ph({ invert: true }), heal(0.5), dr('hunger', -0.4)], v: vis('#ffd0ff', 0.16, 0, 'stars') });
A('living_sand', 'Оживший песок', 'm', 'magic', 6, 'Песок поднимается в виде гигантских големов.',
  { t: ['impact'], c: ['impact'], z: 'COAST', dur: 40, s: 'rumble', fx: [sp('golem', 1, 12), tl('mud', 0.3)], v: vis('#d9bf7a', 0.14, 3, 'dust') });
A('wisp_lights', 'Блуждающие огоньки', 'p', 'magic', 3, 'Огоньки заманивают в трясину.',
  { t: ['fear', 'curse'], c: ['fear', 'magic'], z: 'SWAMPY', dur: 40, s: 'chime', fx: [st('confused', 4, 0.3), dr('sanity', -0.4), tl('mud', 0.3)], v: vis('#8cffd0', 0.1, 0, 'stars', 0.3) });
A('coin_rain', 'Дождь из монет', 'm', 'magic', 1, 'Старые монеты и артефакты падают с небес.',
  { t: [], c: [], z: 'LOCAL', dur: 25, w: 0.5, s: 'chime', fx: [lt('artifact', 1, 6), lt('metal', 1, 3)], v: vis('#ffe066', 0.1, 0, 'sparks') });
A('totem_curse', 'Проклятие тотема', 'n', 'magic', 7, 'Древний тотем помечает жертву проклятием.',
  { t: ['curse', 'fear'], c: ['curse', 'magic', 'fear'], z: 'ISLAND', dur: 40, min: 2, s: 'wail', fx: [hunt(15), dr('sanity', -0.5), dmg(0.6, 'curse')], v: vis('#3a0f4a', 0.2, 2, 'stars', 0.3) });
A('sky_laughter', 'Смех небес', 'm', 'magic', 3, 'Небо хохочет. Нервы не выдерживают.',
  { t: ['fear'], c: ['fear', 'magic'], z: 'ISLAND', dur: 30, w: 1.0, s: 'wail', fx: [dr('sanity', -1.0), st('confused', 3, 0.2)], v: vis('#ffcf3a', 0.14, 1, 'stars', 0.1) });
A('dancing_stones', 'Танец камней', 'm', 'magic', 5, 'Камни скачут по острову, как мячи.',
  { t: ['impact'], c: ['impact'], z: 'LOCAL', dur: 28, s: 'boom', fx: [strike('boom', 0.9, 1.1, 16), tl('rock', 0.1)], v: vis('#8a8a98', 0.08, 3, 'dust') });
A('balloons', 'Воздушные шары', 'p', 'magic', 2, 'Шарики подхватывают вас — вы парите над землёй.',
  { t: [], c: [], z: 'WIDE', dur: 30, w: 1.0, s: 'pop', fx: [st('floaty', 6, 0.9), ph({ sm: 1.2, push: [0.5, -0.6] })], v: vis('#ff8ad0', 0.08, 0, 'bubbles') });
A('echo_island', 'Эхо-остров', 'n', 'magic', 4, 'Звуки и позиции отражаются: игроки меняются местами и рассудок плывёт.',
  { t: ['curse'], c: ['magic'], z: 'ISLAND', dur: 30, s: 'wail', fx: [swap(7), dr('sanity', -0.3)], v: vis('#a0a0ff', 0.14, 1, 'none', 0.15) });
A('pink_fog', 'Розовый туман', 'm', 'magic', 3, 'Сладкий туман дезориентирует.',
  { t: ['fog'], c: ['fog', 'magic'], z: 'WIDE', dur: 35, s: 'chime', fx: [st('confused', 4, 0.5), ph({ sm: 0.9 })], v: vis('#ff9ae0', 0.3, 0, 'bubbles', 0.1) });
A('banana_hurricane', 'Банановый ураган', 'm', 'magic', 2, 'Бананы летят в лицо: сытно, но скользко.',
  { t: ['wind'], c: ['wind'], z: 'WIDE', dur: 28, w: 0.9, s: 'wind', fx: [lt('food', 2, 1.5), ph({ push: [1.8, 0.4] }), strike('hail', 1, 0.6, 3)], v: vis('#ffe45a', 0.12, 2, 'leaves') });
A('time_reversal', 'Обращение времени', 'n', 'magic', 2, 'Время течёт вспять — раны затягиваются.',
  { t: [], c: [], z: 'ISLAND', dur: 25, w: 0.6, s: 'chime', fx: [heal(2.2), dr('hunger', -0.3)], v: vis('#d0e8ff', 0.18, 0, 'stars') });

/* ══════════════ ТЕХНОГЕННЫЕ ══════════════ */
A('radiation_leak', 'Утечка радиации', 'f', 'tech', 7, 'Забытый контейнер у берега начинает светиться.',
  { t: ['radiation'], c: ['radiation'], z: 'LOCAL', dur: 50, s: 'buzz', fx: [tl('rad', 0.8), st('irradiated', 25, 0.25), dmg(1.2, 'radiation')], v: vis('#c8ff3a', 0.16, 0, 'sparks') });
A('plane_debris', 'Обломки самолёта', 'p', 'tech', 6, 'Самолёт разваливается в небе, обломки падают на остров.',
  { t: ['impact', 'explosion', 'fire'], c: ['impact', 'explosion'], z: 'LINE', dur: 20, s: 'boom', fx: [strike('meteor', 1.0, 1.6, 26), lt('metal', 2, 3), lt('fuel', 1, 6)], v: vis('#ff9a55', 0.1, 4, 'embers') });
A('warehouse_blast', 'Взрыв склада', 'm', 'tech', 7, 'Склад взрывается и осыпает всё топливом и огнём.',
  { t: ['explosion', 'fire'], c: ['explosion', 'fire'], z: 'LOCAL', dur: 18, s: 'boom', fx: [strike('boom', 1.2, 2.6, 34), tl('burn', 0.6), lt('fuel', 1, 3)], v: vis('#ff7b2e', 0.2, 6, 'embers') });
A('gps_failure', 'Сбой GPS-маяка', 'm', 'tech', 3, 'Маяк сходит с ума, ориентироваться невозможно.',
  { t: ['emp'], c: ['emp'], z: 'ISLAND', dur: 35, s: 'buzz', fx: [ph({ invert: true }), st('confused', 4, 0.3)], v: vis('#b8c0ff', 0.1, 1, 'sparks') });
A('toxic_spill', 'Токсичный разлив', 'm', 'tech', 5, 'Бочки с химией опрокинулись в воду.',
  { t: ['toxic', 'gas'], c: ['toxic', 'gas'], z: 'COAST', dur: 45, s: 'pop', fx: [tl('toxic', 0.9), st('poisoned', 10, 0.25), dmg(0.9, 'toxic')], v: vis('#a8e83a', 0.16, 0, 'bubbles') });
A('oil_fire', 'Горящая нефтяная плёнка', 'f', 'tech', 7, 'Нефть на воде загорелась и дрейфует к берегу.',
  { t: ['fire', 'smoke', 'toxic'], c: ['fire', 'smoke'], z: 'COAST', dur: 40, s: 'boom', fx: [tl('burn', 1.1), tl('toxic', 0.3), st('blind', 3, 0.2), dr('temp', 0.5)], v: vis('#2a1a10', 0.3, 2, 'ash', 0.25) });
A('emp_burst', 'ЭМИ-импульс', 'm', 'tech', 4, 'Электромагнитный импульс сбивает с толку и обездвиживает.',
  { t: ['emp', 'lightning'], c: ['emp', 'lightning'], z: 'ISLAND', dur: 18, s: 'zap', fx: [st('stunned', 2, 0.15), ph({ sm: 0.8 }), st('blind', 2, 0.2)], v: vis('#8fd0ff', 0.25, 3, 'sparks') });
A('power_line', 'Падение ЛЭП', 'n', 'tech', 6, 'Оборванные провода искрят и бьют током.',
  { t: ['lightning', 'emp'], c: ['lightning', 'emp'], z: 'LINE', dur: 25, s: 'zap', fx: [strike('bolt', 0.8, 1.1, 24), st('stunned', 2, 0.2)], v: vis('#ffe45a', 0.1, 2, 'sparks') });
A('chem_fog', 'Химический туман', 'm', 'tech', 6, 'Едкий газ стелется по земле.',
  { t: ['gas', 'toxic', 'smoke'], c: ['gas', 'toxic', 'smoke'], z: 'LOCAL', dur: 40, s: 'buzz', fx: [dmg(2.4, 'gas'), st('poisoned', 8, 0.25), st('blind', 3, 0.2)], v: vis('#c7f06a', 0.28, 0, 'none', 0.15) });
A('drone_swarm', 'Рой дронов', 'm', 'tech', 5, 'Заблудившиеся дроны атакуют всё, что движется.',
  { t: ['bite', 'blade', 'emp'], c: ['blade', 'emp'], z: 'WIDE', dur: 35, s: 'buzz', fx: [sp('swarm', 5, 4), dmg(0.4, 'blade')], v: vis('#9fb0c0', 0.06, 0, 'sparks') });
A('rocket_debris', 'Ракетный мусор', 'm', 'tech', 7, 'Ступени ракеты падают с орбиты.',
  { t: ['impact', 'explosion', 'fire'], c: ['impact', 'explosion'], z: 'WIDE', dur: 22, s: 'boom', fx: [strike('meteor', 1.6, 2.2, 38), lt('metal', 1, 5)], v: vis('#ffa055', 0.1, 5, 'embers') });
A('minefield', 'Минное поле', 'n', 'tech', 6, 'Старые мины вдруг оживают под ногами.',
  { t: ['explosion'], c: ['explosion'], z: 'LOCAL', dur: 35, s: 'boom', fx: [strike('boom', 1.0, 1.2, 30)], v: vis('#5a4a30', 0.06, 3, 'dust') });
A('dam_burst', 'Прорыв дамбы', 'm', 'tech', 7, 'Бывшая плотина лопнула — поток сметает всё.',
  { t: ['flood', 'water', 'impact'], c: ['flood', 'water'], z: 'LINE', dur: 22, s: 'water', fx: [tl('flood', 2.5), dmg(4, 'flood'), ph({ push: [1.6, 1.0] }), sd(8)], v: vis('#2d7fb8', 0.16, 4, 'waves') });
A('satellite_beam', 'Луч спутника', 'm', 'tech', 8, 'Орбитальный лазер выжигает всё в круге.',
  { t: ['fire', 'heat', 'explosion'], c: ['fire', 'heat', 'explosion'], z: 'LOCAL', dur: 16, w: 0.6, s: 'zap', fx: [dmg(9, 'heat'), tl('burn', 0.8), st('burning', 4, 0.5)], v: vis('#ff4d4d', 0.18, 4, 'sparks') });
A('supply_drop', 'Сброс припасов', 'm', 'tech', 1, 'Пролетающий самолёт сбрасывает ящики с припасами.',
  { t: [], c: [], z: 'LINE', dur: 20, w: 0.8, s: 'chime', fx: [lt('medkit', 1, 8), lt('food', 2, 3), lt('water', 2, 3), lt('cloth', 1, 5)], v: vis('#c8e6ff', 0.05, 0, 'none') });

/* ══════════════ СОЦИАЛЬНЫЕ / ИГРОВЫЕ ══════════════ */
A('player_hunt', 'Охота на игрока', 'f', 'social', 6, 'Остров выбирает жертву и натравливает на неё хищников.',
  { t: ['bite', 'fear'], c: ['bite', 'fear'], z: 'ISLAND', dur: 40, min: 2, s: 'siren', fx: [hunt(12)], v: vis('#a02020', 0.12, 1, 'none', 0.2) });
A('pirate_raid', 'Налёт пиратов', 'm', 'social', 7, 'Пираты высаживаются и грабят лагеря.',
  { t: ['blade', 'bite'], c: ['blade', 'bite'], z: 'COAST', dur: 45, min: 2, s: 'siren', fx: [sp('pirate', 1, 8), steal(10)], v: vis('#1c2a3a', 0.1, 0, 'none', 0.15) });
A('shady_trader', 'Торговец-аферист', 'm', 'social', 3, 'Хитрый торговец раздаёт товары — и тут же крадёт ваши.',
  { t: ['curse'], c: ['magic'], z: 'ISLAND', dur: 35, min: 2, s: 'chime', fx: [lt('cloth', 1, 6), lt('food', 1, 6), steal(7)], v: vis('#e8c36a', 0.08, 0, 'none') });
A('resource_theft', 'Кража ресурсов', 'f', 'social', 4, 'Невидимые воры шарят по рюкзакам.',
  { t: ['curse'], c: ['magic', 'curse'], z: 'ISLAND', dur: 35, min: 2, s: 'wail', fx: [steal(4)], v: vis('#2a2a2a', 0.1, 0, 'none', 0.15) });
A('bandit_camp', 'Бандитский лагерь', 'm', 'social', 6, 'Бандиты строят лагерь и нападают на тех, кто рядом.',
  { t: ['blade', 'bite'], c: ['blade', 'bite'], z: 'LOCAL', dur: 45, min: 2, s: 'siren', fx: [sp('pirate', 1, 10), sp('wolf', 1, 14)], v: vis('#3a1e1e', 0.1, 0, 'none', 0.15) });
A('smuggler_drop', 'Контрабандный груз', 'm', 'social', 2, 'На берег выбросило ящики контрабандистов — но их хозяева близко.',
  { t: ['blade'], c: ['blade'], z: 'COAST', dur: 40, min: 2, w: 0.8, s: 'chime', fx: [lt('metal', 1, 4), lt('medicine', 1, 7), sp('pirate', 1, 18)], v: vis('#2a3a4a', 0.08, 0, 'none') });
A('rescue_plane', 'Спасательный самолёт', 'm', 'social', 1, 'Самолёт сбрасывает аптечки и воду. Не поссорьтесь из-за них!',
  { t: [], c: [], z: 'LINE', dur: 22, w: 0.7, s: 'chime', fx: [lt('medkit', 1, 6), lt('water', 2, 3), heal(0.4)], v: vis('#d8f0ff', 0.05, 0, 'none') });
A('bounty_mark', 'Награда за голову', 'f', 'social', 5, 'Богатейший игрок помечен как цель для всех хищников.',
  { t: ['bite', 'fear'], c: ['bite', 'fear'], z: 'ISLAND', dur: 35, min: 2, s: 'siren', fx: [hunt(10), steal(14)], v: vis('#7a1a1a', 0.1, 0, 'none', 0.2) });
A('air_tax', 'Налог на воздух', 'm', 'social', 3, 'Таинственный сборщик налогов забирает предметы за право дышать.',
  { t: ['curse'], c: ['magic'], z: 'ISLAND', dur: 30, min: 2, w: 0.9, s: 'chime', fx: [steal(5), dr('stamina', -0.4)], v: vis('#5a5a6a', 0.08, 0, 'none') });
A('wolf_hunt_leader', 'Охота на вожака', 'f', 'social', 6, 'Волки преследуют самого здорового игрока.',
  { t: ['bite', 'fear'], c: ['bite', 'fear'], z: 'ISLAND', dur: 40, min: 2, s: 'siren', fx: [hunt(14), sp('wolf', 1, 10)], v: vis('#1a2030', 0.1, 0, 'none', 0.25) });
A('kidnap_net', 'Сеть похитителей', 'f', 'social', 5, 'Сети падают с неба и обездвиживают.',
  { t: ['impact'], c: ['impact', 'blade'], z: 'LOCAL', dur: 25, min: 2, s: 'pop', fx: [st('stunned', 3, 0.25), st('slowed', 5, 0.4), steal(10)], v: vis('#5a4a2a', 0.08, 1, 'none') });
A('mob_justice', 'Самосуд', 'm', 'social', 4, 'Остров против всех: все мобы получают +агрессию.',
  { t: ['bite', 'blade'], c: ['bite', 'blade'], z: 'ISLAND', dur: 35, min: 2, s: 'siren', fx: [sp('wolf', 1, 8), sp('crab', 1, 8), sp('mutant', 1, 18)], v: vis('#661515', 0.12, 0, 'none', 0.2) });

/** Минимально необходимое количество архетипов (проверяется тестами). */
export const MIN_ARCHETYPES = 120;
