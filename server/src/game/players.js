import { inBounds } from "./world.js";

export function createPlayers() {
  /** @type {Map<string, any>} */
  const byId = new Map();
  return { byId };
}

export function makePlayer({ id, name, spawnX = 0, spawnY = 0 }) {
  return {
    id,
    name,
    x: spawnX,
    y: spawnY,
    hp: 100,
    maxHp: 100,
    stamina: 10,
    maxStamina: 10,
    inventory: {}, // { itemName: qty }
    lastActionAt: Date.now()
  };
}

export function movePlayer(world, player, dir) {
  let nx = player.x;
  let ny = player.y;

  if (dir === "north") ny += 1;
  if (dir === "south") ny -= 1;
  if (dir === "east") nx += 1;
  if (dir === "west") nx -= 1;

  if (!inBounds(world, nx, ny)) return { ok: false, error: "Out of bounds." };
  if (player.stamina <= 0) return { ok: false, error: "No stamina." };

  player.x = nx;
  player.y = ny;
  player.stamina = Math.max(0, player.stamina - 1);
  player.lastActionAt = Date.now();
  return { ok: true };
}

export function addItem(player, name, qty) {
  player.inventory[name] = (player.inventory[name] || 0) + qty;
}
