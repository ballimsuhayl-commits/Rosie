import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore,
  doc,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  setDoc,
} from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

// -----------------------------------------------------------------------------
// Icon helpers
//
// We deliberately avoid external icon libraries (e.g. lucide-react) to keep
// dependencies minimal and builds deterministic. Each icon is rendered as a
// simple glyph wrapped in a span. The style helpers provide consistent sizing
// and alignment.
const _iconStyle = (size = 18) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: size,
  lineHeight: 1,
});
const _Icon = ({ glyph, size = 18, title }) => (
  <span
    aria-hidden={title ? undefined : true}
    aria-label={title}
    title={title}
    style={_iconStyle(size)}
  >
    {glyph}
  </span>
);

const Plus = (p) => <_Icon glyph="＋" title="Add" {...p} />;
const Trash2 = (p) => <_Icon glyph="🗑️" title="Delete" {...p} />;
const Send = (p) => <_Icon glyph="➤" title="Send" {...p} />;
const Calendar = (p) => <_Icon glyph="📅" title="Calendar" {...p} />;
const Mic = (p) => <_Icon glyph="🎤" title="Mic" {...p} />;
const MicOff = (p) => <_Icon glyph="🔇" title="Mic Off" {...p} />;
const RadioIcon = (p) => <_Icon glyph="📻" title="Radio" {...p} />;
const ArrowLeft = (p) => <_Icon glyph="←" title="Back" {...p} />;
const CheckCircle = (p) => <_Icon glyph="✅" title="Done" {...p} />;
const HeartIcon = (p) => <_Icon glyph="❤️" title="Heart" {...p} />;
const SettingsIcon = (p) => <_Icon glyph="⚙️" title="Settings" {...p} />;
const UserIcon = (p) => <_Icon glyph="👤" title="User" {...p} />;
const Utensils = (p) => <_Icon glyph="🍽️" title="Kitchen" {...p} />;
const DollarSign = (p) => <_Icon glyph="💰" title="Finance" {...p} />;
const MessageCircleIcon = (p) => <_Icon glyph="💬" title="Chat" {...p} />;

// -----------------------------------------------------------------------------
// Firebase configuration
//
// Replace these values with your own Firebase project configuration. These
// defaults are from a test project and will not function in production.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo',
  authDomain: 'rosie-pa.firebaseapp.com',
  projectId: 'rosie-pa',
  storageBucket: 'rosie-pa.appspot.com',
  messagingSenderId: '767772651557',
  appId: '1:767772651557:web:239816f833c5af7c20cfcc',
};

// Initialize Firebase app lazily to avoid duplicating apps in hot reloads.
const app = !getApps().length ? initializeApp(FIREBASE_CONFIG) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Initialize Google Generative AI (Gemini) client. Replace the API key with
// your own key. Without a valid key the AI features will not work.
const genAI = new GoogleGenerativeAI('AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo');

// -----------------------------------------------------------------------------
// Staff configuration
//
// Each staff member has an id, name, role, and optional WhatsApp number in
// E.164 format without the leading plus. When sending to-do lists via
// WhatsApp the `whatsapp` field is used to construct the deep link.
const STAFF = {
  nasima: { id: 'nasima', name: 'Nasima', role: 'Family', whatsapp: '' },
  suhayl: { id: 'suhayl', name: 'Suhayl', role: 'Family', whatsapp: '' },
  rayhaan: { id: 'rayhaan', name: 'Rayhaan', role: 'Family', whatsapp: '' },
  zaara: { id: 'zaara', name: 'Zaara', role: 'Family', whatsapp: '' },
  lisa: { id: 'lisa', name: 'Lisa', role: 'Home Maintenance', whatsapp: '27635650731' },
  jabu: { id: 'jabu', name: 'Jabu', role: 'Housekeeping', whatsapp: '27798024735' },
};

