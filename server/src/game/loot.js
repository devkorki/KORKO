import { tileAt } from "./world.js";

const BIOME_LOOT = {
  plains: [
    { name: "Fiber", chance: 0.45, min: 1, max: 3 },
    { name: "Stone", chance: 0.35, min: 1, max: 2 }
  ],
  forest: [
    { name: "Wood", chance: 0.55, min: 1, max: 3 },
    { name: "Fiber", chance: 0.35, min: 1, max: 3 }
  ],
  desert: [
    { name: "Stone", chance: 0.55, min: 1, max: 3 },
    { name: "Cactus Pulp", chance: 0.25, min: 1, max: 2 }
  ],
  mountain: [
    { name: "Stone", chance: 0.6, min: 1, max: 4 },
    { name: "Ore", chance: 0.2, min: 1, max: 1 }
  ]
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollLoot(biome) {
  const table = BIOME_LOOT[biome] || [];
  for (const entry of table) {
    if (Math.random() < entry.chance) {
      return { name: entry.name, qty: randInt(entry.min, entry.max) };
    }
  }
  return null;
}

export function searchTile(world, player, { cooldownMs = 20_000 } = {}) {
  const t = tileAt(world, player.x, player.y);

  const now = Date.now();
  if (player.stamina <= 0) return { ok: false, error: "No stamina." };
  if (now - t.searchedAt < cooldownMs) return { ok: false, error: "Tile recently searched." };

  player.stamina = Math.max(0, player.stamina - 1);
  t.searchedAt = now;

  const loot = rollLoot(t.biome);
  return { ok: true, biome: t.biome, loot };
}
