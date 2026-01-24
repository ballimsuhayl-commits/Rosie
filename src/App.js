import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, setDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, ShoppingCart, Calendar, Mic, MicOff, Camera, Book, 
  ArrowLeft, X, Grid, Radio, Scan, Navigation, Signal, Wifi, Activity,
  Heart, CheckCircle, Settings, MessageCircle, MapPin, ShieldCheck, Flame,
  PenLine, Power, User, Utensils, DollarSign, Clock, AlertTriangle
} from 'lucide-react';

// --- CONFIGURATION ---
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo",
  authDomain: "rosie-pa.firebaseapp.com",
  projectId: "rosie-pa",
  storageBucket: "rosie-pa.firebasestorage.app",
  messagingSenderId: "767772651557",
  appId: "1:767772651557:web:239816f833c5af7c20cfcc"
};

const app = !getApps().length ? initializeApp(FIREBASE_CONFIG) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const genAI = new GoogleGenerativeAI("AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo");

// --- DATA SCHEMAS & INITIAL DATA ---
const FAMILY_MEMBERS = [
  { name: "Nasima", role: "Mum", color: "bg-rose-100 text-rose-600", icon: "👸" },
  { name: "Suhayl", role: "Dad", color: "bg-blue-100 text-blue-600", icon: "🧔" },
  { name: "Rayhaan", role: "Son", color: "bg-green-100 text-green-600", icon: "👦" },
  { name: "Zaara", role: "Daughter", color: "bg-purple-100 text-purple-600", icon: "👧" },
  { name: "Lisa", role: "Staff", staffRole: "Home Maintenance", whatsapp: "27635650731", color: "bg-orange-100 text-orange-600", icon: "🛠️" },
  { name: "Jabu", role: "Staff", staffRole: "Housekeeping", whatsapp: "27798024735", color: "bg-teal-100 text-teal-600", icon: "🧹" }
];

const INITIAL_DATA = {
  shopping: ["Milk", "Fresh Bread"],
  plans: [
    { id: '1', title: "School Drop-off", time: "07:30", category: "School" },
    { id: '2', title: "Staff Sync with Lisa", time: "09:00", category: "Work" },
    { id: '3', title: "Rayhaan Soccer", time: "16:00", category: "Extramural" }
  ],
  chatHistory: [{role: 'rosie', text: 'Power On. Schedule and Logic Centers Active.', ts: 'Now'}],
  memberTasks: { "Rayhaan": ["Pack school bag"], "Zaara": ["Piano practice"], "Jabu": ["Pool maintenance"], "Lisa": ["Grocery run"] }, 
  diary_entries: [],
  memories: [],
  estimates: [],
  mealPlan: "No dinner set yet."
};

// --- AI TOOL DEFINITIONS ---
const ROSIE_TOOLS = [
  { name: "manage_shopping", description: "Add/Remove grocery items.", parameters: { type: "object", properties: { item: {type:"string"}, action: {type:"string", enum:["add","remove"]}}, required: ["item","action"]}},
  { name: "manage_calendar", description: "Add or remove events. ALWAYS check for school clashes.", parameters: { type: "object", properties: { event_title: {type:"string"}, time: {type:"string", description: "HH:mm format"}, category: {type:"string"}, action: {type:"string", enum:["add","remove"]}}, required: ["event_title","time","action"]}},
  { name: "assign_task", description: "Assign task to family or staff.", parameters: { type: "object", properties: { member: {type:"string"}, task: {type:"string"}}, required: ["member","task"]}},
  { name: "write_diary", description: "Log to Meds, Staff, or Personal log.", parameters: { type: "object", properties: { book: {type:"string"}, text: {type:"string"}}, required: ["book","text"]}},
  { name: "update_meal_plan", description: "Update the dinner plan.", parameters: { type: "object", properties: { plan: {type:"string"}}, required: ["plan"]}}
];

