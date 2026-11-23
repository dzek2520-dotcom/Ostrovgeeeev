/**
 * modifiers.js — таблицы комбинаций для процедурного генератора катаклизмов.
 *
 * Что делает этот файл:
 *  Здесь описаны ВСЕ «измерения» формулы
 *     КАТАКЛИЗМ = архетип × модификатор(стихия) × масштаб × зона × побочный эффект × длительность
 *  Каждая таблица подробно прокомментирована: что означает поле и как оно влияет на игру.
 *
 *  1) ZONES        — где происходит катаклизм (дескрипторы; координаты вычисляются
 *                    в игре по карте — см. zones.js);
 *  2) ZONE_GROUPS  — какие зоны допустимы для архетипа (поле `z` в archetypes.js);
 *  3) MODIFIERS    — стихия/модификатор: прилагательное в 4 родах, доп. теги угроз и
 *                    защиты, доп. эффекты, смена цвета/частиц;
 *  4) SCALES       — масштаб: множитель интенсивности, поправка тяжести и длительности;
 *  5) SIDE_EFFECTS — побочный эффект: фраза-хвост в названии и доп. эффекты;
 *  6) DURATIONS    — множители длительности (не влияют на название).
 */
import { dmg, st, dr, tl, sp, lt, ph, strike, sd, steal, heal } from './fx.js';

/**
 * Зоны. Поля:
 *  t     — тип: island | coast | rect | circle | line;
 *  text  — фраза для названия (предложный падеж: «где?»);
 *  big   — 1 если зона крупная (повышает тяжесть на +0, мелкая — снижает интенсивность не меняя)
 *  Прочие поля — параметры формы; anchor — «якорь» на карте (center/volcano/lake/swamp/random).
 */
export const ZONES = {
  island:      { t: 'island', text: 'по всему острову' },
  coast:       { t: 'coast', d: 6, text: 'вдоль побережья' },
  coast_wide:  { t: 'coast', d: 11, text: 'на широкой прибрежной полосе' },
  half_n:      { t: 'rect', f: [0, 0, 1, 0.5], text: 'в северной половине' },
  half_s:      { t: 'rect', f: [0, 0.5, 1, 1], text: 'в южной половине' },
  half_e:      { t: 'rect', f: [0.5, 0, 1, 1], text: 'в восточной половине' },
  half_w:      { t: 'rect', f: [0, 0, 0.5, 1], text: 'в западной половине' },
  quad_nw:     { t: 'rect', f: [0, 0, 0.5, 0.5], text: 'на северо-западе' },
  quad_ne:     { t: 'rect', f: [0.5, 0, 1, 0.5], text: 'на северо-востоке' },
  quad_sw:     { t: 'rect', f: [0, 0.5, 0.5, 1], text: 'на юго-западе' },
  quad_se:     { t: 'rect', f: [0.5, 0.5, 1, 1], text: 'на юго-востоке' },
  c_center:    { t: 'circle', anchor: 'center', r: 11, text: 'в центре острова' },
  c_volcano:   { t: 'circle', anchor: 'volcano', r: 13, text: 'у подножия вулкана' },
  c_small:     { t: 'circle', anchor: 'random', r: 6, text: 'в случайной точке' },
  c_mid:       { t: 'circle', anchor: 'random', r: 10, text: 'на случайном участке' },
  c_large:     { t: 'circle', anchor: 'random', r: 15, text: 'на обширном участке' },
  line_h:      { t: 'line', dir: 'h', w: 7, text: 'полосой с запада на восток' },
  line_v:      { t: 'line', dir: 'v', w: 7, text: 'полосой с севера на юг' },
  line_d:      { t: 'line', dir: 'd', w: 7, text: 'по диагонали острова' },
  c_lake:      { t: 'circle', anchor: 'lake', r: 9, text: 'над озером' },
  c_swamp:     { t: 'circle', anchor: 'swamp', r: 10, text: 'над болотом' },
};

