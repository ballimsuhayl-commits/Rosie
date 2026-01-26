import React, { useCallback, useEffect, useMemo, useState } from "react";
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
   Firebase config
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
   Utilities
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

function waLink(e164, text) {
  return `https://wa.me/${e164}?text=${encodeURIComponent(text)}`;
}

/* ---------------------------
   Smart Search (FREE)
---------------------------- */
function buildSmartSearchLinks(item) {
  const q = encodeURIComponent(item);
  return [
    { name: "Best Web Search", url: `https://www.google.com/search?q=${q}+price+South+Africa` },
    { name: "Checkers", url: `https://www.google.com/search?q=${q}+site:checkers.co.za` },
    { name: "Pick n Pay", url: `https://www.google.com/search?q=${q}+site:pnp.co.za` },
    { name: "Woolworths", url: `https://www.google.com/search?q=${q}+site:woolworths.co.za` },
    { name: "SPAR", url: `https://www.google.com/search?q=${q}+site:spar.co.za` },
    { name: "Makro", url: `https://www.google.com/search?q=${q}+site:makro.co.za` }
  ];
}

/* ---------------------------
   Recipes (FREE)
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

  // Kitchen
  const [shopping, setShopping] = useState([]);
  const [kitchenBooted, setKitchenBooted] = useState(false);
  const [smartSelectedItem, setSmartSelectedItem] = useState(null);

  // People (Family + Staff)
  const PEOPLE = useMemo(() => ([
    { id: "nasima", name: "Nasima", role: "Family Admin", type: "adult" },
    { id: "suhayl", name: "Suhayl", role: "Family Admin", type: "adult" },

    { id: "rayhaan", name: "Rayhaan", role: "Child", type: "child" },
    { id: "zaara", name: "Zaara", role: "Child", type: "child" },

    { id: "jabu", name: "Jabu", role: "Housekeeper", type: "staff", whatsapp: "27798024735" },
    { id: "lisa", name: "Lisa", role: "Home Maintenance", type: "staff", whatsapp: "27635650731" }
  ]), []);

  const FAMILY = useMemo(() => PEOPLE.filter(p => p.type !== "staff"), [PEOPLE]);
  const STAFF = useMemo(() => PEOPLE.filter(p => p.type === "staff"), [PEOPLE]);

  const [activePerson, setActivePerson] = useState(null);

  // TASKS: personId -> items[]
  const [tasks, setTasks] = useState({});

  // Diary (LOG)
  const DIARY_BOOKS = useMemo(() => ([
    { id: "personal", name: "Personal Diary" },
    { id: "meds", name: "Meds Diary" },
    { id: "staff", name: "Staff Diary" }
  ]), []);

  const [activeBook, setActiveBook] = useState("personal");
  const [diary, setDiary] = useState({ personal: [], meds: [], staff: [] });

  /* Boot */
  useEffect(() => {
    (async () => {
      try {
        await signInAnonymously(auth);

        await setDoc(doc(db, "rosie", "state"), { bootedAt: Date.now(), v: "31.8.0" }, { merge: true });
        await setDoc(doc(db, "rosie", "kitchen"), { shopping: [] }, { merge: true });

        // Standard task lists for adults + staff
        for (const p of PEOPLE) {
          await setDoc(doc(db, "rosie", "tasks", "people", p.id), { items: [] }, { merge: true });
        }

        // Kids must have two lists ONLY: school + extramurals
        await setDoc(doc(db, "rosie", "tasks", "people", "rayhaan_school"), { items: [] }, { merge: true });
        await setDoc(doc(db, "rosie", "tasks", "people", "rayhaan_extra"), { items: [] }, { merge: true });
        await setDoc(doc(db, "rosie", "tasks", "people", "zaara_school"), { items: [] }, { merge: true });
        await setDoc(doc(db, "rosie", "tasks", "people", "zaara_extra"), { items: [] }, { merge: true });

        // Diaries
        for (const b of DIARY_BOOKS) {
          await setDoc(doc(db, "rosie", "diary", b.id), { entries: [] }, { merge: true });
        }

        setReady(true);
      } catch (e) {
        console.error(e);
        setReady(true);
      }
    })();
  }, [PEOPLE, DIARY_BOOKS]);

  /* Listeners */
  useEffect(() => {
    if (!ready) return;

    const unsubKitchen = onSnapshot(doc(db, "rosie", "kitchen"), (snap) => {
      const d = snap.exists() ? snap.data() : {};
      setShopping(Array.isArray(d.shopping) ? d.shopping : []);
      setKitchenBooted(true);
    });

    const unsubs = [];

    // Normal tasks
    for (const p of PEOPLE) {
      unsubs.push(
        onSnapshot(doc(db, "rosie", "tasks", "people", p.id), (snap) => {
          const d = snap.exists() ? snap.data() : {};
          setTasks((prev) => ({
            ...prev,
            [p.id]: Array.isArray(d.items) ? d.items : []
          }));
        })
      );
    }

    // Kids tasks: 2 categories only
    const kidDocs = ["rayhaan_school", "rayhaan_extra", "zaara_school", "zaara_extra"];
    for (const id of kidDocs) {
      unsubs.push(
        onSnapshot(doc(db, "rosie", "tasks", "people", id), (snap) => {
          const d = snap.exists() ? snap.data() : {};
          setTasks((prev) => ({
            ...prev,
            [id]: Array.isArray(d.items) ? d.items : []
          }));
        })
      );
    }

    // Diaries
    const diaryUnsubs = DIARY_BOOKS.map((b) =>
      onSnapshot(doc(db, "rosie", "diary", b.id), (snap) => {
        const d = snap.exists() ? snap.data() : {};
        const entries = Array.isArray(d.entries) ? d.entries : [];
        setDiary((prev) => ({
          ...prev,
          [b.id]: entries
        }));
      })
    );

    return () => {
      unsubKitchen();
      unsubs.forEach((u) => u && u());
      diaryUnsubs.forEach((u) => u && u());
    };
  }, [ready, PEOPLE, DIARY_BOOKS]);

  /* Task helpers */
  const addTask = useCallback(async (personId, title) => {
    if (!title || !title.trim()) return;
    const ref = doc(db, "rosie", "tasks", "people", personId);
    const t = { id: nowId(), title: title.trim(), completed: false, createdAt: Date.now() };
    await setDoc(ref, { items: arrayUnion(t) }, { merge: true });
  }, []);

  const toggleTask = useCallback(async (personId, task) => {
    const ref = doc(db, "rosie", "tasks", "people", personId);
    const updated = { ...task, completed: !task.completed, completedAt: !task.completed ? Date.now() : null };
    await updateDoc(ref, { items: arrayRemove(task) });
    await updateDoc(ref, { items: arrayUnion(updated) });
  }, []);

  const deleteTask = useCallback(async (personId, task) => {
    const ref = doc(db, "rosie", "tasks", "people", personId);
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
    safeOpen(waLink(staff.whatsapp, lines.join("\n")));
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

  /* Diary helpers */
  const addDiaryEntry = useCallback(async (bookId, text) => {
    if (!text || !text.trim()) return;
    const ref = doc(db, "rosie", "diary", bookId);
    const entry = {
      id: nowId(),
      text: text.trim(),
      createdAt: Date.now()
    };
    await setDoc(ref, { entries: arrayUnion(entry) }, { merge: true });
  }, []);

  const deleteDiaryEntry = useCallback(async (bookId, entry) => {
    const ref = doc(db, "rosie", "diary", bookId);
    await updateDoc(ref, { entries: arrayRemove(entry) });
  }, []);

  /* ---------------------------
     UI Components
  ---------------------------- */
  const TopBar = () => (
    <div style={{ padding: "16px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/rosie.svg" alt="Rosie" style={{ width: 44, height: 44 }} />
        <div>
          <div style={{ fontWeight: 1000, fontSize: 16 }}>Rosie PA</div>
          <div className="small">V31.8.0 — Kids School/Extra + Diary</div>
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
      <div className="center" style={{ paddingTop: 4 }}>
        <img src="/rosie.svg" alt="Rosie" className="rosie-mascot" />
        <div className="hi">Hi! I’m Rosie</div>
        <div className="sub">Family tasks, kids school/extramurals, staff tasks, diary, shopping & smart search.</div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <button className="card" onClick={() => setTab("HUB")} style={{ border: "none", textAlign: "left", cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon glyph="👨‍👩‍👧‍👦" label="Family" /><b style={{ fontWeight: 1000 }}>Hub</b>
            </div>
            <span className="small">Kids + staff</span>
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            Kids tasks are now split into School & Extramurals only.
          </div>
        </button>

        <button className="card" onClick={() => setTab("LOG")} style={{ border: "none", textAlign: "left", cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon glyph="📖" label="Log" /><b style={{ fontWeight: 1000 }}>Diary</b>
            </div>
            <span className="small">Personal / Meds / Staff</span>
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            Journal style diary books restored.
          </div>
        </button>

        <button className="card" onClick={() => setTab("KITCHEN")} style={{ border: "none", textAlign: "left", cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon glyph="🍽️" label="Kitchen" /><b style={{ fontWeight: 1000 }}>Kitchen</b>
            </div>
            <span className="small">Shopping + smart search</span>
          </div>
        </button>
      </div>
    </div>
  );

  const Hub = () => {
    if (!activePerson) {
      return (
        <div className="page">
          <div className="card">
            <div style={{ fontWeight: 1000, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon glyph="👨‍👩‍👧‍👦" label="Hub" /> Hub
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              Kids show TWO tabs only: School & Extramurals.
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title">Family</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {FAMILY.map(p => (
                <button
                  key={p.id}
                  className="btn-soft"
                  style={{ textAlign: "left", padding: 14 }}
                  onClick={() => setActivePerson(p)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <img src="/rosie.svg" alt="Rosie" style={{ width: 28, height: 28 }} />
                    <div>
                      <div style={{ fontWeight: 1000 }}>{p.name}</div>
                      <div className="small">{p.role}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title">Staff</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {STAFF.map(s => (
                <button
                  key={s.id}
                  className="btn-soft"
                  style={{ textAlign: "left", padding: 14 }}
                  onClick={() => setActivePerson(s)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <img src="/rosie.svg" alt="Rosie" style={{ width: 28, height: 28 }} />
                    <div>
                      <div style={{ fontWeight: 1000 }}>{s.name}</div>
                      <div className="small">{s.role}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return <PersonDetail person={activePerson} onBack={() => setActivePerson(null)} />;
  };

  /* ✅ CHILD LOGIC ADDED HERE */
  const PersonDetail = ({ person, onBack }) => {
    const isChild = person.type === "child";
    const canWhatsApp = person.type === "staff" && person.whatsapp;

    const [kidTab, setKidTab] = useState("school"); // school | extra
    const taskDocId = isChild
      ? `${person.id}_${kidTab === "school" ? "school" : "extra"}`
      : person.id;

    const list = tasks[taskDocId] || [];
    const open = list.filter(t => !t.completed);
    const done = list.filter(t => t.completed);

    const [newTask, setNewTask] = useState("");

    return (
      <div className="page">
        <button className="btn-soft" onClick={onBack}>
          <Icon glyph="←" label="Back" /> Back
        </button>

        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 1000, fontSize: 18 }}>{person.name}</div>
              <div className="small">{person.role}</div>
            </div>

            {canWhatsApp && (
              <button className="btn" onClick={() => sendTasksToWhatsApp(person)}>
                <Icon glyph="💬" label="WhatsApp" /> Send WhatsApp
              </button>
            )}
          </div>

          {isChild && (
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className={kidTab === "school" ? "btn" : "btn-soft"}
                onClick={() => setKidTab("school")}
              >
                <Icon glyph="🎒" label="School" /> SCHOOL
              </button>
              <button
                className={kidTab === "extra" ? "btn" : "btn-soft"}
                onClick={() => setKidTab("extra")}
              >
                <Icon glyph="⚽" label="Extramurals" /> EXTRAMURALS
              </button>
            </div>
          )}

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <input
              className="input"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder={isChild ? `Add ${kidTab === "school" ? "school" : "extramural"} task...` : `Add task...`}
            />
            <button
              className="btn"
              onClick={async () => {
                await addTask(taskDocId, newTask);
                setNewTask("");
              }}
            >
              <Icon glyph="＋" label="Add" />
            </button>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div className="small"><b style={{ fontWeight: 1000 }}>Open:</b> {open.length}</div>
            <div className="small"><b style={{ fontWeight: 1000 }}>Done:</b> {done.length}</div>
            {isChild && <span className="badge">{kidTab === "school" ? "SCHOOL" : "EXTRAMURALS"}</span>}
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {open.map(t => (
            <div key={t.id} className="list-item">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="btn-soft" onClick={() => toggleTask(taskDocId, t)}>
                  <Icon glyph="❤️" label="Open" />
                </button>
                <div style={{ fontWeight: 1000 }}>{t.title}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-soft" onClick={() => deleteTask(taskDocId, t)}>
                  <Icon glyph="🗑️" label="Delete" />
                </button>
                <button className="btn-soft" onClick={() => toggleTask(taskDocId, t)}>
                  <Icon glyph="✅" label="Done" />
                </button>
              </div>
            </div>
          ))}

          {done.length > 0 && (
            <div className="card">
              <div className="card-title">Completed</div>
              <div style={{ display: "grid", gap: 10 }}>
                {done.map(t => (
                  <div key={t.id} className="list-item" style={{ opacity: 0.75 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button className="btn-soft" onClick={() => toggleTask(taskDocId, t)}>
                        <Icon glyph="✅" label="Done" />
                      </button>
                      <div style={{ fontWeight: 1000, textDecoration: "line-through" }}>{t.title}</div>
                    </div>
                    <button className="btn-soft" onClick={() => deleteTask(taskDocId, t)}>
                      <Icon glyph="🗑️" label="Delete" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {list.length === 0 && (
            <div className="card">
              <div className="small">No tasks yet.</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const Kitchen = () => {
    const [view, setView] = useState("shopping");

    return (
      <div className="page">
        <div className="card">
          <div style={{ fontWeight: 1000, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon glyph="🍽️" label="Kitchen" /> Kitchen
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            Shopping list + Smart Search (free) + Recipe Finder.
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <button className="btn" onClick={() => setView("shopping")}>
              <Icon glyph="🛒" label="Shopping" /> Shopping List
            </button>
            <button className="btn" onClick={() => setView("smartsearch")}>
              <Icon glyph="🔎" label="Smart Search" /> Smart Search
            </button>
            <button className="btn" onClick={() => setView("recipes")}>
              <Icon glyph="🍰" label="Recipes" /> Recipe Finder
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {view === "shopping" && <ShoppingList />}
          {view === "smartsearch" && <SmartSearch />}
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
        <div style={{ fontWeight: 1000, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon glyph="🛒" label="Shopping" /> Shopping List
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add item (e.g. milk)" />
          <input className="input" style={{ maxWidth: 110 }} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" />
          <button className="btn" onClick={async () => { await addShoppingItem(name, qty); setName(""); setQty("1"); }}>
            <Icon glyph="＋" label="Add" />
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {shopping.length === 0 && <div className="small">No grocery items yet.</div>}
          {shopping.map(it => (
            <div key={it.id} className="list-item">
              <div style={{ fontWeight: 1000 }}>
                {it.name} <span className="small">x{it.qty}</span>
              </div>
              <button className="btn-soft" onClick={() => removeShoppingItem(it)}>
                <Icon glyph="🗑️" label="Remove" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const SmartSearch = () => {
    return (
      <div className="card">
        <div style={{ fontWeight: 1000, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon glyph="🔎" label="Smart Search" /> Smart Search (Free)
        </div>

        <div className="small" style={{ marginTop: 8 }}>
          Rosie generates the best store search links for each item. No paid service.
        </div>

        <div style={{ marginTop: 12 }}>
          {shopping.length === 0 && <div className="small">Add groceries first, then return here.</div>}

          {shopping.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              {shopping.map(it => (
                <button
                  key={it.id}
                  className="list-item"
                  style={{ border: "none", cursor: "pointer", textAlign: "left" }}
                  onClick={() => setSmartSelectedItem(it.name)}
                >
                  <div>
                    {it.name} <span className="small">x{it.qty}</span>
                  </div>
                  <Icon glyph="→" label="Open" />
                </button>
              ))}
            </div>
          )}
        </div>

        {smartSelectedItem && (
          <div style={{ marginTop: 12 }} className="card">
            <div style={{ fontWeight: 1000, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon glyph="🧠" label="Selected" /> {smartSelectedItem}
            </div>

            <div className="small" style={{ marginTop: 8 }}>
              Tap a store to search.
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {buildSmartSearchLinks(smartSelectedItem).map((l) => (
                <button
                  key={l.name}
                  className="btn-soft"
                  onClick={() => safeOpen(l.url)}
                  style={{ textAlign: "left" }}
                >
                  <div style={{ fontWeight: 1000 }}>{l.name}</div>
                  <div className="small" style={{ marginTop: 4, wordBreak: "break-word" }}>{l.url}</div>
                </button>
              ))}
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn-soft" onClick={() => setSmartSelectedItem(null)}>
                <Icon glyph="🧼" label="Close" /> Close
              </button>
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
      const t = (topic || "recipe").trim();
      safeOpen(`https://www.google.com/search?q=${encodeURIComponent(`best ${t} recipe`)}`);
      safeOpen(`https://www.youtube.com/results?search_query=${encodeURIComponent(`viral ${t} recipe`)}`);
      safeOpen(`https://www.tiktok.com/search?q=${encodeURIComponent(`viral ${t} recipe`)}`);
    };

    return (
      <div className="card">
        <div style={{ fontWeight: 1000, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon glyph="🍰" label="Recipes" /> Recipe Finder
        </div>

        <div className="small" style={{ marginTop: 8 }}>
          Search recipes + open trending/viral searches (free).
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. brownies / kids pasta / chicken curry" />
          <button className="btn" onClick={search}><Icon glyph="🔎" label="Search" /></button>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-soft" onClick={() => openTrending(q || "dessert")}>
            <Icon glyph="🔥" label="Trending" /> Trending/Viral
          </button>
          <button className="btn-soft" onClick={() => openTrending("kids meals")}>
            <Icon glyph="🧒" label="Kids" /> Kids Meals
          </button>
          <button className="btn-soft" onClick={() => openTrending("desserts")}>
            <Icon glyph="🍫" label="Dessert" /> Desserts
          </button>
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
                  <div style={{ fontWeight: 1000, fontSize: 16 }}>{m.strMeal}</div>
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
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ✅ DIARY REINSTATED */
  const Log = () => {
    const [text, setText] = useState("");

    const entries = diary[activeBook] || [];
    const sorted = [...entries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const exportText = () => {
      const lines = [
        `ROSIE DIARY EXPORT`,
        `Book: ${activeBook.toUpperCase()}`,
        `---`,
        ...sorted.map(e => {
          const d = new Date(e.createdAt);
          return `[${d.toLocaleString()}] ${e.text}`;
        })
      ];
      const blob = new Blob([lines.join("\n\n")], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      safeOpen(url);
    };

    return (
      <div className="page">
        <div className="card">
          <div style={{ fontWeight: 1000, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon glyph="📖" label="Diary" /> Diary / Logs
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            Journal books restored: Personal, Meds, Staff.
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {DIARY_BOOKS.map(b => (
              <button
                key={b.id}
                className={activeBook === b.id ? "btn" : "btn-soft"}
                onClick={() => setActiveBook(b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <textarea
              className="input"
              style={{ minHeight: 110, resize: "vertical", fontWeight: 950 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Write in ${activeBook}...`}
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="btn"
                onClick={async () => {
                  await addDiaryEntry(activeBook, text);
                  setText("");
                }}
              >
                <Icon glyph="✍️" label="Save" /> Save Entry
              </button>
              <button className="btn-soft" onClick={exportText}>
                <Icon glyph="📤" label="Export" /> Export Text
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {sorted.length === 0 && (
            <div className="card">
              <div className="small">No diary entries yet.</div>
            </div>
          )}

          {sorted.map(e => (
            <div key={e.id} className="card">
              <div className="small" style={{ fontWeight: 1000 }}>
                {new Date(e.createdAt).toLocaleString()}
              </div>
              <div style={{ marginTop: 8, fontWeight: 950, whiteSpace: "pre-wrap" }}>
                {e.text}
              </div>
              <div style={{ marginTop: 12 }}>
                <button className="btn-soft" onClick={() => deleteDiaryEntry(activeBook, e)}>
                  <Icon glyph="🗑️" label="Delete" /> Delete
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
        <div style={{ fontWeight: 1000, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon glyph="⚙️" label="Setup" /> Setup
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          Rosie PA Version: <b style={{ fontWeight: 1000 }}>31.8.0</b>
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          Kids tasks are now strictly: <b>SCHOOL</b> + <b>EXTRAMURALS</b>.
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          Diary is restored under LOG tab.
        </div>
      </div>
    </div>
  );

  const render = () => {
    if (!ready) {
      return (
        <div className="page" style={{ textAlign: "center", paddingTop: 60 }}>
          <img src="/rosie.svg" alt="Rosie" style={{ width: 120, height: 120 }} />
          <div style={{ fontWeight: 1000, fontSize: 28, marginTop: 10 }}>Booting Rosie…</div>
          <div className="small" style={{ marginTop: 8 }}>Signing in & syncing Firestore.</div>
        </div>
      );
    }

    if (tab === "BRAIN") return <Brain />;
    if (tab === "KITCHEN") return <Kitchen />;
    if (tab === "HUB") return <Hub />;
    if (tab === "LOG") return <Log />;
    return <Setup />;
  };

  return (
    <div className="app-root">
      <TopBar />
      {render()}

      <div className="bottom-nav-wrap">
        <div className="bottom-nav">
          <button className={`nav-btn ${tab === "BRAIN" ? "active" : ""}`} onClick={() => { setTab("BRAIN"); setActivePerson(null); }}>
            <Icon glyph="🧠" label="Brain" />
            <span className="nav-label">Brain</span>
          </button>

          <button className={`nav-btn ${tab === "HUB" ? "active" : ""}`} onClick={() => setTab("HUB")}>
            <Icon glyph="👨‍👩‍👧‍👦" label="Hub" />
            <span className="nav-label">Hub</span>
          </button>

          <button className={`nav-btn ${tab === "KITCHEN" ? "active" : ""}`} onClick={() => { setTab("KITCHEN"); setActivePerson(null); }}>
            <Icon glyph="🍽️" label="Kitchen" />
            <span className="nav-label">Kitchen</span>
          </button>

          <button className={`nav-btn ${tab === "LOG" ? "active" : ""}`} onClick={() => { setTab("LOG"); setActivePerson(null); }}>
            <Icon glyph="📖" label="Log" />
            <span className="nav-label">Log</span>
          </button>

          <button className={`nav-btn ${tab === "SETUP" ? "active" : ""}`} onClick={() => { setTab("SETUP"); setActivePerson(null); }}>
            <Icon glyph="⚙️" label="Setup" />
            <span className="nav-label">Setup</span>
          </button>
        </div>
      </div>
    </div>
  );
}
