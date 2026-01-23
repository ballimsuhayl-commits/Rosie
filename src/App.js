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
  { name: "Lisa", role: "Staff", color: "bg-orange-100 text-orange-600", icon: "🛠️" },
  { name: "Jabu", role: "Staff", color: "bg-teal-100 text-teal-600", icon: "🧹" }
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
    synthRef.cancel();
    setRosieState('speaking');
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-ZA'; 
    u.onend = () => setRosieState('default');
    synthRef.speak(u);
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
      <div className="flex items-center justify-center min-h-screen bg-[#FFF8F0]">
        <button onClick={bootRosie} className="flex flex-col items-center gap-6 animate-bounce">
           <div className="w-28 h-28 bg-[#EA4335] rounded-full flex items-center justify-center shadow-2xl text-white">
             <Power size={48} />
           </div>
           <h1 className="text-3xl font-black text-[#EA4335] italic">BOOT ROSIE</h1>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4 select-none overflow-hidden font-sans">
      <style>{`.font-sans { font-family: 'Fredoka', sans-serif; } .scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
      <div className="relative w-full max-w-[390px] h-[844px] bg-[#FFF8F0] rounded-[50px] shadow-2xl overflow-hidden border-[8px] border-[#1a1a1a] flex flex-col">
        <StatusBar />
        
        {/* HEADER BAR */}
        <div className="w-full px-7 py-4 flex justify-between items-center z-50">
          <button onClick={() => setIsMicLocked(!isMicLocked)} className="bg-zinc-900 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg">
             <div className={`w-2 h-2 rounded-full ${isMicLocked ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
             <span className="text-[10px] font-black text-white uppercase">{isMicLocked ? 'PRIVACY' : 'ACTIVE'}</span>
          </button>
          <div className="flex gap-4">
             <ShieldCheck className="text-blue-500" size={20} />
             <Settings className="text-gray-400" size={20} />
          </div>
        </div>

        <main className="flex-1 w-full flex flex-col items-center px-7 pt-4 pb-40 z-10 scrollbar-hide overflow-y-auto">
          {/* BRAIN TAB */}
          {activeTab === 'brain' && (
            <div className="w-full flex flex-col items-center animate-in fade-in">
               <h1 className="text-5xl font-black text-[#f97316] italic mb-6 tracking-tighter">ROSIE.</h1>
               <div className={`w-64 h-64 transition-all duration-500 ${rosieState === 'thinking' ? 'animate-pulse' : ''}`}>
                  <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl">
                    <path fill="#FF7F50" d="M100,25 C115,15 135,20 145,35 C155,50 150,70 165,80 C180,90 190,110 180,130 C170,150 150,155 135,170 C120,185 100,195 80,185 C60,175 45,160 30,145 C15,130 10,110 20,90 C30,70 45,60 55,40 C65,20 85,15 100,25 Z" />
                    <g transform="translate(85, 85)">
                       <circle fill="white" cx="0" cy="0" r="14" /><circle fill="black" cx="4" cy="-3" r="7" />
                       <circle fill="white" cx="40" cy="0" r="14" /><circle fill="black" cx="44" cy="-3" r="7" />
                    </g>
                    <path d="M95,120 Q105,135 115,120" fill="none" stroke="black" strokeWidth="4" strokeLinecap="round" />
                  </svg>
               </div>
               <p className="text-xl font-black text-gray-800 mt-8">Hi Family!</p>
            </div>
          )}

          {/* HUB TAB (RE-RESTORED FAMILY GRID) */}
          {activeTab === 'hub' && (
             <div className="w-full space-y-6 animate-in slide-in-from-right">
                {!selectedMember ? (
                  <>
                    <h2 className="text-xl font-black text-[#2D2D2D] uppercase flex items-center gap-2"><User className="text-[#EA4335]"/> Family & Staff</h2>
                    <div className="grid grid-cols-3 gap-3">
                        {FAMILY_MEMBERS.map(m => (
                            <button key={m.name} onClick={() => setSelectedMember(m)} className="bg-white p-3 rounded-[25px] flex flex-col items-center gap-1 shadow-sm active:scale-90 transition-transform">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${m.color}`}>{m.icon}</div>
                                <span className="text-[9px] font-black text-gray-400 uppercase">{m.name}</span>
                            </button>
                        ))}
                    </div>
                    <div className="bg-white p-5 rounded-[30px] shadow-sm">
                       <h3 className="font-black text-gray-400 text-xs uppercase mb-3">Shopping Preview</h3>
                       {familyData.shopping?.slice(0,3).map((item, i) => (
                         <div key={i} className="flex justify-between py-1 border-b text-sm font-bold">{item}</div>
                       ))}
                    </div>
                  </>
                ) : (
                  <div className="bg-white p-6 rounded-[40px] shadow-sm min-h-[50vh] animate-in slide-in-from-right">
                      <div className="flex items-center gap-4 mb-6">
                           <button onClick={() => setSelectedMember(null)} className="p-2 bg-gray-100 rounded-full"><ArrowLeft size={16}/></button>
                           <h2 className="text-2xl font-black italic uppercase text-[#2D2D2D]">{selectedMember.name}</h2>
                      </div>
                      <div className="space-y-2">
                          {(familyData.memberTasks?.[selectedMember.name] || []).map((t, i) => (
                              <div key={i} className="p-4 bg-gray-50 rounded-2xl font-bold text-sm flex gap-2"><CheckCircle size={16} className="text-green-500"/> {t}</div>
                          ))}
                          <div className="flex gap-2 pt-4">
                                <input id="task-in" className="flex-1 bg-gray-100 rounded-xl px-4 font-bold text-sm" placeholder="Add task..." />
                                <button onClick={() => {const el=document.getElementById('task-in'); if(el.value){ executeNode('assign_task', {member: selectedMember.name, task: el.value}); el.value='';}}} className="p-3 bg-[#EA4335] text-white rounded-xl"><Plus size={20}/></button>
                          </div>
                      </div>
                  </div>
                )}
             </div>
          )}

          {/* PLAN TAB (RE-RESTORED CALENDAR) */}
          {activeTab === 'plan' && (
             <div className="w-full animate-in slide-in-from-right h-full">
                <h2 className="text-xl font-black text-[#2D2D2D] uppercase tracking-tighter mb-4 flex items-center gap-2">
                   <Calendar className="text-blue-500"/> Family Schedule
                </h2>
                <div className="space-y-4">
                   {familyData.plans?.sort((a,b) => a.time.localeCompare(b.time)).map((p, i) => (
                     <div key={i} className="bg-white p-5 rounded-[30px] shadow-sm border-l-8 border-blue-500 flex justify-between items-center">
                        <div>
                           <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase"><Clock size={10}/> {p.time}</div>
                           <p className="font-bold text-gray-800 text-md">{p.title}</p>
                           <span className="text-[9px] font-black px-2 py-0.5 bg-gray-100 rounded-full text-gray-500 uppercase mt-1 inline-block">{p.category}</span>
                        </div>
                        <AlertTriangle size={18} className="text-gray-100" />
                     </div>
                   ))}
                   <p className="text-center text-[10px] font-black text-gray-300 uppercase py-4 italic">Say "Rosie, add piano at 5pm" to update</p>
                </div>
             </div>
          )}

          {activeTab === 'log' && (
             <div className="w-full animate-in slide-in-from-right">
                <h2 className="text-xl font-black text-[#2D2D2D] uppercase mb-4 flex items-center gap-2"><Book className="text-[#EA4335]"/> Diaries</h2>
                <div className="grid grid-cols-2 gap-4">
                  {['My Journal', 'Meds Log', 'Staff Log'].map((book) => (
                    <button key={book} onClick={() => setOpenBook(book)} className="aspect-[3/4] bg-white rounded-r-2xl border-l-8 border-l-[#EA4335] shadow-sm p-4 flex flex-col justify-between active:scale-95 transition-transform">
                      <span className="font-black text-xl text-[#2D2D2D] leading-none">{book.split(' ').join('\n')}</span>
                      <PenLine size={20} className="text-gray-300"/>
                    </button>
                  ))}
                </div>
             </div>
          )}
        </main>

        {/* INPUT BAR */}
        <div className="absolute bottom-28 w-full px-6 z-20">
          <div className="w-full bg-white rounded-[40px] p-2 shadow-2xl border border-gray-100 flex items-center gap-2">
            <input value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAction(inputText)} placeholder="Ask Rosie..." className="flex-1 px-4 outline-none font-bold text-gray-600 bg-transparent" />
            <button onClick={() => handleAction(inputText)} className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform"><Send size={20}/></button>
          </div>
        </div>

        {/* BOTTOM NAV BAR (5 TABS) */}
        <nav className="fixed bottom-0 w-full max-w-[390px] p-6 flex justify-center z-50 pointer-events-none">
          <div className="bg-white/95 backdrop-blur-2xl border border-white/50 rounded-[55px] shadow-lg p-2 flex justify-between items-center w-full pointer-events-auto">
            {[ 
              {id:'brain', icon:MessageCircle, label: 'CHAT', color: 'text-rose-500'}, 
              {id:'feed', icon:Radio, label: 'RADIO', color: 'text-yellow-500'}, 
              {id:'hub', icon:Grid, label: 'HUB', color: 'text-green-500'}, 
              {id:'plan', icon:Calendar, label: 'PLAN', color: 'text-blue-500'},
              {id:'log', icon:Book, label: 'LOG', color: 'text-purple-500'} 
            ].map(({id, icon:Icon, label, color}) => (
              <button key={id} onClick={() => {setActiveTab(id); setSelectedMember(null);}} className={`flex flex-col items-center justify-center w-full py-3 rounded-[35px] transition-all ${activeTab === id ? 'bg-gray-50' : ''}`}>
                <Icon size={22} className={activeTab === id ? color : 'text-gray-300'} strokeWidth={2.5} />
                <span className={`text-[9px] font-black mt-1 ${activeTab === id ? color : 'text-gray-300'}`}>{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