/**
 * Группы допустимых зон для архетипа (поле z в archetypes.js).
 *  ISLAND — только весь остров (затмение, аврора);
 *  WIDE   — крупные зоны (остров, половины, широкий берег, большой круг);
 *  LOCAL  — локальные зоны (углы, круги, центр);
 *  LINE   — полосы;
 *  COAST  — прибрежные зоны (+ острова и четверти для разнообразия);
 *  VOLCANO — вокруг вулкана; WET — озеро/болото/берег; SWAMPY — болото; ANY — любая.
 */
export const ZONE_GROUPS = {
  ISLAND: ['island'],
  WIDE: ['island', 'half_n', 'half_s', 'half_e', 'half_w', 'coast_wide', 'c_large'],
  LOCAL: ['quad_nw', 'quad_ne', 'quad_sw', 'quad_se', 'c_center', 'c_small', 'c_mid', 'c_large', 'c_volcano', 'c_lake', 'c_swamp', 'half_n', 'half_s', 'half_e', 'half_w'],
  LINE: ['line_h', 'line_v', 'line_d'],
  COAST: ['coast', 'coast_wide', 'half_n', 'half_s', 'half_e', 'half_w'],
  VOLCANO: ['c_volcano'],
  WET: ['c_lake', 'c_swamp', 'coast', 'coast_wide'],
  SWAMPY: ['c_swamp', 'c_mid', 'c_lake'],
  ANY: Object.keys(ZONES),
};

/**
 * Масштабы. Поля:
 *  forms — прилагательное в формах [м, ж, ср, мн] (пусто — без прилагательного);
 *  k     — множитель интенсивности (урон, частота, количество);
 *  dsev  — поправка тяжести;
 *  dur   — множитель длительности;
 *  w     — вес выпадения варианта в генераторе (мелкие чаще, апокалипсис редко).
 */
export const SCALES = [
  { id: 'faint',  forms: ['Слабый', 'Слабая', 'Слабое', 'Слабые'], k: 0.5, dsev: -2, dur: 0.8, w: 1 },
  { id: 'small',  forms: ['Небольшой', 'Небольшая', 'Небольшое', 'Небольшие'], k: 0.75, dsev: -1, dur: 0.9, w: 1.3 },
  { id: 'normal', forms: null, k: 1, dsev: 0, dur: 1, w: 1.2 },
  { id: 'strong', forms: ['Мощный', 'Мощная', 'Мощное', 'Мощные'], k: 1.35, dsev: 1, dur: 1.1, w: 1 },
  { id: 'huge',   forms: ['Чудовищный', 'Чудовищная', 'Чудовищное', 'Чудовищные'], k: 1.8, dsev: 2, dur: 1.2, w: 0.6 },
  { id: 'apoc',   forms: ['Апокалиптический', 'Апокалиптическая', 'Апокалиптическое', 'Апокалиптические'], k: 2.4, dsev: 3, dur: 1.3, w: 0.3 },
];

/**
 * Множители длительности (не входят в название; просто разнообразят катаклизмы).
 */
export const DURATIONS = [0.6, 0.8, 1, 1.3, 1.7];

/**
 * Модификаторы (стихия/свойство). Поля:
 *  id, forms — [м, ж, ср, мн] прилагательное;
 *  desc  — описание свойства для текста описания;
 *  cats  — для каких категорий архетипов применим (null — для всех);
 *  tags/counter — добавляются к угрозам / защите;
 *  fx    — добавочные эффекты;
 *  c, p  — переопределение цвета оверлея и частиц (необязательно);
 *  dsev  — поправка тяжести; w — вес.
 */
