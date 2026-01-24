import React, { useEffect, useMemo, useState, useCallback } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove
} from "firebase/firestore";

import { gcsSearch, gcsEnabled, computeBenchmarkFromResults } from "./services/gcsSearch";

/* ---------------------------
   Firebase config (yours)
---------------------------- */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo",
  authDomain: "rosie-pa.firebaseapp.com",
  projectId: "rosie-pa",
  storageBucket: "rosie-pa.appspot.com",
  messagingSenderId: "767772651557",
  appId: "1:767772651557:web:239816f833c5af7c20cfcc"
};

const app = !getApps().length ? initializeApp(FIREBASE_CONFIG) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------------------------
   Icons (no external libs)
---------------------------- */
const Icon = ({ glyph, label }) => (
  <span aria-label={label} title={label} style={{ fontSize: 18, lineHeight: 1 }}>
    {glyph}
  </span>
);

function nowId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeOpen(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function buildRetailerSearchLinks(item) {
  const q = encodeURIComponent(item);
  return [
    { name: "Google", url: `https://www.google.com/search?q=${q}+price+South+Africa` },
    { name: "Checkers", url: `https://www.google.com/search?q=${q}+site:checkers.co.za` },
    { name: "Pick n Pay", url: `https://www.google.com/search?q=${q}+site:pnp.co.za` },
    { name: "Woolworths", url: `https://www.google.com/search?q=${q}+site:woolworths.co.za` },
    { name: "SPAR", url: `https://www.google.com/search?q=${q}+site:spar.co.za` },
    { name: "Makro", url: `https://www.google.com/search?q=${q}+site:makro.co.za` }
  ];
}

/* ---------------------------
   TheMealDB (free recipes)
---------------------------- */
async function fetchMealDbSearch(query) {
  const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Recipe search failed.");
  const data = await res.json();
  return Array.isArray(data?.meals) ? data.meals : [];
}

/* ---------------------------
   App
---------------------------- */
export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("BRAIN");

  // Kitchen Firestore
  const [shopping, setShopping] = useState([]);
  const [kitchenBooted, setKitchenBooted] = useState(false);

  // AI Search Benchmark results (local UI state)
  // map: itemName -> {loading, benchmark, results, error}
  const [aiPriceResults, setAiPriceResults] = useState({});
  const [aiBatchLoading, setAiBatchLoading] = useState(false);

  // Staff
  const STAFF = useMemo(() => ([
    { id: "jabu", name: "Jabu", role: "Housekeeping", whatsapp: "27798024735" },
    { id: "lisa", name: "Lisa", role: "Home Maintenance", whatsapp: "27635650731" }
  ]), []);

  const [tasks, setTasks] = useState({ jabu: [], lisa: [] });
  const [activeStaff, setActiveStaff] = useState(null);

  /* Boot */
  useEffect(() => {
    (async () => {
      try {
        await signInAnonymously(auth);

        await setDoc(doc(db, "rosie", "state"), { bootedAt: Date.now(), v: "31.6.2" }, { merge: true });
        await setDoc(doc(db, "rosie", "kitchen"), { shopping: [] }, { merge: true });

        for (const s of STAFF) {
          await setDoc(doc(db, "rosie", "tasks", "people", s.id), { items: [] }, { merge: true });
        }

        setReady(true);
      } catch (e) {
        console.error(e);
        setReady(true);
      }
    })();
  }, [STAFF]);

  /* Listeners */
  useEffect(() => {
    if (!ready) return;

    const unsubKitchen = onSnapshot(doc(db, "rosie", "kitchen"), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      setShopping(Array.isArray(d.shopping) ? d.shopping : []);
      setKitchenBooted(true);
    });

    const unsubs = STAFF.map((s) =>
      onSnapshot(doc(db, "rosie", "tasks", "people", s.id), (snap) => {
        const d = snap.exists() ? snap.data() : {};
        setTasks((prev) => ({
          ...prev,
          [s.id]: Array.isArray(d.items) ? d.items : []
        }));
      })
    );

    return () => {
      unsubKitchen();
      unsubs.forEach((u) => u && u());
    };
  }, [ready, STAFF]);

  /* Staff helpers */
  const addTask = useCallback(async (staffId, title) => {
    if (!title || !title.trim()) return;
    const ref = doc(db, "rosie", "tasks", "people", staffId);
    const t = { id: nowId(), title: title.trim(), completed: false, createdAt: Date.now() };
    await setDoc(ref, { items: arrayUnion(t) }, { merge: true });
  }, []);

  const toggleTask = useCallback(async (staffId, task) => {
    const ref = doc(db, "rosie", "tasks", "people", staffId);
    const updated = { ...task, completed: !task.completed, completedAt: !task.completed ? Date.now() : null };
    await updateDoc(ref, { items: arrayRemove(task) });
    await updateDoc(ref, { items: arrayUnion(updated) });
  }, []);

  const deleteTask = useCallback(async (staffId, task) => {
    const ref = doc(db, "rosie", "tasks", "people", staffId);
    await updateDoc(ref, { items: arrayRemove(task) });
  }, []);

  const sendTasksToWhatsApp = useCallback((staff) => {
    const open = (tasks[staff.id] || []).filter(t => !t.completed);
    const lines = [
      `Rosie To-Do — ${staff.name}`,
      `Today`,
      ``,
      ...(open.length ? open.map((t, i) => `${i + 1}. ${t.title}`) : ["No tasks scheduled."]),
      ``,
      `Please reply “Done” when completed. Thanks.`
    ];
    safeOpen(`https://wa.me/${staff.whatsapp}?text=${encodeURIComponent(lines.join("\n"))}`);
  }, [tasks]);

  /* Kitchen helpers */
  const addShoppingItem = useCallback(async (name, qty = "1") => {
    if (!name || !name.trim()) return;
    const ref = doc(db, "rosie", "kitchen");
    const it = { id: nowId(), name: name.trim(), qty: (qty || "1").trim() };
    await setDoc(ref, { shopping: arrayUnion(it) }, { merge: true });
  }, []);

  const removeShoppingItem = useCallback(async (item) => {
    const ref = doc(db, "rosie", "kitchen");
    await updateDoc(ref, { shopping: arrayRemove(item) });
  }, []);

  /* ---------------------------
     AI Search benchmark price fetch
     (Google Custom Search)
  ---------------------------- */
  const aiFetchForItem = useCallback(async (itemName) => {
    const name = (itemName || "").trim();
    if (!name) return;

    setAiPriceResults((prev) => ({
      ...prev,
      [name]: { loading: true, benchmark: null, results: [], error: "" }
    }));

    try {
      const query = `${name} price South Africa`;
      const resp = await gcsSearch(query, { num: 5 });

      if (!resp.ok) {
        const msg =
          resp.reason === "NO_KEY"
            ? "AI Search is not enabled. Add REACT_APP_GCS_KEY and REACT_APP_GCS_CX in Vercel."
            : `AI Search failed (${resp.reason}).`;

        setAiPriceResults((prev) => ({
          ...prev,
          [name]: { loading: false, benchmark: null, results: [], error: msg }
        }));
        return;
      }

      const benchmark = computeBenchmarkFromResults(resp.results);

      setAiPriceResults((prev) => ({
        ...prev,
        [name]: { loading: false, benchmark, results: resp.results, error: "" }
      }));
    } catch (e) {
      setAiPriceResults((prev) => ({
        ...prev,
        [name]: { loading: false, benchmark: null, results: [], error: e?.message || "AI Search failed." }
      }));
    }
  }, []);

  const aiFetchAll = useCallback(async () => {
    if (!shopping.length) return;
    setAiBatchLoading(true);
    try {
      for (const it of shopping) {
        await aiFetchForItem(it.name);
      }
    } finally {
      setAiBatchLoading(false);
    }
  }, [shopping, aiFetchForItem]);

  /* UI */
  const TopBar = () => (
    <div style={{ padding: "18px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/rosie.svg" alt="Rosie" style={{ width: 44, height: 44 }} />
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, margin: 0 }}>Rosie PA</div>
          <div className="small">V31.6.2 DOWNLOAD</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", opacity: 0.9 }}>
        <Icon glyph="📶" label="Signal" />
        <Icon glyph="🛜" label="WiFi" />
      </div>
    </div>
  );

  const Brain = () => (
    <div className="page">
      <div style={{ textAlign: "center", paddingTop: 6 }}>
        <img src="/rosie.svg" alt="Rosie" className="rosie-mascot" />
        <div style={{ fontWeight: 900, fontSize: 34, margin: "8px 0 4px" }}>Hi! I’m Rosie</div>
        <div className="small" style={{ fontSize: 14, marginBottom: 16 }}>
          Shopping list + AI price benchmark + recipes + staff tasks.
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <button className="card" onClick={() => setTab("KITCHEN")} style={{ border: "none", textAlign: "left", cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon glyph="🍽️" label="Kitchen" /><b>Kitchen OS</b>
            </div>
            <span className="small">AI Search Benchmark + Links</span>
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            Uses search API results (no scraping) to estimate a benchmark range.
          </div>
        </button>

        <button className="card" onClick={() => setTab("HUB")} style={{ border: "none", textAlign: "left", cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon glyph="👥" label="Staff" /><b>Staff Tasks</b>
            </div>
            <span className="small">Jabu + Lisa</span>
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            Assign tasks and send WhatsApp To-Do lists.
          </div>
        </button>
      </div>
    </div>
  );

  const Hub = () => {
    if (!activeStaff) {
      return (
        <div className="page">
          <div className="card">
            <div style={{ fontWeight: 900, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon glyph="👥" label="Staff" /> Staff & To-Do
            </div>
            <div className="small" style={{ marginTop: 6 }}>Tap a person to manage their list.</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            {STAFF.map(s => (
              <button
                key={s.id}
                className="card"
                style={{ border: "none", textAlign: "left", cursor: "pointer" }}
                onClick={() => setActiveStaff(s)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <img src="/rosie.svg" alt="Rosie" style={{ width: 30, height: 30 }} />
                  <div>
                    <div style={{ fontWeight: 900 }}>{s.name}</div>
                    <div className="small">{s.role}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return <StaffDetail staff={activeStaff} onBack={() => setActiveStaff(null)} />;
  };

  const StaffDetail = ({ staff, onBack }) => {
    const [newTask, setNewTask] = useState("");
    const list = tasks[staff.id] || [];

    return (
      <div className="page">
        <button className="btn-soft" onClick={onBack}><Icon glyph="←" label="Back" /> Back</button>

        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>{staff.name}</div>
              <div className="small">{staff.role}</div>
            </div>
            <button className="btn" onClick={() => sendTasksToWhatsApp(staff)}>
              <Icon glyph="💬" label="WhatsApp" /> Send WhatsApp
            </button>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <input className="input" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add task..." />
            <button className="btn" onClick={async () => { await addTask(staff.id, newTask); setNewTask(""); }}>
              <Icon glyph="＋" label="Add" />
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {list.length === 0 && <div className="card"><div className="small">No tasks yet.</div></div>}
          {list.map(t => (
            <div key={t.id} className="list-item">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="btn-soft" onClick={() => toggleTask(staff.id, t)}>
                  {t.completed ? <Icon glyph="✅" label="Done" /> : <Icon glyph="❤️" label="Open" />}
                </button>
                <div style={{ fontWeight: 900, textDecoration: t.completed ? "line-through" : "none", opacity: t.completed ? 0.65 : 1 }}>
                  {t.title}
                </div>
              </div>
              <button className="btn-soft" onClick={() => deleteTask(staff.id, t)}>
                <Icon glyph="🗑️" label="Delete" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const Kitchen = () => {
    const [view, setView] = useState("menu");
    return (
      <div className="page">
        <button className="btn-soft" onClick={() => setTab("BRAIN")}><Icon glyph="←" label="Back" /> Back</button>

        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon glyph="🍽️" label="Kitchen" /> Kitchen OS
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            Shopping list sync + AI Search benchmark + recipe finder.
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <button className="btn" onClick={() => setView("shopping")}><Icon glyph="🛒" label="Shopping" /> Shopping List</button>
            <button className="btn" onClick={() => setView("aiPrices")}><Icon glyph="🧠" label="AI Price" /> AI Search Price Check</button>
            <button className="btn" onClick={() => setView("recipes")}><Icon glyph="🍰" label="Recipes" /> Recipe Finder</button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {view === "shopping" && <ShoppingList />}
          {view === "aiPrices" && <AiPriceCheck />}
          {view === "recipes" && <RecipeFinder />}
        </div>
      </div>
    );
  };

  const ShoppingList = () => {
    const [name, setName] = useState("");
    const [qty, setQty] = useState("1");

    if (!kitchenBooted) {
      return <div className="card"><div className="small">Loading Kitchen…</div></div>;
    }

    return (
      <div className="card">
        <div style={{ fontWeight: 900, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon glyph="🛒" label="Shopping" /> Shopping List
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add item (e.g. milk)" />
          <input className="input" style={{ maxWidth: 110 }} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" />
          <button className="btn" onClick={async () => { await addShoppingItem(name, qty); setName(""); setQty("1"); }}>
            <Icon glyph="＋" label="Add" />
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          {shopping.length === 0 && <div className="small">No grocery items yet.</div>}
          {shopping.map(it => (
            <div key={it.id} className="list-item">
              <div>{it.name} <span className="small">x{it.qty}</span></div>
              <button className="btn-soft" onClick={() => removeShoppingItem(it)}>
                <Icon glyph="🗑️" label="Remove" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const AiPriceCheck = () => {
    const [selected, setSelected] = useState(null);

    return (
      <div className="card">
        <div style={{ fontWeight: 900, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon glyph="🧠" label="AI Search" /> AI Search Engine Check (Benchmark)
        </div>

        <div className="small" style={{ marginTop: 6 }}>
          Rosie queries a search API, extracts visible Rand prices from snippets (if present), and shows a benchmark range plus top links.
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={aiFetchAll} disabled={aiBatchLoading || !shopping.length}>
            <Icon glyph="⚡" label="Batch" /> {aiBatchLoading ? "Checking…" : "Check All Items"}
          </button>
          <button className="btn-soft" onClick={() => setSelected(null)}>
            <Icon glyph="🧼" label="Clear" /> Clear
          </button>
        </div>

        {!gcsEnabled() && (
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900 }}>AI Search is not enabled</div>
            <div className="small" style={{ marginTop: 6 }}>
              Add these in Vercel Environment Variables:
              <div className="small" style={{ marginTop: 6 }}>
                <b>REACT_APP_GCS_KEY</b> and <b>REACT_APP_GCS_CX</b>
              </div>
              You still have store links even without AI Search.
            </div>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {shopping.length === 0 && <div className="small">Add groceries first.</div>}

          {shopping.map(it => {
            const name = it.name;
            const pr = aiPriceResults[name] || null;

            return (
              <button
                key={it.id}
                className="list-item"
                style={{ width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}
                onClick={() => setSelected(name)}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div>
                    {name} <span className="small">x{it.qty}</span>
                  </div>

                  {pr?.loading && <span className="small">AI checking…</span>}

                  {!pr?.loading && pr?.benchmark && (
                    <span className="small">
                      Benchmark: <b>R {pr.benchmark.min.toFixed(2)} – R {pr.benchmark.max.toFixed(2)}</b> • {pr.benchmark.sampleCount} price hits
                    </span>
                  )}

                  {!pr?.loading && pr?.error && (
                    <span className="small" style={{ color: "#b91c1c" }}>{pr.error}</span>
                  )}

                  {!pr?.loading && !pr?.benchmark && pr?.results?.length > 0 && (
                    <span className="small">
                      No Rand price in snippets — links ready.
                    </span>
                  )}
                </div>

                <Icon glyph="→" label="Details" />
              </button>
            );
          })}
        </div>

        {selected && (
          <div style={{ marginTop: 12 }} className="card">
            <div style={{ fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon glyph="🔎" label="Selected" /> {selected}
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => aiFetchForItem(selected)}>
                <Icon glyph="📡" label="Check" /> AI Check
              </button>
              <button className="btn-soft" onClick={() => safeOpen(`https://www.google.com/search?q=${encodeURIComponent(selected + " price South Africa")}`)}>
                <Icon glyph="🌍" label="Google" /> Open Google
              </button>
            </div>

            {aiPriceResults[selected]?.benchmark && (
              <div style={{ marginTop: 12 }} className="card">
                <div style={{ fontWeight: 900 }}>Benchmark Range</div>
                <div className="small" style={{ marginTop: 6 }}>
                  <b>R {aiPriceResults[selected].benchmark.min.toFixed(2)} – R {aiPriceResults[selected].benchmark.max.toFixed(2)}</b>
                  <span className="small"> • extracted from search snippets</span>
                </div>
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900 }}>Top Links (AI Search)</div>
              <div className="small" style={{ marginTop: 6 }}>
                Tap a result to open. If no API is configured, use Store Links below.
              </div>

              {(aiPriceResults[selected]?.results || []).length === 0 && (
                <div className="small" style={{ marginTop: 10 }}>
                  No AI results yet — run “AI Check”.
                </div>
              )}

              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {(aiPriceResults[selected]?.results || []).slice(0, 5).map((r, idx) => (
                  <button
                    key={`${r.link}_${idx}`}
                    className="btn-soft"
                    onClick={() => safeOpen(r.link)}
                    style={{ textAlign: "left" }}
                  >
                    <div style={{ fontWeight: 900 }}>{r.title}</div>
                    <div className="small">{r.displayLink || ""}</div>
                    <div className="small" style={{ marginTop: 6 }}>{r.snippet}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900 }}>Store Links</div>
              <div className="small" style={{ marginTop: 6 }}>Tap a store to search for this item.</div>
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {buildRetailerSearchLinks(selected).map((l) => (
                  <button key={l.name} className="btn-soft" onClick={() => safeOpen(l.url)} style={{ textAlign: "left" }}>
                    <b>{l.name}</b>
                    <div className="small" style={{ marginTop: 4, wordBreak: "break-word" }}>{l.url}</div>
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    );
  };

  const RecipeFinder = () => {
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [meals, setMeals] = useState([]);
    const [err, setErr] = useState("");

    const search = async () => {
      setErr("");
      const query = q.trim();
      if (!query) return;
      setLoading(true);
      try {
        const results = await fetchMealDbSearch(query);
        setMeals(results.slice(0, 10));
      } catch (e) {
        setErr(e?.message || "Recipe search failed.");
      } finally {
        setLoading(false);
      }
    };

    const openTrending = (topic) => {
      const base = `${topic} recipe`;
      safeOpen(`https://www.google.com/search?q=${encodeURIComponent(`best ${base}`)}`);
      safeOpen(`https://www.youtube.com/results?search_query=${encodeURIComponent(`viral ${base}`)}`);
      safeOpen(`https://www.tiktok.com/search?q=${encodeURIComponent(`viral ${base}`)}`);
      safeOpen(`https://www.instagram.com/explore/tags/${encodeURIComponent(topic.replace(/\s+/g, ""))}/`);
    };

    return (
      <div className="card">
        <div style={{ fontWeight: 900, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon glyph="🍰" label="Recipes" /> Recipe Finder
        </div>

        <div className="small" style={{ marginTop: 6 }}>
          Find recipes plus trending/viral search buttons (no scraping required).
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Brownies / Kids pasta / Chicken curry" />
          <button className="btn" onClick={search}><Icon glyph="🔎" label="Search" /></button>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-soft" onClick={() => openTrending(q || "dessert")}><Icon glyph="🔥" label="Trending" /> Trending/Viral</button>
          <button className="btn-soft" onClick={() => openTrending("kids meals")}><Icon glyph="🧒" label="Kids" /> Kids Meals</button>
          <button className="btn-soft" onClick={() => openTrending("dessert")}><Icon glyph="🍫" label="Dessert" /> Desserts</button>
        </div>

        {loading && <div className="small" style={{ marginTop: 12 }}>Searching recipes…</div>}
        {err && <div className="small" style={{ marginTop: 12, color: "#b91c1c" }}>{err}</div>}

        <div style={{ marginTop: 12 }}>
          {!loading && meals.length === 0 && <div className="small">No recipes yet — search above.</div>}

          {meals.map((m) => (
            <div key={m.idMeal} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {m.strMealThumb ? (
                  <img
                    src={m.strMealThumb}
                    alt={m.strMeal}
                    style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: 16, background: "rgba(0,0,0,0.06)" }} />
                )}

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{m.strMeal}</div>
                  <div className="small">
                    {m.strArea ? `${m.strArea} • ` : ""}{m.strCategory || "Recipe"}
                  </div>
                </div>

                <button
                  className="btn-soft"
                  onClick={() => m.strSource ? safeOpen(m.strSource) : safeOpen(`https://www.google.com/search?q=${encodeURIComponent(m.strMeal + " recipe")}`)}
                >
                  <Icon glyph="📄" label="Open" />
                </button>
              </div>

              <div className="small" style={{ marginTop: 10 }}>
                {m.strInstructions ? `${m.strInstructions.slice(0, 220)}…` : "No instructions preview available."}
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => safeOpen(`https://www.google.com/search?q=${encodeURIComponent(`best ${m.strMeal} recipe`)}`)}>
                  <Icon glyph="⭐" label="Best" /> Best Versions
                </button>
                <button className="btn-soft" onClick={() => openTrending(m.strMeal)}>
                  <Icon glyph="🔥" label="Viral" /> Viral Searches
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const Setup = () => (
    <div className="page">
      <div className="card">
        <div style={{ fontWeight: 900, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon glyph="⚙️" label="Setup" /> Setup
        </div>
        <div className="small" style={{ marginTop: 8 }}>
          Rosie PA — <b>V31.6.2 DOWNLOAD</b>
        </div>
        <div className="small" style={{ marginTop: 8 }}>
          AI Search Benchmark: {gcsEnabled() ? <b>Enabled</b> : <b>Not enabled</b>}
        </div>
        <div className="small" style={{ marginTop: 8 }}>
          If disabled: set <b>REACT_APP_GCS_KEY</b> and <b>REACT_APP_GCS_CX</b> in Vercel.
        </div>
      </div>
    </div>
  );

  const render = () => {
    if (!ready) {
      return (
        <div className="page" style={{ textAlign: "center", paddingTop: 60 }}>
          <img src="/rosie.svg" alt="Rosie" style={{ width: 120, height: 120 }} />
          <div style={{ fontWeight: 900, fontSize: 28, marginTop: 10 }}>Booting Rosie…</div>
          <div className="small" style={{ marginTop: 8 }}>Signing in & syncing Firestore.</div>
        </div>
      );
    }
    if (tab === "BRAIN") return <Brain />;
    if (tab === "KITCHEN") return <Kitchen />;
    if (tab === "HUB") return <Hub />;
    return <Setup />;
  };

  return (
    <div>
      <TopBar />
      {render()}

      <div className="bottom-nav">
        <button className={`nav-btn ${tab === "BRAIN" ? "active" : ""}`} onClick={() => setTab("BRAIN")}>
          <Icon glyph="🧠" label="Brain" />
          <span className="small">Brain</span>
        </button>
        <button className={`nav-btn ${tab === "KITCHEN" ? "active" : ""}`} onClick={() => setTab("KITCHEN")}>
          <Icon glyph="🍽️" label="Kitchen" />
          <span className="small">Kitchen</span>
        </button>
        <button className={`nav-btn ${tab === "HUB" ? "active" : ""}`} onClick={() => setTab("HUB")}>
          <Icon glyph="👥" label="Hub" />
          <span className="small">Hub</span>
        </button>
        <button className={`nav-btn ${tab === "SETUP" ? "active" : ""}`} onClick={() => setTab("SETUP")}>
          <Icon glyph="⚙️" label="Setup" />
          <span className="small">Setup</span>
        </button>
      </div>
    </div>
  );
}
