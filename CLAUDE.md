# DungeonForTwo

Local 2-player browser roguelike. Zero dependencies, no build step.
Run: `python3 -m http.server 8000` → http://localhost:8000

### Architecture snapshot

| File | Role |
|---|---|
| `index.html` | 3-column layout: P1 panel \| 768×576 canvas \| P2 panel |
| `src/state.js` | Single `game` object (all entity lists, phase, floor, shake, awaitingBoss) |
| `src/main.js` | rAF loop, phase machine, `generateFloor()`, `checkFloorProgress()`, `simulate()` |
| `src/input.js` | Two keymaps: P1 WASD/Space/E/Q/R · P2 Arrows/Slash/Quote/Semicolon/P |
| `src/classes.js` | 8 classes, each with `passiveId` + passive tree node; `POINTS_PER_LEVEL=3` |
| `src/player.js` | XP curve `45*level^1.6`; `recompute()` sets `passiveRank`; `canBuy` checks `node.cost` |
| `src/enemies.js` | `HP_BOOST=1.45 DMG_BOOST=1.4`; `REWARD_SCALE=1/3`; `isBossFloor`, `spawnBoss` |
| `src/combat.js` | `nearestEnemyDir` (LOS via `lineClear`); `passiveOnKill` (reads `player.cls.passiveId`) |
| `src/items.js` | 5 rarities w/ `minFloor` gates; deterministic stat budgets; `rollLoot` at `1/3` rate |
| `src/shop.js` | `buy()` splices item from shared `stock` array; cursors clamped after splice |
| `src/dungeon.js` | Rect rooms + corridors on 32px tile grid; `lineClear()` ray-steps for LOS |
| `src/render.js` | Camera centers on player midpoint; shake `×0.86/frame`; free minions = purple |
| `src/ui.js` | Passive nodes show `PBADGE`; shop rows 5-col grid; `handleShop` splices on buy |

### Phase machine
`TITLE → MODE_SELECT → CLASS_SELECT → PLAYING → SHOP → PLAYING…(20 floors) → WIN`
`PLAYING → GAME_OVER` if all players downed simultaneously.

### Key invariants
- `game.awaitingBoss=true` on boss floors; boss only spawns after all adds die (`checkFloorProgress`)
- Boss floors: 3, 5, 10, 15, 20 — `isBossFloor` checks `!!BOSSES[floor]` (no longer mod-5 only)
- Bosses spawn minions every `def.minionInterval` seconds via `_spawnMinions()`; phase 2 (≤50% HP) doubles minion rate, boosts speed ×1.4 and dmg ×1.35, triggers `game._bossEnrage` flag for main.js message
- `passiveOnKill(player, enemy)` in combat.js — switch on `player.cls.passiveId` (NOT `player.passiveId`)
- Free Necromancer minions: `free:true`, purple `#c060ff`, bypass minion cap
- Generic skill nodes appended to every class tree from `GENERIC_NODES` in `classes.js`
- Shop stock is shared; purchase calls `stock.splice(idx,1)` so item disappears for both players

### Balance levers (most likely next tuning targets)
- Enemy toughness: `HP_BOOST` / `DMG_BOOST` in `enemies.js:28`
- Reward density: `REWARD_SCALE` in `enemies.js:54`
- XP speed: coefficient in `player.js` `xpToNext = round(45 * level^1.6)`
- Skill power: node values in `classes.js` (all were halved in round 3)
- Rarity unlock floors: `RARITIES[].minFloor` in `items.js`

### Git workflow
- **Never `git push` unless the user explicitly asks.** Commit locally after each change; push only on request.

### Completed fix rounds
- **Round 1:** Item icons, inventory scroll, item selling, 5-tier rarity, LOS auto-aim, 1P/2P mode, screen shake, death particles
- **Round 2:** Steeper XP, 3 SP/level, 3× enemies (1/3 rewards), floor-gated rarity, deterministic stat budgets, 8 generic skill nodes
- **Round 3:** LOS auto-aim (lineClear), HP_BOOST/DMG_BOOST, deferred boss entrance (awaitingBoss), skills halved + Grave Horde 2SP, shop splice on buy, upgradable class passives (passiveId + passiveOnKill)

### Known gotchas
- ES module caching in browser preview: append `?v=Date.now()` to force reload during eval
- rAF throttles in background tabs; avoid long poll loops in `preview_eval`
- `passiveOnKill` bug (fixed): always read `player.cls.passiveId`, never `player.passiveId`
- `src/audio.js` is planned in README but does not exist yet
