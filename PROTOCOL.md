# Протокол клиент ↔ сервер и контракты клиентских модулей

Транспорт: WebSocket `/ws`, JSON-сообщения, поле `t` — тип. Сервер авторитетный.
Общие константы/таблицы — `shared.js` (импортировать как `./shared.js`).

## Клиент → сервер

| t | поля | описание |
|---|------|----------|
| `hello` | `name`, `color` (hex), `token?` | ПЕРВОЕ сообщение. `token` из localStorage для переподключения |
| `create` | — | создать комнату (создатель — хост) |
| `join` | `code` | войти в комнату по коду |
| `quick` | — | быстрый поиск (любая открытая комната в лобби или новая) |
| `ready` | `ready:boolean` | готовность в лобби |
| `settings` | `settings:{pvp:boolean, chaos:boolean}` | только хост |
| `start` | — | только хост, старт игры |
| `leave` | — | выйти из комнаты |
| `input` | `seq`, `dx`, `dy`, `sprint`, `dt` | ввод движения ~30 Гц; `dt` — секунды с прошлого ввода (≤0.1) |
| `interact` | — | E: собрать ресурс/попить/использовать постройку/подобрать |
| `attack` | — | удар по ближайшему мобу (или игроку при pvp) перед собой |
| `craft` | `id` | рецепт из `RECIPES` (для kind=item) |
| `place` | `id` | поставить постройку (kind=struct) перед собой |
| `use` | `item` | съесть/выпить/использовать предмет |
| `give` | `item`, `to?` | отдать 1 шт. ближайшему игроку (или `to` — id) |
| `heal` | `to?` | вылечить ближайшего игрока аптечкой/лекарством |
| `chat` | `text` | сообщение в чат |
| `emote` | `e` | эмодзи из `EMOTES` |
| `rematch` | — | после конца раунда (хост) — вернуть комнату в лобби |
| `ping` | `ts` | замер задержки → `pong` |

## Сервер → клиент

| t | поля |
|---|------|
| `welcome` | `id`, `token`, `v` |
| `room` | `code`, `hostId`, `state` ('lobby'/'playing'/'ended'), `settings:{pvp,chaos}`, `max`, `players:[{id,name,color,ready,connected}]` — `null`-комната при выходе: `code:null` |
| `error` | `code`, `msg` (по-русски) |
| `init` | `seed`, `size`, `tiles:number[]`, `flags:number[]`, `youId`, `structs:[struct]`, `cats:[cata]`, `time`, `settings` — начало игры/возврат в игру |
| `snap` | см. ниже, 20 раз/сек |
| `tiles` | `d:[[idx,type,flags],…]` — изменения карты |
| `structs` | `add:[struct]`, `del:[id]`, `upd:[{id,hp}]` |
| `cata` | `ev:'warn'|'start'|'end'`, `uid`, `id`, `name`, `desc`, `cat`, `sev`, `warn`, `dur`, `zone`, `zoneName`, `tags`, `counter`, `vis`, `snd`, `silent` |
| `log` | `kind:'info'|'good'|'warn'|'bad'`, `key`, `args`, `msg` (русский текст; если в i18n есть ключ `key` — использовать его) |
| `chat` | `from`, `name`, `color`, `text` |
| `emote` | `from`, `e` |
| `end` | `results:[{id,name,color,time,alive,res,surv,help,kills,rank}]`, `winnerId`, `duration` |
| `pong` | `ts` |

### `struct`
`{id, k:'shelter'|'campfire'|'bunker'|'rod'|'dam'|'filter', x, y, o:ownerId, hp, mh}`

### `cata` (zone / vis)
`zone`: `{t:'island'}` | `{t:'circle',x,y,r}` | `{t:'rect',x0,y0,x1,y1}` | `{t:'line',x0,y0,x1,y1,w}` | `{t:'coast',d}` (d — ширина прибрежной полосы от воды).
`vis`: `{c:'#ff6600', a:0..0.5 (альфа оверлея), sh:0..10 (тряска), p:'rain'|'ash'|'snow'|'embers'|'bolts'|'waves'|'dust'|'spores'|'bubbles'|'sparks'|'fish'|'leaves'|'stars'|'none', d:0..1 (затемнение)}`.
`snd`: 'rumble'|'siren'|'wind'|'water'|'boom'|'zap'|'buzz'|'chime'|'wail'|'pop'.
`ev:'warn'` — `warn` секунд до старта (0 и `silent:true` — внезапный). `ev:'start'` — `dur` секунд действия. `ev:'end'` — закончился.
`tags` — угрозы, `counter` — теги защиты (то, что спасает: см. `gear` предметов и `prot` построек в shared.js).

