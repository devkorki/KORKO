export function createWorld({ width = 20, height = 20 } = {}) {
  const tiles = Array.from({ length: width }, () =>
    Array.from({ length: height }, () => ({
      biome: pick(["plains", "forest", "desert", "mountain"]),
      searchedAt: 0
    }))
  );

  return { width, height, tiles };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function inBounds(world, x, y) {
  return x >= 0 && y >= 0 && x < world.width && y < world.height;
}

export function tileAt(world, x, y) {
  return world.tiles[x][y];
}


export function getVision(world, cx, cy, radius) {
  const tiles = [];
  for (let y = cy + radius; y >= cy - radius; y--) {
    const row = [];
    for (let x = cx - radius; x <= cx + radius; x++) {
      const inb = inBounds(world, x, y);
      row.push(inb ? tileAt(world, x, y).biome : null);
    }
    tiles.push(row);
  }
  return tiles; // rows from top->bottom, cols left->right
}