// -----------------------------------------------------------------------------
// WhatsApp helpers
//
// Format a message summarizing a person's tasks. The message includes a
// heading, date label, list of tasks, and a polite sign-off.
function buildTodoMessage(employeeName, tasks, dateLabel = 'Today') {
  const lines = [
    `Rosie To-Do — ${employeeName}`,
    `${dateLabel}`,
    '',
  ];
  const openTasks = (tasks || []).filter((t) => !t.completed);
  if (openTasks.length === 0) {
    lines.push('No tasks scheduled.');
  } else {
    openTasks.forEach((t, i) => {
      const loc = t.location ? ` — ${t.location}` : '';
      const due = t.dueAt
        ? ` (Due: ${new Date(t.dueAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })})`
        : '';
      lines.push(`${i + 1}. ${t.title}${loc}${due}`);
    });
  }
  lines.push('');
  lines.push("Please reply ‘Done’ when completed. Thanks.");
  return lines.join('\n');
}

// Open a WhatsApp chat using the wa.me deep link. The number should be in
// E.164 format without the plus sign. If no number is provided, nothing
// happens.
function openWhatsApp(phoneE164NoPlus, message) {
  if (!phoneE164NoPlus) return;
  const url = `https://wa.me/${phoneE164NoPlus}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// -----------------------------------------------------------------------------
// Speech synthesis helpers
//
// These helpers select a female-sounding voice on Android (if available) and
// apply a sweet, gentle tone by adjusting pitch and rate. If voices are
// unavailable or the user disables speech synthesis, these functions
// gracefully fall back without error.
let _voicesCache = [];
function _getVoicesAsync(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve([]);
    const tryLoad = () => {
      const v = synth.getVoices() || [];
      if (v.length) {
        _voicesCache = v;
        resolve(v);
        return true;
      }
      return false;
    };
    if (tryLoad()) return;
    synth.onvoiceschanged = () => {
      if (tryLoad()) synth.onvoiceschanged = null;
    };
    setTimeout(() => resolve(_voicesCache || []), timeoutMs);
  });
}

function _scoreVoice(v) {
  const name = `${v.name} ${v.voiceURI}`.toLowerCase();
  const lang = (v.lang || '').toLowerCase();
  let s = 0;
  if (lang.startsWith('en-za')) s += 80;
  else if (lang.startsWith('en-gb')) s += 60;
  else if (lang.startsWith('en-us')) s += 45;
  else if (lang.startsWith('en-')) s += 30;
  if (name.includes('google')) s += 35;
  const femaleHints = [
    'female',
    'woman',
    'samantha',
    'victoria',
    'karen',
    'tessa',
    'serena',
    'amelie',
    'zoe',
    'zira',
    'aria',
  ];
  femaleHints.forEach((h) => {
    if (name.includes(h)) s += 12;
  });
  const maleHints = ['male', 'man', 'daniel', 'alex', 'fred', 'tom'];
  maleHints.forEach((h) => {
    if (name.includes(h)) s -= 18;
  });
  return s;
}

async function speak(text, { pitch = 1.2, rate = 0.95, volume = 1.0 } = {}) {
  if (!text) return;
  if (!('speechSynthesis' in window)) return;
  const voices = await _getVoicesAsync();
  const chosen = (voices || [])
    .slice()
    .sort((a, b) => _scoreVoice(b) - _scoreVoice(a))[0] || null;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.pitch = pitch;
  u.rate = rate;
  u.volume = volume;
  u.lang = (chosen && chosen.lang) || 'en-ZA';
  if (chosen) u.voice = chosen;
  return new Promise((resolve) => {
    u.onend = resolve;
    u.onerror = resolve;
    window.speechSynthesis.speak(u);
  });
}

// -----------------------------------------------------------------------------
// Rosie logo component
//
// Displays the Rosie SVG from the public folder and animates based on the
// assistant's state. CSS keyframes are injected inline at the end of the
// component tree for portability.
function RosieLogo({ state = 'idle' }) {
  const cls =
    state === 'thinking'
      ? 'rosie-thinking'
      : state === 'speaking'
      ? 'rosie-speaking'
      : state === 'celebrating'
      ? 'rosie-celebrating'
      : 'rosie-idle';
  return (
    <img
      src="/rosie.svg"
      alt="Rosie"
      className={`rosie-mascot ${cls}`}
      style={{ width: 44, height: 44 }}
    />
  );
}

// -----------------------------------------------------------------------------
// Main application component
//
// Handles authentication, Firestore subscriptions, voice input/output, task
// management, and simple navigation. This component encapsulates all
// application logic.
export default function App() {
  // Tab state: determines which page is displayed. Valid values are
  // 'BRAIN' (home/chat), 'FEED' (Rosie FM), 'HUB' (staff tasks), and
  // 'SETUP' (settings/about).
  const [tab, setTab] = useState('BRAIN');
  // Ready flag: indicates when Firebase authentication has completed and
  // Firestore listeners are attached.
  const [ready, setReady] = useState(false);
  // Rosie state: idle, thinking, speaking, or celebrating. Used to animate
  // the Rosie logo.
  const [rosieState, setRosieState] = useState('idle');
  // Tasks: keyed by person id. Each entry is an array of task objects.
  const [tasks, setTasks] = useState({
    jabu: [],
    lisa: [],
    nasima: [],
    suhayl: [],
    rayhaan: [],
    zaara: [],
  });
  // Active person for the HUB view. Null means no person selected.
  const [activePerson, setActivePerson] = useState(null);
  // Input text for chat/voice commands.
  const [input, setInput] = useState('');
  // Microphone state: true when listening, false otherwise.
  const [micOn, setMicOn] = useState(false);
  // Reference to the current speech recognition session.
  const recognitionRef = useRef(null);

  // -------------------------------------------------------------------------
  // Firebase bootstrap
  //
  // On mount, sign in anonymously and attach Firestore listeners. Each staff
  // member's tasks live under `rosie/tasks/people/<personId>`. When a new
  // snapshot arrives we update the local state. We also ensure a base doc
  // exists in Firestore to avoid missing document errors.
  useEffect(() => {
    (async () => {
      try {
        await signInAnonymously(auth);
        const baseRef = doc(db, 'rosie', 'state');
        await setDoc(baseRef, { bootedAt: Date.now() }, { merge: true });
        const unsubscribers = [];
        Object.values(STAFF).forEach((p) => {
          const ref = doc(db, 'rosie', 'tasks', 'people', p.id);
          unsubscribers.push(
            onSnapshot(ref, (snap) => {
              const d = snap.exists() ? snap.data() : {};
              setTasks((prev) => ({
                ...prev,
                [p.id]: Array.isArray(d.items) ? d.items : [],
              }));
            }),
          );
        });
        setReady(true);
        return () => unsubscribers.forEach((fn) => fn());
      } catch (e) {
        console.error(e);
        setReady(true);
      }
    })();
  }, []);

  // -------------------------------------------------------------------------
  // Task management helpers
  //
  // Add a task for a given person. Empty or whitespace-only titles are
  // ignored. Each task receives a unique id and timestamp. After adding, we
  // animate Rosie celebrating briefly.
  const addTask = useCallback(async (personId, title) => {
    if (!title || !title.trim()) return;
    const ref = doc(db, 'rosie', 'tasks', 'people', personId);
    const newTask = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      title: title.trim(),
      completed: false,
      createdAt: Date.now(),
      dueAt: null,
      location: '',
    };
    await setDoc(ref, { items: arrayUnion(newTask) }, { merge: true });
    setRosieState('celebrating');
    setTimeout(() => setRosieState('idle'), 800);
  }, []);

  // Toggle a task's completion state. When toggled, we remove the old task
  // from Firestore and add an updated copy with the completed flag flipped.
  const toggleTask = useCallback(async (personId, task) => {
    const ref = doc(db, 'rosie', 'tasks', 'people', personId);
    const updated = {
      ...task,
      completed: !task.completed,
      completedAt: !task.completed ? Date.now() : null,
    };
    await updateDoc(ref, { items: arrayRemove(task) });
    await updateDoc(ref, { items: arrayUnion(updated) });
  }, []);

  // Delete a task entirely from Firestore.
  const deleteTask = useCallback(async (personId, task) => {
    const ref = doc(db, 'rosie', 'tasks', 'people', personId);
    await updateDoc(ref, { items: arrayRemove(task) });
  }, []);

  // Send the current open tasks for a person via WhatsApp using the
  // preconfigured number in STAFF.
  const sendWhatsAppTodos = useCallback(
    (personId) => {
      const p = STAFF[personId];
      if (!p?.whatsapp) return;
      const msg = buildTodoMessage(p.name, tasks[personId] || [], 'Today');
      openWhatsApp(p.whatsapp, msg);
    },
    [tasks],
  );

  // -------------------------------------------------------------------------
  // Voice input
  //
  // Start listening with speech recognition. We use Web Speech API and set
  // language to English (South Africa). On result we update the input state.
  const startListening = useCallback(() => {
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return;
      const rec = new SpeechRecognition();
      recognitionRef.current = rec;
      rec.lang = 'en-ZA';
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (e) => {
        const text = e.results?.[0]?.[0]?.transcript || '';
        setInput(text);
        setMicOn(false);
      };
      rec.onerror = () => setMicOn(false);
      rec.onend = () => setMicOn(false);
      setMicOn(true);
      rec.start();
    } catch {
      setMicOn(false);
    }
  }, []);

  // Stop listening by cancelling the recognition session.
  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop?.();
    } catch {
      /* ignore */
    }
    setMicOn(false);
  }, []);

  // -------------------------------------------------------------------------
  // Chat/LLM handler
  //
  // Send the current input text to Gemini (via the generative AI client) with
  // instructions to either create tasks or provide a response. The model
  // returns a simple string which we parse for a TASK prefix. If a task is
  // identified, it is added to Firestore; otherwise we speak the response.
  const askRosie = useCallback(async () => {
    if (!input.trim()) return;
    setRosieState('thinking');
    const prompt = `You are Rosie, a warm South African family PA.\nUser said: "${input.trim()}"\n\nIf the user requests a staff task for Jabu or Lisa, respond with:\nTASK::<personId>::<task text>\n\nIf not a task, respond with a short helpful answer.\npersonId must be either "jabu" or "lisa" when relevant.`;
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
      const res = await model.generateContent(prompt);
      const out = res?.response?.text?.() || '';
      const trimmed = out.trim();
      if (trimmed.startsWith('TASK::')) {
        const parts = trimmed.split('::');
        const personId = (parts[1] || '').trim();
        const taskText = parts.slice(2).join('::').trim();
        if (personId && taskText) {
          await addTask(personId, taskText);
          setRosieState('speaking');
          await speak(`Done. I added that to ${STAFF[personId]?.name}'s list.`);
          setRosieState('idle');
        } else {
          setRosieState('speaking');
          await speak("I couldn't understand the task. Please try again.");
          setRosieState('idle');
        }
      } else {
        setRosieState('speaking');
        await speak(trimmed || 'Okay.');
        setRosieState('idle');
      }
    } catch (e) {
      console.error(e);
      setRosieState('speaking');
      await speak('Sorry, something went wrong.');
      setRosieState('idle');
    } finally {
      setInput('');
    }
  }, [input, addTask]);

  // -------------------------------------------------------------------------
  // UI components
  //
  // Home page (BRAIN): displays the Rosie mascot, greeting, input bar, and
  // quick summary cards for Plan, Kitchen, and Finance. Voice recognition
  // controls are provided to start/stop listening.
  const Home = () => (
    <div style={styles.page}>
      <div style={{ textAlign: 'center', paddingTop: 6 }}>
        <img
          src="/rosie.svg"
          alt="Rosie"
          className={`rosie-mascot rosie-${rosieState}`}
          style={{ width: 120, height: 120 }}
        />
        <h1 style={styles.h1}>Hi! I’m Rosie</h1>
        <p style={styles.p}>Ask me anything, family! I’m ready to help.</p>
        <div style={styles.inputRow}>
          <input
            style={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Rosie…"
          />
          <button style={styles.btn} onClick={askRosie} aria-label="Send">
            <Send />
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14 }}>
          {!micOn ? (
            <button style={styles.softBtn} onClick={startListening}>
              <Mic />&nbsp;Talk
            </button>
          ) : (
            <button style={styles.softBtn} onClick={stopListening}>
              <MicOff />&nbsp;Stop
            </button>
          )}
        </div>
      </div>
      <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
        {/* Plan summary card */}
        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar />
              <b>Plan</b>
            </div>
            <span style={styles.small}>Today</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
            Voice-add: “Rosie, add soccer at 4pm.”
          </div>
        </div>
        {/* Kitchen summary card. Clicking this card navigates to the Kitchen page. */}
        <button
          style={{
            ...styles.card,
            cursor: 'pointer',
            textAlign: 'left',
            border: 'none',
          }}
          onClick={() => setTab('KITCHEN')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Utensils />
              <b>Kitchen</b>
            </div>
            <span style={styles.small}>Shopping + Meals</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
            Tap to open Shopping List, Price Search and Recipe Finder.
          </div>
        </button>
        {/* Finance summary card */}
        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <DollarSign />
              <b>Finance</b>
            </div>
            <span style={styles.small}>Summary</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
            Budget hub card stays wired.
          </div>
        </div>
      </div>
    </div>
  );

  // Hub page: lists people and tasks. When a person is selected, display
  // their tasks with options to add, toggle complete, delete, and send via
  // WhatsApp. A back button returns to the list of people.
  const Hub = () => {
    if (activePerson) {
      const person = STAFF[activePerson];
      const list = tasks[activePerson] || [];
      const [newTaskText, setNewTaskText] = useState('');
      const onAdd = async () => {
        await addTask(activePerson, newTaskText);
        setNewTaskText('');
      };
      return (
        <div style={styles.page}>
          <button style={{ ...styles.softBtn, marginBottom: 12 }} onClick={() => setActivePerson(null)}>
            <ArrowLeft />&nbsp;Back
          </button>
          <div style={{ ...styles.card, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/rosie.svg" alt="Rosie" style={{ width: 34, height: 34 }} />
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{person.name}</div>
                <div style={styles.small}>{person.role}</div>
              </div>
            </div>
            {(activePerson === 'jabu' || activePerson === 'lisa') && (
              <div style={{ marginTop: 12 }}>
                <button
                  style={{ ...styles.btn, width: '100%' }}
                  onClick={() => sendWhatsAppTodos(activePerson)}
                >
                  <MessageCircleIcon />&nbsp;Send To-Do via WhatsApp
                </button>
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  style={styles.input}
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  placeholder={`Add a task for ${person.name}…`}
                />
                <button style={styles.btn} onClick={onAdd}>
                  <Plus />
                </button>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            {list.length === 0 && (
              <div style={{ ...styles.card, padding: 14, textAlign: 'center', opacity: 0.8 }}>
                No tasks yet.
              </div>
            )}
            {list.map((t) => (
              <div key={t.id} style={styles.listItem}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    style={{ ...styles.softBtn, padding: '8px 10px' }}
                    onClick={() => toggleTask(activePerson, t)}
                    aria-label="Toggle complete"
                  >
                    {t.completed ? <CheckCircle /> : <HeartIcon />}
                  </button>
                  <div>
                    <div
                      style={{
                        fontWeight: 800,
                        textDecoration: t.completed ? 'line-through' : 'none',
                        opacity: t.completed ? 0.6 : 1,
                      }}
                    >
                      {t.title}
                    </div>
                    <div style={styles.small}>{t.location ? `Location: ${t.location}` : ' '}</div>
                  </div>
                </div>
                <button
                  style={{ ...styles.softBtn, padding: '8px 10px' }}
                  onClick={() => deleteTask(activePerson, t)}
                  aria-label="Delete task"
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    }
    const staffCards = Object.values(STAFF);
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, padding: 16, marginBottom: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserIcon /> Staff & Family
          </div>
          <div style={styles.small}>Tap a person to manage their tasks.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {staffCards.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePerson(p.id)}
              style={{
                border: 'none',
                background: 'white',
                borderRadius: 18,
                boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
                padding: 14,
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src="/rosie.svg" alt="Rosie" style={{ width: 30, height: 30 }} />
                <div>
                  <div style={{ fontWeight: 900 }}>{p.name}</div>
                  <div style={styles.small}>{p.role}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Feed page (Rosie FM): placeholder for audio playback or script generation. In
  // this build the feature is not implemented but the structure remains so
  // future updates can hook into it.
  const Feed = () => (
    <div style={styles.page}>
      <div style={{ ...styles.card, padding: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <RadioIcon /> Rosie FM
        </div>
        <div style={{ marginTop: 8, opacity: 0.8 }}>
          Keep Rosie FM wired here. This revision focuses on build stability.
        </div>
      </div>
    </div>
  );

  // Setup page: displays version information and can host future settings.
  const Setup = () => (
    <div style={styles.page}>
      <div style={{ ...styles.card, padding: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <SettingsIcon /> Setup
        </div>
        <div style={{ marginTop: 8, opacity: 0.8 }}>
          Rosie PA — <b>V31.5 DOWNLOAD</b>
        </div>
      </div>
    </div>
  );

  // Kitchen page: provides access to the Shopping List, Smart Price Search, and
  // Recipe Finder. Each feature is presented as a subview. Shopping List
  // supports basic add/remove functionality stored in local component state.
  const Kitchen = () => {
    const [view, setView] = useState('menu');
    const [shoppingList, setShoppingList] = useState([]);
    const [newItem, setNewItem] = useState('');

    const addItem = () => {
      if (!newItem || !newItem.trim()) return;
      setShoppingList((prev) => [...prev, { id: Date.now(), name: newItem.trim() }]);
      setNewItem('');
    };
    const removeItem = (id) => {
      setShoppingList((prev) => prev.filter((it) => it.id !== id));
    };

    if (view === 'list') {
      return (
        <div style={styles.page}>
          <button style={{ ...styles.softBtn, marginBottom: 12 }} onClick={() => setView('menu')}>
            <ArrowLeft />&nbsp;Back
          </button>
          <div style={{ ...styles.card, padding: 16 }}>
            <div style={{ fontWeight: 900, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Utensils /> Shopping List
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
              <input
                style={styles.input}
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Add item…"
              />
              <button style={styles.btn} onClick={addItem} aria-label="Add item">
                <Plus />
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              {shoppingList.length === 0 && (
                <div style={{ opacity: 0.8 }}>Your shopping list is empty.</div>
              )}
              {shoppingList.map((it) => (
                <div key={it.id} style={styles.listItem}>
                  <div>{it.name}</div>
                  <button
                    style={{ ...styles.softBtn, padding: '6px 8px' }}
                    onClick={() => removeItem(it.id)}
                    aria-label="Remove"
                  >
                    <Trash2 />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    if (view === 'price') {
      return (
        <div style={styles.page}>
          <button style={{ ...styles.softBtn, marginBottom: 12 }} onClick={() => setView('menu')}>
            <ArrowLeft />&nbsp;Back
          </button>
          <div style={{ ...styles.card, padding: 16 }}>
            <div style={{ fontWeight: 900, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              <DollarSign /> Smart Price Search
            </div>
            <div style={{ marginTop: 12, opacity: 0.8 }}>
              Smart Price Search will compare prices across stores and is not implemented yet.
            </div>
          </div>
        </div>
      );
    }
    if (view === 'recipes') {
      return (
        <div style={styles.page}>
          <button style={{ ...styles.softBtn, marginBottom: 12 }} onClick={() => setView('menu')}>
            <ArrowLeft />&nbsp;Back
          </button>
          <div style={{ ...styles.card, padding: 16 }}>
            <div style={{ fontWeight: 900, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Utensils /> Recipe Finder
            </div>
            <div style={{ marginTop: 12, opacity: 0.8 }}>
              Recipe Finder will help you discover meals and is not implemented yet.
            </div>
          </div>
        </div>
      );
    }
    // menu view
    return (
      <div style={styles.page}>
        <button style={{ ...styles.softBtn, marginBottom: 12 }} onClick={() => setTab('BRAIN')}>
          <ArrowLeft />&nbsp;Back
        </button>
        <div style={{ ...styles.card, padding: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Utensils /> Kitchen
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button style={styles.btn} onClick={() => setView('list')}>
              <Utensils />&nbsp;Shopping List
            </button>
            <button style={styles.btn} onClick={() => setView('price')}>
              <DollarSign />&nbsp;Smart Price Search
            </button>
            <button style={styles.btn} onClick={() => setView('recipes')}>
              <Utensils />&nbsp;Recipe Finder
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render the appropriate page based on the current tab. Show a booting
  // message until Firebase is ready.
  const renderTab = () => {
    if (!ready) {
      return (
        <div style={{ ...styles.page, textAlign: 'center', paddingTop: 60 }}>
          <img src="/rosie.svg" alt="Rosie" style={{ width: 120, height: 120 }} />
          <h1 style={styles.h1}>Booting Rosie…</h1>
          <p style={styles.p}>Signing in and syncing your dashboard.</p>
        </div>
      );
    }
    if (tab === 'BRAIN') return <Home />;
    if (tab === 'FEED') return <Feed />;
    if (tab === 'HUB') return <Hub />;
    if (tab === 'KITCHEN') return <Kitchen />;
    return <Setup />;
  };

  return (
    <div style={styles.app} className="safe-bottom">
      <div style={styles.top}>
        <div style={styles.brand}>
          <RosieLogo state={rosieState} />
          <div>
            <p style={styles.title}>Rosie PA</p>
            <p style={styles.sub}>V31.5 DOWNLOAD</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Dummy icons representing connectivity (static for now) */}
          <_Icon glyph="📶" title="Signal" />
          <_Icon glyph="🛜" title="Wi-Fi" />
        </div>
      </div>
      {renderTab()}
      <nav style={styles.bottomNav}>
        <button style={styles.navBtn(tab === 'BRAIN')} onClick={() => setTab('BRAIN')}>
          <MessageCircleIcon />
          <span style={{ fontSize: 12 }}>Brain</span>
        </button>
        <button style={styles.navBtn(tab === 'FEED')} onClick={() => setTab('FEED')}>
          <RadioIcon />
          <span style={{ fontSize: 12 }}>Feed</span>
        </button>
        <button style={styles.navBtn(tab === 'HUB')} onClick={() => setTab('HUB')}>
          <UserIcon />
          <span style={{ fontSize: 12 }}>Hub</span>
        </button>
        <button style={styles.navBtn(tab === 'SETUP')} onClick={() => setTab('SETUP')}>
          <SettingsIcon />
          <span style={{ fontSize: 12 }}>Setup</span>
        </button>
      </nav>
      {/* Inline keyframes for Rosie animations */}
      <style>{`
        .rosie-mascot { transition: transform 0.3s ease; }
        .rosie-thinking { animation: float 2s ease-in-out infinite; }
        .rosie-speaking { animation: pulse 0.8s ease-in-out infinite; }
        .rosie-celebrating { animation: bounce 0.6s ease-in-out 3; }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.04); } 100% { transform: scale(1); } }
        @keyframes bounce { 0% { transform: translateY(0); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Inline styles
//
// We use a single `styles` object to centralize layout and typography. This
// avoids the need for external CSS-in-JS libraries and keeps the component
// self-contained. When editing these values, consider responsiveness and
// readability on small screens.
const styles = {
  app: { minHeight: '100%', paddingBottom: '110px' },
  top: {
    padding: '18px 16px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  title: { fontSize: 16, fontWeight: 900, margin: 0 },
  sub: { fontSize: 12, opacity: 0.7, margin: 0 },
  h1: { fontSize: 28, fontWeight: 900, margin: '14px 0 8px' },
  p: { fontSize: 15, opacity: 0.82, margin: 0 },
  inputRow: { display: 'flex', gap: 10, marginTop: 16 },
  input: {
    flex: 1,
    border: 'none',
    outline: 'none',
    padding: '14px 14px',
    borderRadius: 999,
    boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
    fontSize: 15,
  },
  btn: {
    border: 'none',
    background: '#ff6b4a',
    color: 'white',
    borderRadius: 999,
    padding: '12px 14px',
    boxShadow: '0 6px 18px rgba(0,0,0,0.10)',
    fontWeight: 800,
  },
  softBtn: {
    border: 'none',
    background: 'white',
    color: '#1f2937',
    borderRadius: 999,
    padding: '10px 12px',
    boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
    fontWeight: 800,
  },
  bottomNav: {
    position: 'fixed',
    left: 16,
    right: 16,
    bottom: 'calc(16px + env(safe-area-inset-bottom))',
    background: 'white',
    borderRadius: 24,
    display: 'flex',
    justifyContent: 'space-around',
    padding: 12,
    boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
  },
  navBtn: (active) => ({
    border: 'none',
    background: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    fontWeight: 800,
    color: active ? '#ff6b4a' : '#1f2937',
    opacity: active ? 1 : 0.75,
  }),
  page: { padding: '10px 16px' },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '10px 10px',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.85)',
    boxShadow: '0 4px 10px rgba(0,0,0,0.06)',
    marginBottom: 10,
  },
  small: { fontSize: 12, opacity: 0.7 },
};
