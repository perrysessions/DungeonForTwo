# Dungeon For Two

A local **2-player couch co-op** pixel roguelike that runs in the browser. Two heroes
share one keyboard and one screen, pick classes, level up separately, and descend
**20 floors** of increasing difficulty together. Zero dependencies, no build step.

## Running it

ES modules can't load over `file://`, so serve the folder with any static server:

```bash
cd DungeonForTwo
python3 -m http.server 8000
```

Then open **http://localhost:8000** in a browser. (Node users: `npx serve` works too.)

> Best played on a desktop-width window — the game area sits between the two player
> panels (P1 left, P2 right).

## Controls

| Action | Player 1 (left hand) | Player 2 (right hand) |
|---|---|---|
| Move | `W A S D` | `Arrow Keys` |
| Attack (aim = facing) | `Space` | `/` |
| Class Ability | `E` | `'` |
| Interact / Revive | `Q` | `;` |
| Inventory / Skills | `R` | `P` |

Menus use each player's own **Move** keys to navigate and **Attack** to confirm/buy.
In the **inventory**, **Attack** = use/equip and **Interact** = sell (for gold);
press your **Inventory** key again to close. In the **shop**, **Interact** = ready up.

Attacks **auto-aim at the nearest enemy**, so you only steer — no fiddly aiming.

## How to play

1. Press an **Attack** key on the title screen.
2. **Pick 1 or 2 players** on the mode-select screen (solo or couch co-op).
3. **Choose a class** — each player browses with Move, locks in with Attack. Pick
   whatever combo you like (tank + healer, double mage, etc.).
3. **Clear the floor** — kill every enemy to reveal the stairs, then both stand on the
   stairs to descend.
4. **Level up** — enemies give XP; each level grants a skill point. Open your
   Inventory (skills tab) to spend points in your class tree.
5. **Loot & gold** — enemies drop gold and gear (per-player). Grab drops by walking over
   them; open your Inventory to equip weapons/armor/trinkets, drink potions, or **sell**
   unwanted items (Interact) for gold. Gear comes in five rarities —
   **Common · Uncommon · Rare · Legendary · Mythic** — with much bigger stats and prices
   at the top end, so it's worth saving up.
6. **Shop between floors** — spend your own gold on gear and potions, then ready up
   to descend (both players in co-op).
7. **Downed & revive** — at 0 HP you're downed, not dead. Your partner holds Interact
   next to you to revive. If **both** go down, the run restarts from floor 1.
8. Survive to **floor 20** (bosses on 5, 10, 15, 20) for victory.

## Classes

Warrior · Ranger · Fire Mage · Necromancer · Cleric · Rogue · Paladin · Frost Mage.

Each class has:
- a unique **active ability** (on your Ability key),
- an upgradable **passive** — e.g. Necromancer's *Undying Legion* raises a free bonus
  minion every few kills (doesn't count toward your cap), Warrior's *Bloodlust* heals
  on kills, Fire Mage's *Conflagration* makes kills explode, etc.,
- a **skill tree** of class-specific nodes plus a shared pool of generic stat upgrades
  (HP, attack, damage %, attack speed, move speed, crit chance, crit damage, HP regen).

You earn **3 skill points per level** to spend however you like.

## Project layout

```
index.html      3-column layout (P1 panel | canvas | P2 panel) + overlays
styles.css      pixel UI theme
src/
  main.js       game loop, phase machine, player control, floor flow
  state.js      shared constants + global game state
  input.js      two per-player keymaps + edge-triggered input
  rng.js        seeded PRNG helpers
  classes.js    8 classes: stats, abilities, skill trees
  player.js     stats, XP/level, gold, inventory, downed/revive
  enemies.js    archetypes, scaling, AI, bosses, floor population
  combat.js     attacks, projectiles, abilities, status effects, minions
  items.js      equipment/potions + drop & shop generation
  dungeon.js    procedural rooms/corridors + collision + stairs
  shop.js       between-floor stock + purchasing
  render.js     camera + pixel-art canvas rendering
  ui.js         side panels, inventory/skills, class-select, shop, end screens
```

All art is drawn procedurally on a canvas — there are no image or audio assets.