export const MODIFIERS = [
  { id: 'fire', forms: ['Огненный', 'Огненная', 'Огненное', 'Огненные'], desc: 'несёт пламя и поджигает землю', cats: ['nature', 'tech', 'magic', 'cosmic', 'bio'], tags: ['fire'], counter: ['fire'], fx: [tl('burn', 0.35), st('burning', 4, 0.1)], c: '#ff5a1a', p: 'embers', dsev: 1 },
  { id: 'ice', forms: ['Ледяной', 'Ледяная', 'Ледяное', 'Ледяные'], desc: 'вымораживает всё вокруг', cats: ['nature', 'tech', 'magic', 'cosmic', 'bio'], tags: ['cold'], counter: ['cold'], fx: [dr('temp', -0.6), tl('freeze', 0.3)], c: '#a9dcff', p: 'snow', dsev: 0 },
  { id: 'toxic', forms: ['Ядовитый', 'Ядовитая', 'Ядовитое', 'Ядовитые'], desc: 'отравляет воздух и воду', cats: ['nature', 'tech', 'bio', 'magic'], tags: ['toxic'], counter: ['toxic', 'gas'], fx: [dmg(0.8, 'toxic'), st('poisoned', 8, 0.12), tl('toxic', 0.2)], c: '#8fe04a', p: 'spores', dsev: 1 },
  { id: 'electric', forms: ['Электрический', 'Электрическая', 'Электрическое', 'Электрические'], desc: 'сыплет разрядами', cats: ['nature', 'tech', 'magic', 'cosmic'], tags: ['lightning'], counter: ['lightning'], fx: [strike('bolt', 3, 1, 16)], c: '#ffee66', p: 'sparks', dsev: 1 },
  { id: 'radio', forms: ['Радиоактивный', 'Радиоактивная', 'Радиоактивное', 'Радиоактивные'], desc: 'заражает местность радиацией', cats: ['nature', 'tech', 'cosmic', 'bio'], tags: ['radiation'], counter: ['radiation'], fx: [tl('rad', 0.25), st('irradiated', 15, 0.12)], c: '#d0ff40', p: 'sparks', dsev: 1 },
  { id: 'ghost', forms: ['Призрачный', 'Призрачная', 'Призрачное', 'Призрачные'], desc: 'приводит призраков и страх', cats: null, tags: ['fear'], counter: ['fear', 'magic'], fx: [sp('spirit', 1, 9), dr('sanity', -0.3)], c: '#a8b8ff', p: 'stars', dsev: 0 },
  { id: 'swamp', forms: ['Болотный', 'Болотная', 'Болотное', 'Болотные'], desc: 'превращает землю в вязкую грязь', cats: ['nature', 'bio', 'magic'], tags: [], counter: [], fx: [tl('mud', 0.35), ph({ sm: 0.85 })], c: '#5a7a3a', p: 'bubbles', dsev: 0 },
  { id: 'sand', forms: ['Песчаный', 'Песчаная', 'Песчаное', 'Песчаные'], desc: 'засыпает глаза песком', cats: ['nature', 'magic', 'cosmic'], tags: ['ash'], counter: ['ash'], fx: [st('blind', 3, 0.25), dmg(0.4, 'ash')], c: '#d1ad66', p: 'dust', dsev: 0 },
  { id: 'blood', forms: ['Кровавый', 'Кровавая', 'Кровавое', 'Кровавые'], desc: 'оставляет кровоточащие раны', cats: ['nature', 'bio', 'magic', 'social'], tags: ['blade'], counter: ['blade', 'bite'], fx: [st('bleeding', 8, 0.15), dmg(0.5, 'blade')], c: '#a01818', p: 'sparks', dsev: 1 },
  { id: 'crystal', forms: ['Кристальный', 'Кристальная', 'Кристальное', 'Кристальные'], desc: 'осыпает осколками кристаллов и редким металлом', cats: ['nature', 'cosmic', 'magic', 'tech'], tags: ['impact'], counter: ['impact'], fx: [strike('hail', 1.5, 0.7, 6), lt('metal', 1, 12)], c: '#9be8ff', p: 'sparks', dsev: 0 },
  { id: 'magnet', forms: ['Магнитный', 'Магнитная', 'Магнитное', 'Магнитные'], desc: 'тянет предметы и сбивает ориентацию', cats: ['nature', 'tech', 'cosmic', 'magic'], tags: ['emp'], counter: ['emp'], fx: [ph({ pull: 1.0 }), st('confused', 3, 0.15)], c: '#b4b9d6', p: 'sparks', dsev: 0 },
  { id: 'jelly', forms: ['Желейный', 'Желейная', 'Желейное', 'Желейные'], desc: 'всё становится вязким и сладким', cats: ['nature', 'magic', 'bio'], tags: [], counter: [], fx: [ph({ sm: 0.75 }), lt('jelly', 1, 6)], c: '#ff80c8', p: 'bubbles', dsev: -1 },
  { id: 'sing', forms: ['Поющий', 'Поющая', 'Поющее', 'Поющие'], desc: 'завораживающей песней сводит с ума', cats: null, tags: ['fear'], counter: ['fear', 'magic'], fx: [dr('sanity', -0.45), st('confused', 3, 0.15)], c: '#c78bff', p: 'stars', dsev: 0 },
  { id: 'gold', forms: ['Золотой', 'Золотая', 'Золотое', 'Золотые'], desc: 'оставляет редкие сокровища', cats: null, tags: [], counter: [], fx: [lt('artifact', 1, 22)], c: '#ffd75a', p: 'sparks', dsev: -1 },
  { id: 'rot', forms: ['Гнилой', 'Гнилая', 'Гнилое', 'Гнилые'], desc: 'портит еду и вызывает инфекции', cats: ['nature', 'bio', 'magic'], tags: ['disease'], counter: ['disease', 'gas'], fx: [st('infected', 12, 0.1), dr('hunger', -0.5)], c: '#6a7a2a', p: 'spores', dsev: 1 },
  { id: 'fog', forms: ['Туманный', 'Туманная', 'Туманное', 'Туманные'], desc: 'скрывает всё в тумане', cats: null, tags: ['fog'], counter: ['fog'], fx: [st('blind', 3, 0.25), dr('sanity', -0.15)], c: '#cfd8dc', p: 'none', dsev: 0 },
  { id: 'thunder', forms: ['Громовой', 'Громовая', 'Громовое', 'Громовые'], desc: 'оглушает раскатами грома', cats: ['nature', 'cosmic', 'tech', 'magic'], tags: ['impact'], counter: ['impact'], fx: [st('stunned', 1.5, 0.1), strike('boom', 3.5, 1.4, 14)], c: '#6b7bb0', p: 'bolts', dsev: 1 },
  { id: 'curse', forms: ['Проклятый', 'Проклятая', 'Проклятое', 'Проклятые'], desc: 'помечает игроков проклятием', cats: null, tags: ['curse'], counter: ['curse', 'magic'], fx: [st('hunted', 6, 0.08), dr('sanity', -0.3)], c: '#4a1a5a', p: 'stars', dsev: 1 },
  { id: 'frenzy', forms: ['Бешеный', 'Бешеная', 'Бешеное', 'Бешеные'], desc: 'всё происходит быстрее и злее', cats: null, tags: [], counter: [], fx: [], c: null, p: null, dsev: 1, mult: 1.3 },
  { id: 'sleepy', forms: ['Сонный', 'Сонная', 'Сонное', 'Сонные'], desc: 'вгоняет в сон и вялость', cats: null, tags: [], counter: [], fx: [dr('stamina', -1.5), ph({ sm: 0.85 })], c: '#7a8ab8', p: 'bubbles', dsev: -1 },
  { id: 'hungry', forms: ['Прожорливый', 'Прожорливая', 'Прожорливое', 'Прожорливые'], desc: 'выедает запасы энергии', cats: null, tags: [], counter: [], fx: [dr('hunger', -0.8)], c: '#8a5a2a', p: null, dsev: 0 },
  { id: 'parch', forms: ['Иссушающий', 'Иссушающая', 'Иссушающее', 'Иссушающие'], desc: 'высасывает влагу из тел', cats: null, tags: ['heat'], counter: ['heat', 'sun'], fx: [dr('thirst', -0.8), tl('dry', 0.25)], c: '#ffcc66', p: 'dust', dsev: 0 },
  { id: 'heavy', forms: ['Тяжёлый', 'Тяжёлая', 'Тяжёлое', 'Тяжёлые'], desc: 'придавливает к земле', cats: null, tags: ['gravity'], counter: ['gravity', 'magic'], fx: [st('heavy', 6, 0.25), ph({ sm: 0.8 })], c: '#554466', p: null, dsev: 0 },
  { id: 'float', forms: ['Парящий', 'Парящая', 'Парящее', 'Парящие'], desc: 'отрывает от земли и ускоряет', cats: null, tags: [], counter: [], fx: [st('floaty', 5, 0.5), ph({ sm: 1.2 })], c: '#c7e8ff', p: 'bubbles', dsev: -1 },
  { id: 'healing', forms: ['Целебный', 'Целебная', 'Целебное', 'Целебные'], desc: 'вопреки всему немного лечит', cats: null, tags: [], counter: [], fx: [heal(0.7)], c: '#a8ffc8', p: 'leaves', dsev: -2 },
  { id: 'shine', forms: ['Сияющий', 'Сияющая', 'Сияющее', 'Сияющие'], desc: 'озаряет остров странным светом', cats: null, tags: [], counter: [], fx: [st('glowing', 8, 0.6), dr('sanity', 0.3)], c: '#fff2a8', p: 'stars', dsev: -1 },
  { id: 'dark', forms: ['Тёмный', 'Тёмная', 'Тёмное', 'Тёмные'], desc: 'гасит свет и пугает', cats: null, tags: ['dark'], counter: ['dark', 'fear'], fx: [dr('sanity', -0.25), st('blind', 2, 0.15)], c: '#14121f', p: 'none', dsev: 0, dark: 0.35 },
  { id: 'acid', forms: ['Кислотный', 'Кислотная', 'Кислотное', 'Кислотные'], desc: 'разъедает постройки и кожу', cats: ['nature', 'tech', 'bio', 'magic'], tags: ['toxic'], counter: ['toxic', 'gas'], fx: [sd(2.2), dmg(0.5, 'toxic')], c: '#b8ff4a', p: 'rain', dsev: 1 },
  { id: 'storm', forms: ['Штормовой', 'Штормовая', 'Штормовое', 'Штормовые'], desc: 'сопровождается ураганным ветром', cats: ['nature', 'cosmic', 'magic', 'tech'], tags: ['wind'], counter: ['wind'], fx: [ph({ push: [1.8, -0.9] }), dmg(0.5, 'wind')], c: '#6a7b8c', p: 'rain', dsev: 1 },
  { id: 'wet', forms: ['Мокрый', 'Мокрая', 'Мокрое', 'Мокрые'], desc: 'обдаёт всё водой и подтапливает землю', cats: null, tags: ['rain'], counter: ['rain'], fx: [st('wet', 10, 0.5), tl('flood', 0.25)], c: '#3f7fb0', p: 'rain', dsev: 0 },
  { id: 'furry', forms: ['Звериный', 'Звериная', 'Звериное', 'Звериные'], desc: 'приводит с собой хищников', cats: null, tags: ['bite'], counter: ['bite'], fx: [sp('wolf', 1, 14), sp('crab', 1, 10)], c: null, p: null, dsev: 1 },
];