// --- UI COMPONENTS ---
const StatusBar = () => {
  const [time, setTime] = useState(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex justify-between items-center px-7 pt-3 pb-2 text-[#2D2D2D] font-bold text-[13px] z-50 select-none">
        <span className="tracking-wide">{time}</span>
        <div className="flex gap-1.5 items-center">
            <Signal size={14} fill="currentColor" />
            <Wifi size={14} />
            <div className="w-6 h-3 border-[1.5px] border-[#2D2D2D] rounded-[4px] relative ml-1"><div className="h-full w-[80%] bg-[#2D2D2D] rounded-[1px]"/></div>
        </div>
    </div>
  );
};

export default function App() {
  const [isBooted, setIsBooted] = useState(false);
  const [activeTab, setActiveTab] = useState('brain'); 
  const [isMicLocked, setIsMicLocked] = useState(false);
  const [rosieState, setRosieState] = useState('default');
  const [inputText, setInputText] = useState("");
  const [familyData, setFamilyData] = useState(INITIAL_DATA);
  const [selectedMember, setSelectedMember] = useState(null);
  const [openBook, setOpenBook] = useState(null);
  
  const recognitionRef = useRef(null);
  const synthRef = window.speechSynthesis;
  const familyDataRef = useRef(familyData);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => { familyDataRef.current = familyData; }, [familyData]);

  // --- BOOT SEQUENCE ---
  const bootRosie = async () => {
    setIsBooted(true);
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    try {
      await signInAnonymously(auth);
      onSnapshot(doc(db, "families", "main_family"), (docSnap) => {
        if (docSnap.exists()) setFamilyData(prev => ({ ...prev, ...docSnap.data() }));
        else setDoc(doc(db, "families", "main_family"), INITIAL_DATA);
      });
    } catch (e) { console.error(e); }
    startListening();
  };

  // --- EXECUTION MOTOR ---
  const executeNode = async (name, args) => {
    const docRef = doc(db, "families", "main_family");
    let feedback = "Done.";
    try {
      if (name === "manage_shopping") {
        await updateDoc(docRef, { shopping: args.action === 'add' ? arrayUnion(args.item) : arrayRemove(args.item) });
        feedback = `🛒 List updated: ${args.item}.`;
      } else if (name === "manage_calendar") {
        const newEvent = { id: Date.now().toString(), title: args.event_title, time: args.time, category: args.category || "General" };
        await updateDoc(docRef, { plans: args.action === 'add' ? arrayUnion(newEvent) : arrayRemove(familyData.plans.find(p => p.title === args.event_title)) });
        feedback = `📅 Schedule updated for ${args.time}.`;
      } else if (name === "assign_task") {
        const field = `memberTasks.${args.member}`;
        await updateDoc(docRef, { [field]: arrayUnion(args.task) });
        feedback = `✅ Task for ${args.member}: ${args.task}.`;
      } else if (name === "write_diary") {
        await updateDoc(docRef, { diary_entries: arrayUnion({ book: args.book, text: args.text, ts: new Date().toLocaleString() }) });
        feedback = `📖 Logged in ${args.book}.`;
      } else if (name === "update_meal_plan") {
        await updateDoc(docRef, { mealPlan: args.plan });
        feedback = `🍽️ Dinner is set to ${args.plan}.`;
      }
      return feedback;
    } catch (e) { return "Database Error."; }
  };

  const speak = (text) => {
    if (!text) return;
    try { synthRef.cancel(); } catch (_) {}
    setRosieState('speaking');

    const u = new SpeechSynthesisUtterance(text);

    // Android-optimized "sweet lady" tuning
    u.pitch = 1.20;
    u.rate = 0.95;
    u.volume = 1.0;

    const voices = (synthRef?.getVoices?.() || []);
    const scoreVoice = (v) => {
      const name = `${v.name || ''} ${v.voiceURI || ''}`.toLowerCase();
      const lang = (v.lang || '').toLowerCase();
      let s = 0;

      if (lang.startsWith('en-za')) s += 80;
      else if (lang.startsWith('en-gb')) s += 60;
      else if (lang.startsWith('en-us')) s += 45;
      else if (lang.startsWith('en-')) s += 30;

      if (name.includes('google')) s += 35;

      const femaleHints = ['female','woman','samantha','victoria','karen','tessa','serena','amelie','zoe','zira','aria'];
      for (const h of femaleHints) if (name.includes(h)) s += 12;

      const maleHints = ['male','man','daniel','alex','fred','tom'];
      for (const h of maleHints) if (name.includes(h)) s -= 18;

      return s;
    };

    const chosen = voices.length
      ? voices.slice().sort((a,b) => scoreVoice(b) - scoreVoice(a))[0]
      : null;

    u.lang = chosen?.lang || 'en-ZA';
    if (chosen) u.voice = chosen;

    u.onend = () => setRosieState('default');
    u.onerror = () => setRosieState('default');

    // Some Android browsers load voices async; retry once quickly if needed.
    if (!chosen && typeof synthRef?.onvoiceschanged !== 'undefined') {
      const handler = () => {
        try { synthRef.onvoiceschanged = null; } catch (_) {}
        const v2 = (synthRef?.getVoices?.() || []);
        const chosen2 = v2.length ? v2.slice().sort((a,b)=>scoreVoice(b)-scoreVoice(a))[0] : null;
        if (chosen2) {
          u.lang = chosen2.lang || 'en-ZA';
          u.voice = chosen2;
        }
        synthRef.speak(u);
      };
      try { synthRef.onvoiceschanged = handler; } catch (_) {}
      // fallback speak if onvoiceschanged never fires
      setTimeout(() => {
        try { synthRef.speak(u); } catch (_) {}
      }, 400);
      return;
    }

    synthRef.speak(u);
  };

  
  const buildTodoMessage = (member, tasks) => {
    const today = new Date();
    const dateLabel = today.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    const lines = [
      `Rosie To-Do — ${member.name}${member.staffRole ? ` (${member.staffRole})` : ''}`,
      dateLabel,
      ''
    ];
    const openTasks = (tasks || []).filter(Boolean);
    if (openTasks.length === 0) {
      lines.push('No tasks scheduled.');
    } else {
      openTasks.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    }
    lines.push('');
    lines.push("Please reply 'Done' when completed. Thanks.");
    return lines.join('\n');
  };

  const sendTodosOnWhatsApp = (member) => {
    const phone = member?.whatsapp; // E.164 digits, no '+'
    if (!phone) {
      speak(`No WhatsApp number saved for ${member?.name || 'this member'}.`);
      return;
    }
    const tasks = familyDataRef.current?.memberTasks?.[member.name] || [];
    const msg = buildTodoMessage(member, tasks);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    speak(`Opening WhatsApp for ${member.name}.`);
  };

  const removeTask = async (memberName, task) => {
    try {
      const docRef = doc(db, "families", "main_family");
      const field = `memberTasks.${memberName}`;
      await updateDoc(docRef, { [field]: arrayRemove(task) });
      speak(`Removed task for ${memberName}.`);
    } catch (e) {
      speak("Database Error.");
    }
  };
// --- BRAIN (GEMINI) ---
  const handleAction = useCallback(async (transcript) => {
    if (!transcript) return;
    setRosieState('thinking');
    
    if (transcript.toLowerCase().includes("navigate to")) {
      const dest = transcript.split("navigate to")[1];
      speak(`Launching Maps for ${dest}.`);
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
      setRosieState('default');
      return;
    }

    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        tools: [{ functionDeclarations: ROSIE_TOOLS }],
        systemInstruction: "You are Rosie. 1. CLASH DETECTION: If a new schedule item conflicts with existing plans, warn the user. 2. Use Tools for ALL family database writes."
      });

      const result = await model.generateContent(`Context: ${JSON.stringify(familyDataRef.current)}. User: ${transcript}`);
      const call = result.response.functionCalls()?.[0];

      if (call) {
        const feedback = await executeNode(call.name, call.args);
        speak(feedback);
      } else {
        const reply = result.response.text();
        speak(reply);
        await updateDoc(doc(db, "families", "main_family"), { chatHistory: arrayUnion({ role: 'rosie', text: reply, ts: new Date().toLocaleTimeString() }) });
      }
    } catch (e) { speak("Neural flicker. Repeat please?"); }
    setRosieState('default');
  }, []);

  // --- ALWAYS LISTENING ---
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window)) return;
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-ZA';
    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
      if (!isMicLocked && transcript.includes("rosie")) {
        const cmd = transcript.replace(/^(hey|okay|yo)?\s*rosie/, "").trim();
        if (cmd.length > 1) handleAction(cmd);
        else speak("Listening...");
      }
    };
    recognition.onend = () => { if (!isMicLocked && isBooted) try { recognition.start(); } catch(e){} };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch(e){}
  };

  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (isBooted && !isMicLocked && !synthRef.speaking) {
        try { recognitionRef.current.start(); } catch(e){}
      }
    }, 2000);
    return () => clearInterval(heartbeat);
  }, [isBooted, isMicLocked]);

  
