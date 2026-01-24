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
   LEGAL benchmark price fetch:
   SerpApi (Google Shopping/Search)
   Env var: REACT_APP_SERPAPI_KEY
---------------------------- */
const SERP_KEY = process.env.REACT_APP_SERPAPI_KEY || "";

function parsePriceToNumber(text) {
  if (!text) return null;
  // examples: "R 29.99", "R29,99", "ZAR 29.99"
  const cleaned = String(text)
    .replace(/ZAR/gi, "")
    .replace(/R/gi, "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const m = cleaned.match(/(\d+(\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

async function fetchBenchmarkPriceSerpApi(query) {
  if (!SERP_KEY) {
    return { ok: false, reason: "NO_KEY", best: null, items: [] };
  }

  const q = `${query} price South Africa`;
  // Try Google Shopping engine first (best for prices)
  const shoppingUrl =
    `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}&hl=en&gl=za&api_key=${encodeURIComponent(SERP_KEY)}`;

  const res = await fetch(shoppingUrl);
  if (!res.ok) {
    return { ok: false, reason: `HTTP_${res.status}`, best: null, items: [] };
  }

  const data = await res.json();
  const results = Array.isArray(data?.shopping_results) ? data.shopping_results : [];

  const items = results
    .slice(0, 10)
    .map((r) => {
      const priceText = r?.price || r?.extracted_price || "";
      const numeric = typeof r?.extracted_price === "number"
        ? r.extracted_price
        : parsePriceToNumber(priceText);

      return {
        title: r?.title || "Result",
        source: r?.source || r?.seller || "Source",
        link: r?.link || r?.product_link || "",
        priceText: priceText ? String(priceText) : (numeric ? `R ${numeric.toFixed(2)}` : ""),
        priceValue: numeric
      };
    })
    .filter((x) => x.link);

  // Choose cheapest numeric price as benchmark
  const priced = items.filter((x) => typeof x.priceValue === "number" && Number.isFinite(x.priceValue));
  priced.sort((a, b) => a.priceValue - b.priceValue);

  const best = priced.length ? priced[0] : (items[0] || null);

  return { ok: true, best, items };
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

  // Price benchmark results (local UI state)
  // map: itemName -> {loading, best, items, error}
  const [priceResults, setPriceResults] = useState({});
  const [priceBatchLoading, setPriceBatchLoading] = useState(false);

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

        await setDoc(doc(db, "rosie", "state"), { bootedAt: Date.now(), v: "31.6.1" }, { merge: true });
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

  /* Price fetching (benchmark) */
  const fetchPriceForItem = useCallback(async (itemName) => {
    const name = (itemName || "").trim();
    if (!name) return;

    setPriceResults((prev) => ({
      ...prev,
      [name]: { loading: true, best: null, items: [], error: "" }
    }));

    try {
      const result = await fetchBenchmarkPriceSerpApi(name);

      if (!result.ok) {
        const msg =
          result.reason === "NO_KEY"
            ? "No API key set. Add REACT_APP_SERPAPI_KEY in Vercel to fetch benchmark prices."
            : `Price fetch failed (${result.reason}).`;

        setPriceResults((prev) => ({
          ...prev,
          [name]: { loading: false, best: null, items: [], error: msg }
        }));
        return;
      }

      setPriceResults((prev) => ({
        ...prev,
        [name]: { loading: false, best: result.best, items: result.items, error: "" }
      }));
    } catch (e) {
      setPriceResults((prev) => ({
        ...prev,
        [name]: { loading: false, best: null, items: [], error: e?.message || "Price fetch failed." }
      }));
    }
  }, []);

  const fetchAllPrices = useCallback(async () => {
    if (!shopping.length) return;

    setPriceBatchLoading(true);
    try {
      // Sequential to avoid rate limits
      for (const it of shopping) {
        await fetchPriceForItem(it.name);
      }
    } finally {
      setPriceBatchLoading(false);
    }
  }, [shopping, fetchPriceForItem]);

  /* UI */
  const TopBar = () => (
    <div style={{ padding: "18px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/rosie.svg" alt="Rosie" style={{ width: 44, height: 44 }} />
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, margin: 0 }}>Rosie PA</div>
          <div className="small">V31.6.1 DOWNLOAD</div>
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
          Kitchen prices + recipes + staff tasks.
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <button className="card" onClick={() => setTab("KITCHEN")} style={{ border: "none", textAlign: "left", cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon glyph="🍽️" label="Kitchen" /><b>Kitchen OS</b>
            </div>
            <span className="small">Auto price benchmark + links</span>
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            Fetch benchmark prices from search data API, plus store links.
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
            Shopping list sync + benchmark price fetch + recipe finder.
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <button className="btn" onClick={() => setView("shopping")}><Icon glyph="🛒" label="Shopping" /> Shopping List</button>
            <button className="btn" onClick={() => setView("prices")}><Icon glyph="💰" label="Prices" /> Fetch Prices + Links</button>
            <button className="btn" onClick={() => setView("recipes")}><Icon glyph="🍰" label="Recipes" /> Recipe Finder</button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {view === "shopping" && <ShoppingList />}
          {view === "prices" && <PriceSearch />}
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

  const PriceSearch = () => {
    const [selected, setSelected] = useState(null);

    return (
      <div className="card">
        <div style={{ fontWeight: 900, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon glyph="💰" label="Prices" /> Benchmark Prices + Links
        </div>

        <div className="small" style={{ marginTop: 6 }}>
          Rosie fetches a benchmark price from a search data API (if configured) and always provides store links.
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={fetchAllPrices} disabled={priceBatchLoading || !shopping.length}>
            <Icon glyph="⚡" label="Auto" /> {priceBatchLoading ? "Fetching…" : "Fetch Prices for All"}
          </button>
          <button className="btn-soft" onClick={() => setSelected(null)}>
            <Icon glyph="🧼" label="Clear" /> Clear Selection
          </button>
        </div>

        {!SERP_KEY && (
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900 }}>Benchmark fetch not enabled</div>
            <div className="small" style={{ marginTop: 6 }}>
              Add <b>REACT_APP_SERPAPI_KEY</b> in Vercel env vars to enable in-app benchmark prices.
              You still have store links below.
            </div>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {shopping.length === 0 && <div className="small">Add groceries first.</div>}

          {shopping.map(it => {
            const name = it.name;
            const pr = priceResults[name] || null;
            const best = pr?.best || null;

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
                  {pr?.loading && <span className="small">Fetching benchmark…</span>}
                  {!pr?.loading && best?.priceText && (
                    <span className="small">
                      Benchmark: <b>{best.priceText}</b> • {best.source || "Source"}
                    </span>
                  )}
                  {!pr?.loading && pr?.error && (
                    <span className="small" style={{ color: "#b91c1c" }}>{pr.error}</span>
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
              <button className="btn" onClick={() => fetchPriceForItem(selected)}>
                <Icon glyph="📡" label="Fetch" /> Fetch Benchmark
              </button>
              <button className="btn-soft" onClick={() => safeOpen(`https://www.google.com/search?q=${encodeURIComponent(selected + " price South Africa")}`)}>
                <Icon glyph="🌍" label="Google" /> Open Google
              </button>
            </div>

            {/* Best + sources */}
            {priceResults[selected]?.best && (
              <div style={{ marginTop: 12 }} className="card">
                <div style={{ fontWeight: 900 }}>Benchmark Result</div>
                <div className="small" style={{ marginTop: 6 }}>
                  <b>{priceResults[selected].best.priceText || "Price"}</b> • {priceResults[selected].best.source || "Source"}
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn" onClick={() => safeOpen(priceResults[selected].best.link)}>
                    <Icon glyph="🔗" label="Open" /> Open Link
                  </button>
                </div>
              </div>
            )}

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

            {/* Raw results list */}
            {priceResults[selected]?.items?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 900 }}>More Results</div>
                <div className="small" style={{ marginTop: 6 }}>These are the top results returned by the search data API.</div>
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {priceResults[selected].items.slice(0, 8).map((r, idx) => (
                    <button key={`${r.link}_${idx}`} className="btn-soft" onClick={() => safeOpen(r.link)} style={{ textAlign: "left" }}>
                      <div style={{ fontWeight: 900 }}>{r.priceText || "Price"}</div>
                      <div className="small">{r.source || "Source"} • {r.title || "Result"}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
          Rosie finds recipes and gives you trending/viral search buttons (no scraping required).
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
          Rosie PA — <b>V31.6.1 DOWNLOAD</b>
        </div>
        <div className="small" style={{ marginTop: 8 }}>
          Benchmark pricing: {SERP_KEY ? <b>Enabled</b> : <b>Not enabled</b>} (REACT_APP_SERPAPI_KEY)
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
