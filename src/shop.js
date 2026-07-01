// Between-floor shop: stock generation + purchase logic.
import { game } from './state.js';
import { generateShopStock } from './items.js';

export function openShop() {
  game.shop = {
    stock: generateShopStock(game.floor),
    ready: [false, false],
    cursor: [0, 0],
  };
}

export function closeShop() {
  game.shop = null;
}

// Buy a copy of a stock item for a player. Stock is reusable (consumables/gear restock).
export function buy(player, item) {
  if (player.gold < item.price) return { ok: false, reason: 'Not enough gold' };
  if (player.inventory.length >= 16) return { ok: false, reason: 'Inventory full' };
  player.gold -= item.price;
  const copy = { ...item, uid: Math.random() };
  player.addItem(copy);
  return { ok: true };
}