### `snap`
```
{t:'snap', tick, tm:секунды_игры, ack:последний_seq_ввода, nx:секунд_до_следующего_катаклизма(-1 если неизвестно),
 me:{x,y,hp,hunger,thirst,temp,stamina,sanity, inv:{item:n}, statuses:[{s,t}], prot:[tags], alive, sm, invert, raft, near:{campfire:bool}, res, surv, help},
 p:[{id,x,y,hp,d:угол,al:bool,sp:bool,s:[кодыСтатусов]}],
 m:[{id,k,x,y,hp,mh}],
 l:[{id,x,y,i:item,n}],
 fx:[{k:'boom'|'bolt'|'splash'|'heal'|'hit'|'gather'|'craft'|'death'|'fire'|'rad'|'tele', x, y, r?, c?}]}
```
Значения: hp/hunger/thirst/stamina/sanity 0..100 (hunger/thirst: 100 — сыт/напился), `temp` в °C (норма 36.6; <33 опасно, >40 опасно).
`me.sm` — множитель скорости, `me.invert` — управление инвертировано (сервер инвертирует ввод САМ; клиент для предсказания тоже), `me.raft` — есть плот.

## Предсказание движения (клиент)
Клиент хранит неподтверждённые `input` (seq, dx, dy, sprint, dt). Каждый кадр применяет `moveStep` из shared.js (с учётом `me.sm`, `me.invert`, `me.raft`). При `snap`: взять позицию `me`, выкинуть input с `seq<=ack`, переприменить остальные; если ошибка > 2 тайлов — телепорт, иначе плавная подтяжка (~20% за снапшот). Остальные игроки/мобы — интерполяция между двумя последними снапшотами (задержка ~100 мс), поля `rx, ry`.

## Объект состояния клиента `state` (передаётся в рендерер)
```
state = {
  size, tiles:Uint8Array, flags:Uint8Array,
  meId, me:{…как в snap.me, но x,y — предсказанные},
  camera:{x,y},                         // центр камеры в тайлах (main.js: свой игрок или наблюдаемый)
  players:[{id,name,color,x,y,rx,ry,hp,d,al,sp,s:[],emote:{e,t0}|null}],   // включая себя (с rx,ry = me.x,me.y)
  mobs:[{id,k,x,y,rx,ry,hp,mh}],
  loot:[{id,x,y,i,n}],
  structs:[struct],
  cats:[{uid,name,cat,sev,phase:'warn'|'active',warnLeft,tLeft,zone,vis,snd,silent,tags,counter}],
  fxQueue:[…fx из snap…],               // рендерер ЗАБИРАЕТ (splice) и анимирует
  time                                  // секунд игры
}
```

## Контракт `audio.js` (ES-модуль, синтез Web Audio, без файлов)
```
initAudio(); resumeAudio(); setMuted(bool); isMuted();
playSound(name, vol=1)  // name: 'ui','warn','start','end','rumble','wind','water','boom','zap','buzz','chime','wail','pop','hit','hurt','gather','craft','eat','drink','death','emote'
setSiren(on:boolean)    // циклическая сирена, пока есть катаклизм в фазе warn
setAmbient(kind|null)   // фон на время активного катаклизма: 'rumble'|'wind'|'water'|'buzz'|'wail'|null
```

## Контракт `render.js` (ES-модуль)
```
export class Renderer {
  constructor(canvas)
  resize()                          // под размер окна, devicePixelRatio ≤ 2
  setWorld(size, tiles, flags)      // (пере)строить кэш карты
  applyTiles(deltas)                // [[idx,type,flags]] — перерисовать изменённые тайлы в кэше
  draw(state, dt)                   // кадр: карта, флаги тайлов (огонь, затопление, лёд, токсины, радиация), постройки, лут, мобы, игроки (имя, hp-бар, статусы, эмоции), частицы по vis.p активных катаклизмов, цветной оверлей vis.c/a, затемнение vis.d (с кругом света у игрока), тряска vis.sh, контур зоны в фазе warn, fx-события
  drawMinimap(canvas, state)        // миникарта: тайлы, игроки (цвета), опасные зоны
  screenToWorld(sx, sy)             // -> {x,y} в тайлах
}
```
Масштаб: `TILE_PX` (32) × zoom, zoom по умолчанию так, чтобы на экране было ~15 тайлов по меньшей стороне (на телефоне ~11). Графика процедурная: без внешних картинок, эмодзи разрешены.
