import { useEffect, useMemo, useRef, useState } from "react";
import { connect } from "./net.js";
import { RECIPES } from "../../shared/recipes.js";


const SERVER_URL = "http://localhost:3000";

const VIEW_RADIUS = 4; // 9x9 minimap





export default function App() {
  const net = useMemo(() => connect(SERVER_URL), []);
  const [connected, setConnected] = useState(false);
  const [self, setSelf] = useState(null);
  const [state, setState] = useState(null);
  const [visionMap, setVisionMap] = useState(() => new Map()); // key "x,y" -> biome
  const [visionMeta, setVisionMeta] = useState(null); // {x,y,radius}

  // Split logs:
  const [activity, setActivity] = useState([]); // loot/world/system
  const [chatLog, setChatLog] = useState([]);   // player chat only
  const [chat, setChat] = useState("");

  // UI organization
  const [panel, setPanel] = useState("map"); // "map" | "inventory"

  const [knownBiomes, setKnownBiomes] = useState(() => new Map()); // key "x,y" -> biome
  const [vision, setVision] = useState(null);

  // Fog-of-war explored tiles (client-side)
  const exploredRef = useRef(new Set()); // key "x,y"

  useEffect(() => {
    net.socket.on("connect", () => setConnected(true));
    net.socket.on("disconnect", () => setConnected(false));

    net.on(net.EVENTS.VISION, (v) => {
      setVisionMeta({ x: v.x, y: v.y, radius: v.radius });

      const next = new Map();
      const r = v.radius;

      for (let row = 0; row < v.tiles.length; row++) {
        for (let col = 0; col < v.tiles[row].length; col++) {
          const biome = v.tiles[row][col];
          if (!biome) continue;

          const x = v.x + (col - r);
          const y = v.y + (r - row);

          next.set(`${x},${y}`, biome);
        }
      }

      setVisionMap(next);
    });



    net.on(net.EVENTS.SELF, (data) => setSelf(data));

    net.on(net.EVENTS.STATE, (data) => {
      setState(data);

      // mark explored around player
      const me = data?.players?.find((p) => p.id === self?.id);
      if (me) {
        for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
          for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
            exploredRef.current.add(`${me.x + dx},${me.y + dy}`);
          }
        }
      }
    });

    net.on(net.EVENTS.ERROR, (e) => pushActivity(` ${e.message}`));

    // World/system messages -> Activity
    net.on(net.EVENTS.CHAT_BROADCAST, (m) => {
      if (m.from === "World" || m.from === "System") {
        pushActivity(` ${m.text}`);
      } else {
        pushChat(`${m.from}: ${m.text}`);
      }
    });

    // Loot -> Activity
    net.on(net.EVENTS.LOOT, (r) => {
      if (r.loot) pushActivity(`Found ${r.loot.name} x${r.loot.qty}`);
      else pushActivity("Found nothing.");
      setSelf((s) => (s ? { ...s, inventory: r.inventory } : s));
    });



    return () => net.socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") closeMenus();
    }
    function onClick() {
      closeMenus();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, []);

  function pushActivity(line) {
    setActivity((l) => [line, ...l].slice(0, 80));
  }

  function pushChat(line) {
    setChatLog((l) => [...l, line].slice(-120));
  }

  function doMove(dir) {
    net.emit(net.EVENTS.MOVE, { dir });
  }

  function doSearch() {
    net.emit(net.EVENTS.SEARCH);
  }


  function toggleItemMenu(itemName) {
    setOpenItemMenu((cur) => (cur === itemName ? null : itemName));
  }

  function closeMenus() {
    setOpenItemMenu(null);
  }


  function joinGame() {
    const name = playerName.trim();

    if (!name) return;

    localStorage.setItem("korkmmo:name", name);

    net.emit(net.EVENTS.HELLO, { name });

    setHasJoined(true);
  }

  function sendChat(e) {
    e.preventDefault();
    const msg = chat.trim();
    if (!msg) return;
    net.emit(net.EVENTS.CHAT, { text: msg });
    setChat("");
  }

  const me = state?.players?.find((p) => p.id === self?.id);
  const sameTilePlayers =
    me && state?.players
      ? state.players.filter(
        (p) => p.id !== self?.id && p.x === me.x && p.y === me.y
      )
      : [];



  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem("korkmmo:name") || ""
  );


  const [openItemMenu, setOpenItemMenu] = useState(null); // itemName | null

  const [hasJoined, setHasJoined] = useState(false);
  // ===== Minimap rendering =====
  const tiles = [];


  if (state?.world && me) {
    for (let y = me.y + VIEW_RADIUS; y >= me.y - VIEW_RADIUS; y--) {
      const row = [];
      for (let x = me.x - VIEW_RADIUS; x <= me.x + VIEW_RADIUS; x++) {
        const inBounds =
          x >= 0 && y >= 0 && x < state.world.width && y < state.world.height;
        const key = `${x},${y}`;
        const explored = exploredRef.current.has(key);

        const isMe = x === me.x && y === me.y;
        row.push({ x, y, inBounds, explored, isMe });
      }
      tiles.push(row);
    }
  }

  if (!hasJoined) {
    return (
      <div className="joinScreen">
        <div className="joinCard">
          <h2>Welcome to korkMMO</h2>

          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name..."
            maxLength={16}
          />

          <button onClick={joinGame}>Enter World</button>
        </div>
      </div>
    );
  }

  return (


    <div className="wrap">
      <header className="top">
        <div className="title">korkMMO</div>
        <div className="rightHeader">
          <div className="pill">{connected ? "online" : "offline"}</div>
        </div>
      </header>

      <div className="layout">
        {/* LEFT COLUMN */}
        <div className="col">
          <section className="card">
            <div className="cardHeader">
              <h3>Player</h3>
              <div className="seg">
                <button
                  className={panel === "map" ? "segOn" : ""}
                  onClick={() => setPanel("map")}
                >
                  Map
                </button>
                <button
                  className={panel === "inventory" ? "segOn" : ""}






                  onClick={() => setPanel("inventory")}
                >
                  Inventory
                </button>


                <div className="panel">
             
                

                  {/* {self?.inventory && Object.keys(self.inventory).filter(k => k !== "Note").length ? (
                    <ul className="invList">
                      {Object.entries(self.inventory)
                        .filter(([k]) => k !== "Note")
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([k, v]) => (
                          <li key={k}>
                            <span>{k}</span>
                            <b>x{v}</b>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <div className="muted">Empty</div>
                  )} */}

                  {/* Optional: show note preview skeleton (read) */}
                  <div style={{ marginTop: 14 }}>

                  </div>
                </div>
              </div>
            </div>

            {self && me ? (
              <div className="playerInfo">
                <div className="name"><b>{self.name}</b></div>
                <div className="stats">
                  <div>Pos: {me.x}, {me.y}</div>
                  <div>HP: {me.hp}/{me.maxHp}</div>
                  <div>Stamina: {me.stamina}/{me.maxStamina}</div>
                </div>
              </div>
            ) : (
              <div>Loading…</div>


            )}


            {sameTilePlayers.length > 0 && (
              <div className="panel">
                <h4>Players here</h4>

                <div className="playerHereList">
                  {sameTilePlayers.map((p) => (
                    <div key={p.id} className="playerHereRow">
                      <div className="playerHereName">{p.name}</div>

                      <div className="playerHereActions">
                        <button onClick={() => { }}>Inspect</button>
                        <button onClick={() => { }}>Invite to Party</button>
                        <button onClick={() => { }}>Add Friend</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="controls">
              <div className="dpad">
                <button className="dpadBtn north" onClick={() => doMove("north")} aria-label="North">
                  <span className="arrow">▲</span>
                  <span className="dir">N</span>
                </button>

                <button className="dpadBtn west" onClick={() => doMove("west")} aria-label="West">
                  <span className="dir left">W</span>
                  <span className="arrow">◀</span>
                </button>

                <button className="dpadBtn east" onClick={() => doMove("east")} aria-label="East">
                  <span className="arrow">▶</span>
                  <span className="dir right">E</span>
                </button>

                <button className="dpadBtn south" onClick={() => doMove("south")} aria-label="South">
                  <span className="dir">S</span>
                  <span className="arrow">▼</span>
                </button>
              </div>

              <div className="actions">
                <button className="primary" onClick={doSearch}>Search</button>
              </div>
            </div>

            {panel === "map" && (
              <div className="panel">
                <h4>Minimap</h4>
                {!me ? (
                  <div className="muted">Loading…</div>
                ) : (
                  <div className="minimap">
                    {tiles.map((row, i) => (
                      <div className="miniRow" key={i}>

                        {row.map((t) => {
                          const key = `${t.x},${t.y}`;
                          const biome = visionMap.get(key); // visible only if in vision
                          const visible = Boolean(biome);
                          const othersHere =
                            state?.players?.filter((p) => p.id !== self?.id && p.x === t.x && p.y === t.y) ?? [];
                          const hasOther = othersHere.length > 0;

                          const cls = [
                            "miniTile",
                            !t.inBounds ? "oob" : "",
                            t.inBounds && !visible ? "fog" : "",
                            t.isMe ? "me" : "",
                            hasOther ? "other" : ""
                          ].join(" ");

                          const letter = biome ? biome.charAt(0).toUpperCase() : "";
                          const biomeClass = biome ? `biome-${biome}` : "";

                          return (


                            <div
                              key={key}
                              className={`${cls} ${biomeClass}`}
                              title={`${t.x},${t.y}${biome ? " • " + biome : ""}`}
                            >
                              {t.isMe ? "@" : hasOther ? "•" : (t.inBounds && visible ? letter : "")}
                            </div>
                          );
                        })}

                      </div>
                    ))}
                  </div>
                )}
                <div className="legend">
                  <span className="dot meDot" /> You
                  <span className="dot fogDot" /> Fog
                </div>
              </div>
            )}

            {panel === "inventory" && (
              <div className="panel">
                <h4>Inventory</h4>

                {self?.inventory && Object.keys(self.inventory).length ? (
                  <div className="invGrid">
                    {Object.entries(self.inventory)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([name, qty]) => {
                        const isNote = name === "Note";

                        // Skeleton options per item
                        const options = isNote
                          ? [
                            { label: "Read", onClick: () => { } },
                            { label: "Write", onClick: () => { } }
                          ]
                          : [
                            { label: "Use", onClick: () => { } },
                            { label: "Drop", onClick: () => { } }
                          ];

                        return (
                          <div key={name} className="invRow" onClick={(e) => e.stopPropagation()}>
                            <div className="invLeft">
                              <div className="invName">{name}</div>
                              <div className="invQty">x{qty}</div>
                            </div>

                            <div className="invRight">
                              <button
                                className="kebab"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleItemMenu(name);
                                }}
                                aria-label={`Options for ${name}`}
                                title="Options"
                              >
                                ⋯
                              </button>

                              {openItemMenu === name && (
                                <div
                                  className="menu"
                                  onClick={(e) => e.stopPropagation()} // don’t close when clicking inside
                                >
                                  {options.map((opt) => (
                                    <button
                                      key={opt.label}
                                      className="menuItem"
                                      onClick={() => {
                                        opt.onClick();
                                        closeMenus();
                                      }}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="muted">Empty</div>
                )}
              </div>
            )}
          </section>

          {/* Activity / Loot / System */}
          <section className="card">
            <h3>Activity</h3>
            <div className="log">
              {activity.length ? (
                activity.map((l, i) => (
                  <div key={i} className="logLine">{l}</div>
                ))
              ) : (
                <div className="muted">Loot, warnings, and world info will show here.</div>
              )}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN */}
        <div className="col">
          {/* Chat only */}
          <section className="card">
            <h3>Chat</h3>
            <form onSubmit={sendChat} className="chatRow">
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                placeholder="say something..."
              />
              <button type="submit">Send</button>
            </form>

            <div className="chatLog">
              {chatLog.length ? (
                chatLog.map((l, i) => (
                  <div key={i} className="logLine">{l}</div>
                ))
              ) : (
                <div className="muted"></div>
              )}
            </div>
          </section>

          <section className="card">
            <h3>Online</h3>
            <div className="muted">Players: {state?.players?.length ?? 0}</div>
            <ul className="onlineList">
              {state?.players?.map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  <span className="muted">@ {p.x},{p.y}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
