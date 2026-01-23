import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, setDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, ShoppingCart, Calendar, Mic, MicOff, Camera, Book, 
  ArrowLeft, X, Grid, Radio, Scan, Navigation, Signal, Wifi, Activity,
  Heart, CheckCircle, Settings, MessageCircle, MapPin, ShieldCheck, Flame,
  PenLine, Power, User, Utensils, DollarSign, Music, Home, Briefcase, ShoppingBag
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

// --- STATIC DATA ---
const FAMILY_MEMBERS = [
  { name: "Nasima", role: "Mum", color: "bg-rose-100 text-rose-600", icon: "👸" },
  { name: "Suhayl", role: "Dad", color: "bg-blue-100 text-blue-600", icon: "🧔" },
  { name: "Rayhaan", role: "Son", color: "bg-green-100 text-green-600", icon: "👦" },
  { name: "Zaara", role: "Daughter", color: "bg-purple-100 text-purple-600", icon: "👧" },
  { name: "Lisa", role: "Staff", color: "bg-orange-100 text-orange-600", icon: "🛠️" },
  { name: "Jabu", role: "Staff", color: "bg-teal-100 text-teal-600", icon: "🧹" }
];

const INITIAL_DATA = {
  shopping: ["Milk", "Bread"],
  plans: ["Soccer 4pm"],
  chatHistory: [{role: 'rosie', text: 'System Online.', ts: 'Now'}],
  memberTasks: {}, 
  diary_entries: [],
  memories: [],
  estimates: [],
  mealPlan: "No meals planned yet.",
  dailyQuote: "Loading inspiration..."
};

const QUOTES = [
  "Family is not an important thing. It's everything.",
  "Bismillah for a blessed day.",
  "Gratitude turns what we have into enough.",
  "Happiness is homemade.",
  "Do small things with great love."
];

// --- TOOLS ---
const ROSIE_TOOLS = [
  { name: "manage_shopping", description: "Update grocery list.", parameters: { type: "object", properties: { item: {type:"string"}, action: {type:"string", enum:["add","remove"]}}, required: ["item","action"]}},
  { name: "manage_calendar", description: "Update schedule.", parameters: { type: "object", properties: { event: {type:"string"}, action: {type:"string", enum:["add","remove"]}}, required: ["event","action"]}},
  { name: "assign_task", description: "Assign task to member.", parameters: { type: "object", properties: { member: {type:"string"}, task: {type:"string"}}, required: ["member","task"]}},
  { name: "write_diary", description: "Log to diary.", parameters: { type: "object", properties: { book: {type:"string"}, text: {type:"string"}}, required: ["book","text"]}},
  { name: "log_finance", description: "Log estimates.", parameters: { type: "object", properties: { amount: {type:"number"}, category: {type:"string"}}, required: ["amount","category"]}},
  { name: "broadcast_fm", description: "Start Radio.", parameters: { type: "object", properties: { topic: {type:"string"}}, required: ["topic"]}},
  { name: "update_meal_plan", description: "Set the dinner/meal plan.", parameters: { type: "object", properties: { plan: {type:"string"}}, required: ["plan"]}},
  { name: "save_memory", description: "Save a heartwarming memory.", parameters: { type: "object", properties: { text: {type:"string"}}, required: ["text"]}}
];

// --- UI COMPONENTS ---
const StatusBar = () => {
  const [time, setTime] = useState(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
  useEffect(() => setInterval(() => setTime(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })), 1000), []);
  return (
    <div className="flex justify-between items-center px-7 pt-3 pb-2 text-[#2D2D2D] font-bold text-[13px] z-50 select-none relative">
        <span className="tracking-wide">{time}</span>
        <div className="flex gap-1.5 items-center">
            <Signal size={14} fill="currentColor" />
            <Wifi size={14} />
            <div className="w-6 h-3 border-[1.5px] border-[#2D2D2D] rounded-[4px] relative ml-1"><div className="h-full w-[80%] bg-[#2D2D2D] rounded-[1px]"/></div>
        </div>
    </div>
  );
};

const ConfettiPattern = () => (
  <div className="absolute inset-0 pointer-events-none opacity-30 z-0">
    <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <pattern id="confetti" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
        <circle cx="15" cy="15" r="2" fill="#8AB4F8" />
        <circle cx="85" cy="25" r="2" fill="#FF8C66" />
        <rect x="40" y="60" width="4" height="2" transform="rotate(45)" fill="#FDE293" />
      </pattern>
      <rect width="100%" height="100%" fill="url(#confetti)" />
    </svg>
  </div>
);