/**
 * Побочные эффекты («хвост» названия). Поля:
 *  text — фраза в названии; desc — пояснение;
 *  fx — эффекты; tags/counter — доп. угрозы/защита; w — вес.
 */
export const SIDE_EFFECTS = [
  { id: 'smoke', text: 'с задымлением', desc: 'воздух наполнен дымом', fx: [st('blind', 3, 0.12), dr('sanity', -0.1)], tags: ['smoke'], counter: ['smoke', 'ash'] },
  { id: 'aftershock', text: 'с афтершоками', desc: 'после основного удара следуют толчки', fx: [strike('boom', 6, 1.5, 8)], tags: ['quake'], counter: ['quake'] },
  { id: 'downpour', text: 'под проливным дождём', desc: 'сверху льёт ливень', fx: [st('wet', 8, 0.4)], tags: ['rain'], counter: ['rain'] },
  { id: 'fishfall', text: 'и рыбным дождём', desc: 'вместе с бедой с неба падает рыба', fx: [lt('fish', 1, 5)], tags: [], counter: [] },
  { id: 'gulls', text: 'под крики чаек', desc: 'налетают чайки-воришки', fx: [sp('gull', 1, 9)], tags: ['bite'], counter: ['bite'] },
  { id: 'crabs', text: 'с нашествием крабов', desc: 'из воды лезут крабы', fx: [sp('crab', 2, 8)], tags: ['bite'], counter: ['bite', 'blade'] },
  { id: 'thickfog', text: 'в густом тумане', desc: 'видимость почти нулевая', fx: [st('blind', 3, 0.2)], tags: ['fog'], counter: ['fog'] },
  { id: 'thieves', text: 'с кражами из рюкзаков', desc: 'пропадают вещи', fx: [steal(10)], tags: ['curse'], counter: ['magic'] },
  { id: 'mudflow', text: 'с грязевыми потоками', desc: 'земля превращается в грязь', fx: [tl('mud', 0.4)], tags: [], counter: [] },
  { id: 'sparks', text: 'с электрическими искрами', desc: 'в воздухе трещат разряды', fx: [strike('bolt', 5, 0.9, 14)], tags: ['lightning'], counter: ['lightning'] },
  { id: 'hunger', text: 'с жестоким голодом', desc: 'аппетит возрастает', fx: [dr('hunger', -0.5)], tags: [], counter: [] },
  { id: 'thirst', text: 'с сильной жаждой', desc: 'пить хочется постоянно', fx: [dr('thirst', -0.6)], tags: [], counter: [] },
  { id: 'icywind', text: 'с ледяным ветром', desc: 'дует морозный ветер', fx: [dr('temp', -0.4), ph({ push: [-0.8, 0.2] })], tags: ['cold', 'wind'], counter: ['cold', 'wind'] },
  { id: 'swelter', text: 'с удушающей жарой', desc: 'становится невыносимо жарко', fx: [dr('temp', 0.45)], tags: ['heat'], counter: ['heat', 'sun'] },
  { id: 'whispers', text: 'с шёпотом из ниоткуда', desc: 'слышны голоса', fx: [dr('sanity', -0.35)], tags: ['fear'], counter: ['fear', 'magic'] },
  { id: 'bounty', text: 'и щедрой добычей', desc: 'остаются ресурсы', fx: [lt('wood', 1, 4), lt('stone', 1, 5), lt('food', 1, 7)], tags: [], counter: [] },
  { id: 'metalrain', text: 'и дождём из металла', desc: 'сыплется металлолом', fx: [lt('metal', 1, 5)], tags: [], counter: [] },
  { id: 'herbs', text: 'с целебными травами', desc: 'вырастают лекарственные травы', fx: [lt('medicine', 1, 8)], tags: [], counter: [] },
  { id: 'undead', text: 'с восставшими мертвецами', desc: 'поднимаются зомби', fx: [sp('zombie', 1, 11)], tags: ['bite', 'disease'], counter: ['bite'] },
  { id: 'wolves', text: 'и волчьей стаей', desc: 'приходят волки', fx: [sp('wolf', 1, 11)], tags: ['bite'], counter: ['bite', 'fear'] },
  { id: 'spores', text: 'с облаком спор', desc: 'воздух полон спор', fx: [tl('spore', 0.4), st('poisoned', 6, 0.1)], tags: ['spores'], counter: ['spores'] },
  { id: 'invert', text: 'с инверсией управления', desc: 'управление перепутано', fx: [ph({ invert: true })], tags: ['curse'], counter: ['magic'] },
  { id: 'viscous', text: 'с вязким воздухом', desc: 'движения замедлены', fx: [ph({ sm: 0.8 })], tags: [], counter: [] },
  { id: 'flicker', text: 'с мерцающим светом', desc: 'свет то гаснет, то вспыхивает', fx: [st('blind', 2, 0.2), dr('sanity', -0.15)], tags: ['dark'], counter: ['dark'] },
  { id: 'blessing', text: 'с неожиданным благословением', desc: 'раны чуть-чуть затягиваются', fx: [heal(0.5)], tags: [], counter: [] },
  { id: 'embers', text: 'с дождём из углей', desc: 'сыплются горячие угли', fx: [strike('hail', 1.2, 0.6, 5), tl('burn', 0.15)], tags: ['fire'], counter: ['fire', 'heat'] },
  { id: 'cracks', text: 'и трещинами в земле', desc: 'земля идёт трещинами', fx: [tl('crack', 0.1)], tags: ['quake'], counter: ['quake'] },
];