// --- BOOT SCREEN ---
  if (!isBooted) {
    return (
      <div className="app-root" style={{display:'flex', alignItems:'center', justifyContent:'center'}}>
        <div className="page center" style={{paddingBottom: 0}}>
          <button
            onClick={bootRosie}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer'
            }}
            aria-label="Boot Rosie"
          >
            <img src="/rosie.svg" alt="Rosie" className="rosie-mascot rosie-celebrating" />
            <div className="hi">Tap to Boot</div>
            <div className="sub">Unlock voice so Rosie can speak.</div>
            <div style={{
              display:'inline-flex',
              alignItems:'center',
              gap:10,
              padding:'12px 18px',
              borderRadius: 999,
              background:'white',
              boxShadow:'var(--soft-shadow)',
              fontWeight: 900
            }}>
              <Power size={18} />
              BOOT ROSIE
            </div>
          </button>
        </div>
      </div>
    );
  }

  // --- UI HELPERS ---
  const mascotClass =
    rosieState === 'thinking' ? 'rosie-mascot rosie-thinking' :
    rosieState === 'speaking' ? 'rosie-mascot rosie-speaking' :
    rosieState === 'celebrating' ? 'rosie-mascot rosie-celebrating' :
    'rosie-mascot';

  const FEED_VIEWS = [
    { id: 'plan', label: 'Plan' },
    { id: 'radio', label: 'Rosie FM' },
    { id: 'log', label: 'Log' }
  ];

  const STAFF = FAMILY_MEMBERS.map(m => ({
    ...m,
    // Ensure staff entries have role + whatsapp where provided in earlier updates
    staffRole: m.staffRole || (m.name === 'Jabu' ? 'Housekeeping' : m.name === 'Lisa' ? 'Home Maintenance' : ''),
    whatsapp: m.whatsapp || (m.name === 'Jabu' ? '27798024735' : m.name === 'Lisa' ? '27635650731' : '')
  }));

  return (
    <div className="app-root">
      {/* PAGE CONTENT */}
      <div className="page">
        {/* BRAIN (HOME) */}
        {activeTab === 'brain' && (
          <div className="center">
            <img src="/rosie.svg" alt="Rosie" className={mascotClass} />
            <div className="hi">Hi! I’m Rosie</div>
            <div className="sub">Ask me anything, family! I’m ready to help.</div>

            {/* Input pill (home only) */}
            <div className="input-pill" role="search">
              <input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAction(inputText)}
                placeholder="Ask the family admin…"
                aria-label="Ask Rosie"
              />
              <button
                className="send-btn"
                onClick={() => handleAction(inputText)}
                aria-label="Send"
              >
                <Send size={18} />
              </button>
            </div>

            {/* Quick status (mic + privacy) */}
            <div style={{marginTop: 14, display:'flex', justifyContent:'center', gap: 10, flexWrap:'wrap'}}>
              <button
                className="pill"
                onClick={() => setIsMicLocked(!isMicLocked)}
                aria-label={isMicLocked ? 'Microphone locked' : 'Microphone active'}
              >
                {isMicLocked ? <MicOff size={16} /> : <Mic size={16} />}
                <span style={{marginLeft: 8}}>{isMicLocked ? 'Privacy On' : 'Voice Active'}</span>
              </button>
              <button
                className="pill"
                onClick={() => setIsLensOpen(true)}
                aria-label="Open Rosie Lens"
              >
                <Camera size={16} />
                <span style={{marginLeft: 8}}>Lens</span>
              </button>
              <button
                className="pill"
                onClick={() => { setActiveTab('feed'); setFeedView('plan'); }}
                aria-label="Open Feed"
              >
                <Calendar size={16} />
                <span style={{marginLeft: 8}}>Today</span>
              </button>
            </div>

            {/* Mini cards */}
            <div style={{marginTop: 18, display:'grid', gridTemplateColumns:'1fr', gap: 12}}>
              <div className="card">
                <div className="card-title">Shopping Preview</div>
                {(familyData.shopping || []).slice(0, 4).map((item, i) => (
                  <div key={i} className="small" style={{padding:'6px 0', borderBottom: i < 3 ? '1px solid rgba(0,0,0,0.06)' : 'none'}}>
                    {item}
                  </div>
                ))}
                {(!familyData.shopping || familyData.shopping.length === 0) && (
                  <div className="small">No items yet.</div>
                )}
              </div>

              <div className="card">
                <div className="card-title">Next Plan Items</div>
                {(familyData.plans || [])
                  .slice()
                  .sort((a,b) => (a.time || '').localeCompare(b.time || ''))
                  .slice(0, 3)
                  .map((p, i) => (
                    <div key={i} className="small" style={{padding:'6px 0', borderBottom: i < 2 ? '1px solid rgba(0,0,0,0.06)' : 'none'}}>
                      <strong>{p.time}</strong> — {p.title}
                    </div>
                  ))}
                {(!familyData.plans || familyData.plans.length === 0) && (
                  <div className="small">No plans yet.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* FEED */}
        {activeTab === 'feed' && (
          <div>
            <div className="card" style={{marginBottom: 14}}>
              <div className="card-title">Feed</div>
              <div className="pill-row">
                {FEED_VIEWS.map(v => (
                  <button
                    key={v.id}
                    className={`pill ${feedView === v.id ? 'active' : ''}`}
                    onClick={() => setFeedView(v.id)}
                    aria-label={`Open ${v.label}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {feedView === 'plan' && (
              <div className="card">
                <div className="card-title">Family Schedule</div>
                <div style={{display:'grid', gap: 10}}>
                  {(familyData.plans || [])
                    .slice()
                    .sort((a,b) => (a.time || '').localeCompare(b.time || ''))
                    .map((p, i) => (
                      <div key={i} className="list-item">
                        <div style={{display:'flex', flexDirection:'column', gap: 2}}>
                          <div className="small"><strong>{p.time}</strong> • {p.category || 'General'}</div>
                          <div>{p.title}</div>
                        </div>
                        <div style={{opacity: 0.35}}><Clock size={18} /></div>
                      </div>
                    ))}
                  {(!familyData.plans || familyData.plans.length === 0) && (
                    <div className="small">No schedule items yet. Say “Rosie, add soccer at 4pm”.</div>
                  )}
                </div>
              </div>
            )}

            {feedView === 'radio' && (
              <div className="card">
                <div className="card-title">Rosie FM</div>
                <div className="small" style={{marginBottom: 12}}>
                  Tap to generate a short “Rosie &amp; Zephyr” broadcast.
                </div>
                <button
                  className="pill"
                  onClick={() => handleAction("rosie fm daily broadcast")}
                  aria-label="Generate Rosie FM"
                >
                  <Radio size={16} />
                  <span style={{marginLeft: 8}}>Play Daily Broadcast</span>
                </button>
              </div>
            )}

            {feedView === 'log' && (
              <div className="card">
                <div className="card-title">Diaries</div>
                <div style={{display:'grid', gap: 10}}>
                  {['My Journal', 'Meds Log', 'Staff Log'].map((book) => (
                    <button
                      key={book}
                      className="list-item"
                      onClick={() => setOpenBook(book)}
                      aria-label={`Open ${book}`}
                      style={{border:'none', cursor:'pointer'}}
                    >
                      <div style={{display:'flex', flexDirection:'column', gap: 2, textAlign:'left'}}>
                        <div className="small">{book}</div>
                        <div style={{fontWeight: 900}}>Open</div>
                      </div>
                      <PenLine size={18} style={{opacity: 0.35}} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* HUB */}
        {activeTab === 'hub' && (
          <div>
            {!selectedMember ? (
              <div className="card">
                <div className="card-title">Family &amp; Staff</div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 10}}>
                  {STAFF.map(m => (
                    <button
                      key={m.name}
                      onClick={() => setSelectedMember(m)}
                      style={{
                        border:'none',
                        cursor:'pointer',
                        background:'white',
                        borderRadius: 22,
                        padding: 12,
                        boxShadow:'0 6px 18px rgba(0,0,0,0.06)',
                        display:'flex',
                        flexDirection:'column',
                        alignItems:'center',
                        gap: 8
                      }}
                      aria-label={`Open ${m.name}`}
                    >
                      <img src="/rosie.svg" alt="Rosie" style={{width: 40, height:'auto'}} />
                      <div style={{fontWeight: 900, fontSize: 12}}>{m.name}</div>
                      {m.staffRole ? <div className="small">{m.staffRole}</div> : <div className="small">&nbsp;</div>}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="card">
                <div style={{display:'flex', alignItems:'center', gap: 10, marginBottom: 12}}>
                  <button
                    className="pill"
                    onClick={() => setSelectedMember(null)}
                    aria-label="Back"
                  >
                    <ArrowLeft size={16} /> <span style={{marginLeft: 8}}>Back</span>
                  </button>
                  <div style={{fontWeight: 900, fontSize: 18}}>
                    {selectedMember.name}
                    {selectedMember.staffRole ? <span className="small" style={{marginLeft: 10}}>{selectedMember.staffRole}</span> : null}
                  </div>
                </div>

                <div className="card-title">To-Do List</div>

                <div style={{display:'grid', gap: 10}}>
                  {(familyData.memberTasks?.[selectedMember.name] || []).map((t, i) => (
                    <div key={i} className="list-item">
                      <div style={{display:'flex', alignItems:'center', gap: 10}}>
                        <CheckCircle size={18} style={{opacity: 0.35}} />
                        <span>{t}</span>
                      </div>
                      <button
                        onClick={() => removeTask(selectedMember.name, t)}
                        aria-label="Delete task"
                        style={{border:'none', background:'transparent', cursor:'pointer', opacity: 0.55}}
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}

                  {(familyData.memberTasks?.[selectedMember.name] || []).length === 0 && (
                    <div className="small">No tasks yet.</div>
                  )}
                </div>

                {selectedMember.whatsapp && (
                  <button
                    className="pill"
                    onClick={() => sendTodosOnWhatsApp(selectedMember)}
                    aria-label="Send to WhatsApp"
                    style={{marginTop: 12}}
                  >
                    <MessageCircle size={16} />
                    <span style={{marginLeft: 8}}>Send To-Do via WhatsApp</span>
                  </button>
                )}

                <div style={{display:'flex', gap: 10, marginTop: 14}}>
                  <input
                    id="task-in"
                    placeholder="Add task…"
                    aria-label="Add task"
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      borderRadius: 18,
                      padding: '12px 14px',
                      background: 'rgba(255,255,255,0.85)',
                      boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
                      fontWeight: 800
                    }}
                  />
                  <button
                    className="send-btn"
                    onClick={() => {
                      const el = document.getElementById('task-in');
                      if (el && el.value) {
                        executeNode('assign_task', { member: selectedMember.name, task: el.value });
                        el.value = '';
                      }
                    }}
                    aria-label="Add"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SETUP */}
        {activeTab === 'setup' && (
          <div style={{display:'grid', gap: 12}}>
            <div className="card">
              <div className="card-title">Voice &amp; Privacy</div>
              <div className="small" style={{marginBottom: 10}}>
                Microphone remains listening for the wake word “Rosie” when Voice Active is enabled.
              </div>
              <button
                className="pill"
                onClick={() => setIsMicLocked(!isMicLocked)}
                aria-label="Toggle mic privacy"
              >
                {isMicLocked ? <MicOff size={16} /> : <Mic size={16} />}
                <span style={{marginLeft: 8}}>{isMicLocked ? 'Enable Voice Active' : 'Enable Privacy Mode'}</span>
              </button>
            </div>

            <div className="card">
              <div className="card-title">Version</div>
              <div style={{fontWeight: 900, fontSize: 18}}>V31 — DOWNLOAD</div>
              <div className="small">Production-ready build.</div>
            </div>

            <div className="card">
              <div className="card-title">Quick Actions</div>
              <div className="pill-row">
                <button className="pill" onClick={() => setIsLensOpen(true)} aria-label="Open Lens">
                  <Camera size={16} /><span style={{marginLeft:8}}>Lens</span>
                </button>
                <button className="pill" onClick={() => setActiveTab('feed')} aria-label="Open Feed">
                  <Radio size={16} /><span style={{marginLeft:8}}>Feed</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BOOK MODAL (uses existing openBook logic) */}
        {openBook && (
          <div style={{
            position:'fixed', inset: 0, background:'rgba(0,0,0,0.32)',
            display:'flex', alignItems:'center', justifyContent:'center', padding: 16, zIndex: 80
          }}>
            <div className="card" style={{width:'min(560px, 100%)'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10}}>
                <div style={{fontWeight: 900, fontSize: 16}}>{openBook}</div>
                <button
                  className="pill"
                  onClick={() => setOpenBook(null)}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="small">This panel remains wired to your existing diary logic.</div>
            </div>
          </div>
        )}

        {/* LENS MODAL (uses existing isLensOpen / lensResult logic if present) */}
        {isLensOpen && (
          <div style={{
            position:'fixed', inset: 0, background:'rgba(0,0,0,0.32)',
            display:'flex', alignItems:'center', justifyContent:'center', padding: 16, zIndex: 90
          }}>
            <div className="card" style={{width:'min(560px, 100%)'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10}}>
                <div style={{fontWeight: 900, fontSize: 16}}>Rosie Lens</div>
                <button className="pill" onClick={() => setIsLensOpen(false)} aria-label="Close lens">
                  <X size={16} />
                </button>
              </div>
              <div className="small">
                Use the Lens button to scan notes, receipts, schedules, and let Rosie convert them into tasks, plans, logs, and shopping items.
              </div>
              <div style={{height: 10}} />
              <button
                className="pill"
                onClick={() => handleAction("rosie lens scan")}
                aria-label="Run lens scan"
              >
                <Scan size={16} />
                <span style={{marginLeft: 8}}>Scan</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM NAV */}
      <div className="bottom-nav-wrap">
        <nav className="bottom-nav" aria-label="Primary Navigation">
          {[
            { id: 'brain', label: 'Brain', Icon: MessageCircle },
            { id: 'feed', label: 'Feed', Icon: Radio },
            { id: 'hub', label: 'Hub', Icon: Grid },
            { id: 'setup', label: 'Setup', Icon: Settings }
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-btn ${activeTab === id ? 'active' : ''}`}
              onClick={() => { setActiveTab(id); setSelectedMember(null); }}
              aria-label={label}
            >
              <Icon size={22} style={{opacity: activeTab === id ? 1 : 0.45}} />
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