const RosieMascot = ({ state }) => {
  const anim = state === 'thinking' ? 'animate-pulse' : state === 'speaking' ? 'scale-110' : '';
  return (
    <div className={`relative w-56 h-56 transition-all duration-500 ${anim}`}>
       <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl">
          <path fill="#FF7F50" d="M100,25 C115,15 135,20 145,35 C155,50 150,70 165,80 C180,90 190,110 180,130 C170,150 150,155 135,170 C120,185 100,195 80,185 C60,175 45,160 30,145 C15,130 10,110 20,90 C30,70 45,60 55,40 C65,20 85,15 100,25 Z" />
          <g transform="translate(85, 85)">
             <circle fill="white" cx="0" cy="0" r="14" /><circle fill="black" cx="4" cy="-3" r="7" />
             <circle fill="white" cx="40" cy="0" r="14" /><circle fill="black" cx="44" cy="-3" r="7" />
          </g>
          <path d="M95,120 Q105,135 115,120" fill="none" stroke="black" strokeWidth="4" strokeLinecap="round" />
       </svg>
    </div>
  );
};

export default function App() {
  // STATE
  const [hasStarted, setHasStarted] = useState(false);
  const [activeTab, setActiveTab] = useState('brain'); 
  const [isMicLocked, setIsMicLocked] = useState(false);
  const [rosieState, setRosieState] = useState('default'); 
  const [inputText, setInputText] = useState("");
  const [familyData, setFamilyData] = useState(INITIAL_DATA);
  const [openBook, setOpenBook] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [showTuner, setShowTuner] = useState(false); // RADIO TUNER
  const [radioTopic, setRadioTopic] = useState("");
  
  const recognitionRef = useRef(null);
  const synthRef = window.speechSynthesis;
  const familyDataRef = useRef(familyData);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => { familyDataRef.current = familyData; }, [familyData]);

  // BOOT & QUOTE ENGINE
  const bootSystem = async () => {
    setHasStarted(true);
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    try {
      await signInAnonymously(auth);
      onSnapshot(doc(db, "families", "main_family"), (docSnap) => {
        if (docSnap.exists()) {
          setFamilyData(prev => ({ ...prev, ...docSnap.data() }));
        } else {
          setDoc(doc(db, "families", "main_family"), { ...INITIAL_DATA, dailyQuote: QUOTES[Math.floor(Math.random() * QUOTES.length)] });
        }
      });
    } catch (e) { console.error(e); }
    startListening();
  };

  // EXECUTION ENGINE (RESTORED ALL FUNCTIONS)
  const executeAction = async (name, args) => {
    const docRef = doc(db, "families", "main_family");
    let feedback = "Done.";
    try {
      if (name === "manage_shopping") {
        await updateDoc(docRef, { shopping: args.action === 'add' ? arrayUnion(args.item) : arrayRemove(args.item) });
        feedback = `🛒 ${args.item} ${args.action}ed.`;
      } else if (name === "manage_calendar") {
        await updateDoc(docRef, { plans: args.action === 'add' ? arrayUnion(args.event) : arrayRemove(args.event) });
        feedback = `📅 Calendar: ${args.event}.`;
      } else if (name === "assign_task") {
        const field = `memberTasks.${args.member}`;
        await updateDoc(docRef, { [field]: arrayUnion(args.task) });
        feedback = `✅ Task for ${args.member}.`;
      } else if (name === "write_diary") {
        await updateDoc(docRef, { diary_entries: arrayUnion({ book: args.book, text: args.text, ts: new Date().toLocaleString() }) });
        feedback = `📖 Logged to ${args.book}.`;
      } else if (name === "log_finance") {
        await updateDoc(docRef, { estimates: arrayUnion({ amount: args.amount, category: args.category, ts: new Date().toLocaleDateString() }) });
        feedback = `💰 Logged R${args.amount}.`;
      } else if (name === "update_meal_plan") {
        await updateDoc(docRef, { mealPlan: args.plan });
        feedback = `🍽️ Meal set: ${args.plan}`;
      } else if (name === "save_memory") {
        await updateDoc(docRef, { memories: arrayUnion({ text: args.text, ts: new Date().toLocaleDateString() }) });
        feedback = `❤️ Memory Saved.`;
      } else if (name === "broadcast_fm") {
        feedback = `🎙️ Rosie FM Starting...`;
      }
      return feedback;
    } catch (e) { return "Database Error."; }
  };

  const speak = (text) => {
    synthRef.cancel();
    setRosieState('speaking');
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-ZA'; u.rate = 1.05;
    u.onend = () => setRosieState('default');
    synthRef.speak(u);
  };

  // BRAIN (GEMINI 2.5 PERSONA)
  const handleAction = useCallback(async (transcript, isRadio = false) => {
    if (!transcript) return;
    setRosieState('thinking');
    
    // QUICK NAV
    if (transcript.toLowerCase().includes("navigate to")) {
      const dest = transcript.split("navigate to")[1];
      speak(`Opening maps for ${dest}.`);
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
      setRosieState('default');
      return;
    }

    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        tools: [{ functionDeclarations: ROSIE_TOOLS }],
        systemInstruction: "You are Rosie, a warm Family PA. 1. Use 'update_meal_plan' for food. 2. Use 'save_memory' for happy moments. 3. Use 'broadcast_fm' for radio/news. 4. Use 'log_finance' for costs. Be concise."
      });
      const context = JSON.stringify(familyDataRef.current);
      const prompt = isRadio ? `Generate a radio script about: ${transcript}` : `Context: ${context}. User: ${transcript}`;
      
      const result = await model.generateContent(prompt);
      const call = result.response.functionCalls()?.[0];

      if (call) {
        const feedback = await executeAction(call.name, call.args);
        if (call.name === "broadcast_fm") {
           const script = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent(`Fun radio script about ${call.args.topic} with DJ Rosie.`);
           speak(script.response.text());
        } else {
           speak(feedback);
        }
      } else {
        const reply = result.response.text();
        speak(reply);
        await updateDoc(doc(db, "families", "main_family"), { chatHistory: arrayUnion({ role: 'rosie', text: reply, ts: new Date().toLocaleTimeString() }) });
      }
    } catch (e) { speak("I didn't catch that."); }
    setRosieState('default');
  }, []);

  // EARS (ALWAYS LISTENING)
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
        else speak("I'm listening.");
      }
    };
    recognition.onend = () => { if (!isMicLocked && hasStarted) try { recognition.start(); } catch(e){} };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch(e){}
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (hasStarted && !isMicLocked && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch(e){}
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [hasStarted, isMicLocked]);

  // VISION
  const captureAndAnalyze = async () => {
    const ctx = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const img = canvasRef.current.toDataURL('image/jpeg', 0.8).split(',')[1];
    setIsCameraOpen(false);
    setRosieState('thinking');
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const res = await model.generateContent(["Analyze this for the family.", { inlineData: { data: img, mimeType: "image/jpeg" } }]);
      handleAction(`I see this: ${res.response.text()}`);
    } catch (e) { speak("Blurry."); }
  };

  // CALCULATE FINANCE TOTAL
  const totalSpend = familyData.estimates?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;

  // QUICK NAV HELPER
  const quickNav = (place) => {
    const locs = { "Home": "Home", "Work": "Work", "Mall": "Gateway Theatre of Shopping" };
    speak(`Navigating to ${place}`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(locs[place])}`, '_blank');
  };

  // RENDER
  if (!hasStarted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FFF8F0] font-sans">
        <button onClick={bootSystem} className="flex flex-col items-center gap-4 animate-bounce">
           <div className="w-24 h-24 bg-[#EA4335] rounded-full flex items-center justify-center shadow-2xl">
             <Power className="text-white" size={40} />
           </div>
           <h1 className="text-2xl font-black text-[#EA4335]">START ROSIE</h1>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4 select-none overflow-hidden">
      <style>{`.font-sans { font-family: 'Fredoka', sans-serif; } .scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
      <div className="relative w-full max-w-[390px] h-[844px] bg-[#FFF8F0] rounded-[50px] shadow-2xl overflow-hidden border-[8px] border-[#1a1a1a] flex flex-col font-sans">
        <StatusBar />
        <ConfettiPattern />
        
        {/* HEADER */}
        <div className="w-full px-7 py-4 flex justify-between items-center z-50">
          <button onClick={() => setIsMicLocked(!isMicLocked)} className="bg-zinc-900 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg">
             <div className={`w-2 h-2 rounded-full ${isMicLocked ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
             <span className="text-[10px] font-black text-white uppercase">{isMicLocked ? 'PRIVACY' : 'EARS ON'}</span>
          </button>
          <button onClick={() => setIsCameraOpen(true)} className="p-2 bg-white rounded-full shadow-md text-[#EA4335]"><Scan size={20} /></button>
        </div>

        <main className="flex-1 w-full max-w-md flex flex-col items-center px-7 pt-4 pb-40 z-10 scrollbar-hide overflow-y-auto">
          
          {/* BRAIN TAB */}
          {activeTab === 'brain' && (
            <div className="w-full flex flex-col items-center animate-in fade-in">
               <h1 className="text-5xl font-black text-[#f97316] italic mb-4 tracking-tighter">ROSIE.</h1>
               <RosieMascot state={rosieState} />
               {/* QUOTE ENGINE */}
               <div className="bg-white/60 p-4 rounded-2xl text-center mb-6 mt-4">
                  <p className="text-xs font-black text-gray-400 uppercase mb-1">Inspiration</p>
                  <p className="text-sm font-bold text-gray-700 italic">"{familyData.dailyQuote}"</p>
               </div>
               <p className="text-xl font-black text-gray-800">{rosieState === 'thinking' ? "Thinking..." : rosieState === 'speaking' ? "Speaking..." : "Hi Family!"}</p>
            </div>
          )}

          {/* HUB TAB (DASHBOARD) */}
          {activeTab === 'hub' && (
             <div className="w-full space-y-4 animate-in slide-in-from-right">
                
                {/* 1. QUICK NAV (RESTORED) */}
                <div className="flex justify-between gap-2">
                   {['Home', 'Work', 'Mall'].map(p => (
                      <button key={p} onClick={() => quickNav(p)} className="flex-1 bg-white p-3 rounded-2xl shadow-sm flex flex-col items-center">
                         {p === 'Home' ? <Home size={16} className="text-blue-500"/> : p === 'Work' ? <Briefcase size={16} className="text-orange-500"/> : <ShoppingBag size={16} className="text-pink-500"/>}
                         <span className="text-[9px] font-black mt-1 uppercase">{p}</span>
                      </button>
                   ))}
                </div>

                {/* 2. FAMILY GRID & LISTS */}
                {!selectedMember ? (
                  <>
                    {/* FINANCE CARD (RESTORED) */}
                    <div className="bg-[#2D2D2D] text-white p-5 rounded-[30px] shadow-md flex justify-between items-center">
                       <div>
                          <p className="text-[10px] font-black uppercase text-gray-400">Budget Tracker</p>
                          <p className="text-2xl font-black">R {totalSpend.toFixed(2)}</p>
                       </div>
                       <DollarSign size={24} className="text-green-400"/>
                    </div>

                    <h2 className="text-xl font-black flex items-center gap-2 uppercase tracking-tighter mt-2 text-[#2D2D2D]"><User className="text-[#EA4335]"/> Family</h2>
                    <div className="grid grid-cols-3 gap-3">
                        {FAMILY_MEMBERS.map(m => (
                            <button key={m.name} onClick={() => setSelectedMember(m)} className="bg-white p-3 rounded-[25px] flex flex-col items-center gap-1 shadow-sm active:scale-90 transition-transform">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${m.color}`}>{m.icon}</div>
                                <span className="text-[9px] font-black text-gray-400 uppercase">{m.name}</span>
                            </button>
                        ))}
                    </div>
                    
                    {/* MEAL PLAN & SHOPPING */}
                    <div className="grid grid-cols-2 gap-3 mt-2">
                       <div className="bg-orange-100 p-4 rounded-[25px]">
                          <div className="flex items-center gap-2 mb-2"><Utensils size={16} className="text-orange-600"/><span className="text-[10px] font-black uppercase text-orange-600">Dinner</span></div>
                          <p className="text-xs font-bold text-orange-800 leading-tight">{familyData.mealPlan}</p>
                       </div>
                       <div className="bg-blue-100 p-4 rounded-[25px]">
                           <div className="flex items-center gap-2 mb-2"><ShoppingCart size={16} className="text-blue-600"/><span className="text-[10px] font-black uppercase text-blue-600">Shop</span></div>
                           <p className="text-xs font-bold text-blue-800">{familyData.shopping.length} Items</p>
                       </div>
                    </div>
                  </>
                ) : (
                  // MEMBER DETAIL VIEW
                  <div className="bg-white p-6 rounded-[40px] shadow-sm min-h-[50vh] animate-in slide-in-from-right">
                      <div className="flex items-center gap-4 mb-6">
                           <button onClick={() => setSelectedMember(null)} className="p-2 bg-gray-100 rounded-full"><ArrowLeft size={16}/></button>
                           <h2 className="text-2xl font-black italic uppercase text-[#2D2D2D]">{selectedMember.name}</h2>
                      </div>
                      <div className="space-y-2">
                          {(familyData.memberTasks?.[selectedMember.name] || []).map((t, i) => (
                              <div key={i} className="p-4 bg-gray-50 rounded-2xl font-bold text-sm flex gap-2"><CheckCircle size={16} className="text-green-500"/> {t}</div>
                          ))}
                          {!(familyData.memberTasks?.[selectedMember.name]?.length) && <p className="text-xs text-gray-300 font-bold">No active tasks.</p>}
                          <div className="flex gap-2 pt-4">
                                <input id="task-in" className="flex-1 bg-gray-100 rounded-xl px-4 font-bold text-sm" placeholder={`Add task...`} />
                                <button onClick={() => {const el=document.getElementById('task-in'); if(el.value){
                                    executeAction('assign_task', {member: selectedMember.name, task: el.value});
                                    el.value='';
                                }}} className="p-3 bg-[#EA4335] text-white rounded-xl"><Plus size={20}/></button>
                          </div>
                      </div>
                  </div>
                )}
             </div>
          )}

          {/* LOG TAB (DIARIES & MEMORIES) */}
          {activeTab === 'log' && (
             <div className="w-full animate-in slide-in-from-right h-full">
                {!openBook ? (
                  <>
                    <h2 className="text-xl font-black flex items-center gap-2 uppercase tracking-tighter mb-4 text-[#2D2D2D]"><Book className="text-[#EA4335]"/> Diaries</h2>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      {['My Journal', 'Meds Log', 'Staff Log'].map((book, i) => (
                        <button key={i} onClick={() => setOpenBook(book)} className="aspect-[3/4] bg-white rounded-r-2xl border-l-8 border-l-[#EA4335] shadow-sm p-4 flex flex-col justify-between">
                          <span className="font-black text-xl text-[#2D2D2D] leading-none">{book.split(' ').join('\n')}</span>
                          <Book size={20} className="text-gray-300"/>
                        </button>
                      ))}
                    </div>
                    
                    {/* MEMORIES GRID (RESTORED) */}
                    <h2 className="text-xl font-black flex items-center gap-2 uppercase tracking-tighter mb-4 text-[#2D2D2D]"><Heart className="text-pink-500"/> Memories</h2>
                    <div className="grid grid-cols-2 gap-3">
                       {familyData.memories?.map((m, i) => (
                          <div key={i} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-50">
                             <p className="text-[10px] font-bold text-gray-600">{m.text}</p>
                             <p className="text-[8px] font-black text-gray-300 mt-1">{m.ts}</p>
                          </div>
                       ))}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col h-full w-full">
                     <div className="flex items-center gap-3 mb-4">
                        <button onClick={() => setOpenBook(null)} className="p-2 bg-white rounded-full shadow-sm"><ArrowLeft size={20}/></button>
                        <h2 className="font-black text-xl">{openBook}</h2>
                     </div>
                     <div className="space-y-4 overflow-y-auto pb-20">
                        {familyData.diary_entries?.filter(e => e.book === openBook).map((e, i) => (
                          <div key={i} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50">
                             <p className="text-sm font-serif text-gray-700">{e.text}</p>
                             <span className="text-[9px] font-black text-gray-300 uppercase mt-2 block">{e.ts}</span>
                          </div>
                        ))}
                     </div>
                  </div>
                )}
             </div>
          )}

          {/* FEED TAB (RADIO TUNER RESTORED) */}
          {activeTab === 'feed' && (
             <div className="w-full animate-in slide-in-from-right">
                <div className="bg-white p-6 rounded-[40px] shadow-lg mb-6">
                   <h2 className="font-black text-2xl text-[#EA4335] mb-4 flex items-center gap-2"><Radio/> TUNER</h2>
                   <input className="w-full bg-gray-100 p-4 rounded-2xl font-bold mb-4 outline-none" placeholder="Enter topic (e.g. Sharks)..." value={radioTopic} onChange={e=>setRadioTopic(e.target.value)} />
                   <button onClick={() => handleAction(radioTopic, true)} className="w-full bg-[#EA4335] text-white p-4 rounded-2xl font-black shadow-md active:scale-95">PLAY BROADCAST</button>
                </div>
                <div className="bg-orange-50 p-6 rounded-[30px] border border-orange-100">
                   <p className="text-xs font-black text-orange-400 uppercase mb-2">ON AIR NOW</p>
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white"><Music size={20}/></div>
                      <div>
                         <p className="font-bold text-gray-800">Rosie FM 101.5</p>
                         <p className="text-xs text-gray-500">The Family Station</p>
                      </div>
                   </div>
                </div>
             </div>
          )}
          
          {/* SETUP TAB (RESTORED) */}
          {activeTab === 'setup' && (
             <div className="w-full p-6 animate-in slide-in-from-right">
                <h2 className="font-black text-2xl text-gray-800 mb-6">SYSTEM</h2>
                <div className="space-y-4">
                   <div className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm">
                      <span className="font-bold text-sm">Privacy Lock</span>
                      <button onClick={()=>setIsMicLocked(!isMicLocked)} className={`w-12 h-6 rounded-full relative transition-colors ${isMicLocked ? 'bg-green-500' : 'bg-gray-200'}`}>
                         <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${isMicLocked ? 'left-7' : 'left-1'}`}/>
                      </button>
                   </div>
                   <div className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm">
                      <span className="font-bold text-sm">Version</span>
                      <span className="font-mono text-xs text-gray-400">v24.0 (Fusion)</span>
                   </div>
                   <button onClick={bootSystem} className="w-full bg-gray-900 text-white p-4 rounded-2xl font-bold mt-8">REBOOT SYSTEM</button>
                </div>
             </div>
          )}
        </main>

        {/* CAMERA & INPUT */}
        {isCameraOpen && (
           <div className="absolute inset-0 z-[100] bg-black flex flex-col">
              <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" onLoadedMetadata={() => videoRef.current.play()} />
              <div className="p-10 flex justify-center gap-6 bg-black">
                 <button onClick={() => setIsCameraOpen(false)} className="p-4 bg-white/20 rounded-full text-white"><X/></button>
                 <button onClick={captureAndAnalyze} className="w-20 h-20 bg-white rounded-full flex items-center justify-center"><div className="w-16 h-16 bg-[#EA4335] rounded-full"/></button>
              </div>
              <canvas ref={canvasRef} className="hidden" />
           </div>
        )}

        <div className="absolute bottom-28 w-full max-w-[390px] px-6 z-20">
          <div className="w-full bg-white rounded-[40px] p-2 shadow-xl border border-gray-100 flex items-center gap-2">
            <input value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAction(inputText)} placeholder="Ask Rosie..." className="flex-1 px-6 outline-none font-bold text-gray-600 bg-transparent" />
            <button onClick={() => handleAction(inputText)} className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white hover:scale-110 transition-transform"><Send size={20}/></button>
          </div>
        </div>

        <nav className="fixed bottom-0 w-full max-w-[390px] p-6 flex justify-center z-50 pointer-events-none">
          <div className="bg-white/95 backdrop-blur-2xl border border-white/50 rounded-[55px] shadow-[0_20px_60px_rgba(0,0,0,0.1)] p-2 flex justify-between items-center w-full pointer-events-auto">
            {[ 
              {id:'brain', icon:MessageCircle, label: 'BRAIN', color: 'text-rose-500'}, 
              {id:'feed', icon:Radio, label: 'FEED', color: 'text-yellow-500'}, 
              {id:'hub', icon:Grid, label: 'HUB', color: 'text-green-500'}, 
              {id:'log', icon:Book, label: 'LOG', color: 'text-blue-500'},
              {id:'setup', icon:Settings, label: 'SETUP', color: 'text-purple-500'} 
            ].map(({id, icon:Icon, label, color}) => (
              <button key={id} onClick={() => {setActiveTab(id); setOpenBook(null); setSelectedMember(null);}} className={`flex flex-col items-center justify-center w-full py-3 rounded-[35px] transition-all ${activeTab === id ? 'bg-gray-50 scale-105' : ''}`}>
                <Icon size={24} className={activeTab === id ? color : 'text-gray-300'} strokeWidth={2.5} />
                <span className={`text-[9px] font-black mt-1 ${activeTab === id ? color : 'text-gray-300'}`}>{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
