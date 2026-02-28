import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import { EVENTS, DIRS } from "../../shared/protocol.js";
// import { createWorld, tileAt } from "./game/world.js";
import { createPlayers, makePlayer, movePlayer, addItem } from "./game/players.js";
import { searchTile } from "./game/loot.js";
// import { createWorld, tileAt, getVision } from "./game/world.js";
import { createWorld, tileAt, getVision } from "./game/world.js";

import { RECIPES } from "../../shared/recipes.js";
const app = express();
app.use(cors());
app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const world = createWorld({ width: 24, height: 24 });
const players = createPlayers();

const DEFAULT_NOTE_TEXT = [
  
  "Basic recipes:",
  "- Rope: Fiber x3",
  "- Stone Axe: Wood x2, Stone x2, Rope x1",
  "- Wooden Pick: Wood x3, Stone x1, Rope x1",
  "",
  "Tip: Search different biomes for different materials."
].join("\n");

const VIEW_RADIUS = 1;

function emitVision(socket, p) {
  socket.emit(EVENTS.VISION, {
    radius: VIEW_RADIUS,
    x: p.x,
    y: p.y,
    tiles: getVision(world, p.x, p.y, VIEW_RADIUS)
  });
}

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    hp: p.hp,
    maxHp: p.maxHp,
    stamina: p.stamina,
    maxStamina: p.maxStamina
  };
}

function makeState() {
  return {
    world: { width: world.width, height: world.height },
    players: Array.from(players.byId.values()).map(publicPlayer)
  };
}

function emitState() {
  io.emit(EVENTS.STATE, makeState());
}

function spawnPoint() {
  // simple spawn near center
  const x = Math.floor(world.width / 2);
  const y = Math.floor(world.height / 2);
  return { x, y };
}


function hasIngredients(inv, requires) {
  for (const [name, qty] of Object.entries(requires)) {
    if ((inv[name] || 0) < qty) return false;
  }
  return true;
}

function consumeIngredients(inv, requires) {
  for (const [name, qty] of Object.entries(requires)) {
    inv[name] -= qty;
    if (inv[name] <= 0) delete inv[name];
  }
}

function addGives(inv, gives) {
  for (const [name, qty] of Object.entries(gives)) {
    inv[name] = (inv[name] || 0) + qty;
  }
}

// stamina regen tick
setInterval(() => {
  let changed = false;
  for (const p of players.byId.values()) {
    const before = p.stamina;
    p.stamina = Math.min(p.maxStamina, p.stamina + 1);
    if (p.stamina !== before) changed = true;
  }
  if (changed) emitState();
}, 5000);

io.on("connection", (socket) => {
  socket.on(EVENTS.HELLO, ({ name }) => {
    const safeName = String(name || "Traveler").slice(0, 16);
    const { x, y } = spawnPoint();

    const p = makePlayer({ id: socket.id, name: safeName, spawnX: x, spawnY: y });

    // starter "pocket" items
    p.inventory = { Note: 1 };

    // starter note content
    p.noteText = DEFAULT_NOTE_TEXT;
    players.byId.set(socket.id, p);

    socket.emit(EVENTS.SELF, {
      id: p.id,
      name: p.name,
      inventory: p.inventory,
      noteText: p.noteText
    });

    emitVision(socket, p);

    emitState();
  });

  socket.on(EVENTS.MOVE, ({ dir }) => {
    const p = players.byId.get(socket.id);
    if (!p) return;

    if (!DIRS.includes(dir)) {
      socket.emit(EVENTS.ERROR, { message: "Bad direction." });
      return;
    }

    const result = movePlayer(world, p, dir);
    if (!result.ok) {
      socket.emit(EVENTS.ERROR, { message: result.error });
      return;
    }

    const biome = tileAt(world, p.x, p.y).biome;
    socket.emit(EVENTS.CHAT_BROADCAST, { from: "World", text: `You entered ${biome}.` });

    emitVision(socket, p);
    emitState();
  });

  socket.on(EVENTS.SEARCH, () => {
    const p = players.byId.get(socket.id);
    if (!p) return;

    const result = searchTile(world, p);
    if (!result.ok) {
      socket.emit(EVENTS.ERROR, { message: result.error });
      return;
    }

    if (result.loot) {
      addItem(p, result.loot.name, result.loot.qty);
      socket.emit(EVENTS.LOOT, { loot: result.loot, inventory: p.inventory });
    } else {
      socket.emit(EVENTS.LOOT, { loot: null, inventory: p.inventory });
    }
    emitVision(socket, p);
    emitState();
  });

  socket.on(EVENTS.CHAT, ({ text }) => {
    const p = players.byId.get(socket.id);
    if (!p) return;

    const msg = String(text || "").trim().slice(0, 120);
    if (!msg) return;

    io.emit(EVENTS.CHAT_BROADCAST, { from: p.name, text: msg });
  });


  socket.on(EVENTS.CRAFT, ({ recipeName }) => {
    const p = players.byId.get(socket.id);
    if (!p) return;

    const recipe = RECIPES.find((r) => r.name === recipeName);
    if (!recipe) {
      socket.emit(EVENTS.ERROR, { message: "Recipe not found." });
      return;
    }

    if (!hasIngredients(p.inventory, recipe.requires)) {
      socket.emit(EVENTS.ERROR, { message: "Not enough ingredients." });
      return;
    }

    consumeIngredients(p.inventory, recipe.requires);
    addGives(p.inventory, recipe.gives);

    socket.emit(EVENTS.LOOT, { loot: { name: recipe.name, qty: 1 }, inventory: p.inventory });
    socket.emit(EVENTS.CHAT_BROADCAST, { from: "World", text: `Crafted ${recipe.name}.` });

    emitState();
  });

  socket.on("disconnect", () => {
    players.byId.delete(socket.id);
    emitState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`korkMMO server on :${PORT}`));
