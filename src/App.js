import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, setDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Send, Mic, MicOff, MessageCircle, 
  Grid, MapPin, Radio, ArrowLeft, ChefHat, 
  ShieldCheck, Search, Volume2, Navigation, Settings,
  Zap, Heart, Book, Trash2, CheckCircle, Activity
} from 'lucide-react';

// --- CONFIG ---
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

// --- INJECTED: TOOL DEFINITIONS ---
const ROSIE_TOOLS = [
  {
    name: "manage_shopping",
    description: "Update grocery list.",
    parameters: { type: "object", properties: { item: {type:"string"}, action: {type:"string", enum:["add","remove"]}}, required: ["item","action"]}
  },
  {
    name: "manage_calendar",
    description: "Update family schedule.",
    parameters: { type: "object", properties: { event: {type:"string"}, action: {type:"string", enum:["add","remove"]}}, required: ["event","action"]}
  },
  {
    name: "assign_task",
    description: "Assign task to family member.",
    parameters: { type: "object", properties: { member: {type:"string"}, task: {type:"string"}}, required: ["member","task"]}
  },
  {
    name: "log_finance",
    description: "Log cost estimate.",
    parameters: { type: "object", properties: { amount: {type:"number"}, category: {type:"string"}}, required: ["amount","category"]}
  }
];

export default function App() {
  // UI State from Revision 4
  const [activeTab, setActiveTab] = useState('hub');
  const [isMicLocked, setIsMicLocked] = useState(false); // Used as Privacy Toggle
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [inputText, setInputText] = useState('');
  
  // Data State (Expanded for Tools)
  const [familyData, setFamilyData] = useState({ 
    shopping: [], chatHistory: [], plans: [], memberTasks: {}, estimates: [] 
  });
  
  // Refs
  const recognitionRef = useRef(null);
  const synthRef = window.speechSynthesis;
  const familyDataRef = useRef(familyData);
  const [isMicActive, setIsMicActive] = useState(false);

  // Sync Ref for AI Context
  useEffect(() => { familyDataRef.current = familyData; }, [familyData]);

  // --- INJECTED: EXECUTION ENGINE (The Motor) ---
  const executeAction = async (name, args) => {
    const docRef = doc(db, "families", "main_family");
    let feedback = "";
    try {
      if (name === "manage_shopping") {
          await updateDoc(docRef, { shopping: args.action === 'add' ? arrayUnion(args.item) : arrayRemove(args.item) });
          feedback = `${args.action === 'add' ? 'Added' : 'Removed'} ${args.item}.`;
      } else if (name === "manage_calendar") {
          await updateDoc(docRef, { plans: args.action === 'add' ? arrayUnion(args.event) : arrayRemove(args.event) });
          feedback = `Scheduled: ${args.event}.`;
      } else if (name === "assign_task") {
          const field = `memberTasks.${args.member}`;
          await updateDoc(docRef, { [field]: arrayUnion(args.task) });
          feedback = `Task for ${args.member}: ${args.task}.`;
      } else if (name === "log_finance") {
          await updateDoc(docRef, { estimates: arrayUnion({ amount: args.amount, category: args.category, ts: new Date().toLocaleDateString() }) });
          feedback = `Logged R${args.amount}.`;
      }
      return feedback;
    } catch(e) {
      console.error("EXECUTION FAILURE:", e);
      return "I tried to update the database but failed.";
    }
  };

  const speak = (text) => {
    synthRef.cancel();
    setIsSpeaking(true);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-ZA'; 
    u.onend = () => setIsSpeaking(false);
    synthRef.speak(u);
  };

  // --- INJECTED: WAKE WORD & TOOL HANDLER ---
  const handleAction = useCallback(async (text) => {
    if (!text) return;
    const msg = text.toLowerCase();
    
    // Quick Nav Override
    if (msg.includes("navigate to")) {
      const dest = msg.split("navigate to")[1].trim();
      speak(`Right away! Let's go to ${dest}.`);
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
      return;
    }

    setIsThinking(true);
    try {
      // Gemini 1.5 Flash with Tools
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        tools: [{ functionDeclarations: ROSIE_TOOLS }] 
      });
      
      const chat = model.startChat();
      const result = await chat.sendMessage(`Context: ${JSON.stringify(familyDataRef.current)}. User: "${text}". If action needed, call tool.`);
      const call = result.response.functionCalls()?.[0];

      if (call) {
        const feedback = await executeAction(call.name, call.args);
        setIsThinking(false);
        speak(feedback);
        // Optional: Add to chat history
        await updateDoc(doc(db, "families", "main_family"), { 
          chatHistory: arrayUnion({ role: 'rosie', text: feedback, ts: new Date().toLocaleTimeString() }) 
        });
      } else {
        const reply = result.response.text();
        setIsThinking(false);
        speak(reply);
        await updateDoc(doc(db, "families", "main_family"), { 
          chatHistory: arrayUnion({ role: 'rosie', text: reply, ts: new Date().toLocaleTimeString() }) 
        });
      }
    } catch (e) { 
      setIsThinking(false); 
      console.error(e);
    }
  }, []);

  // --- INJECTED: EAR RESURRECTION LOOP ---
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) return;
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-ZA';

    recognition.onstart = () => setIsMicActive(true);
    recognition.onend = () => { setIsMicActive(false); }; // Resurrection handled by interval below

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
      if (!isMicLocked && transcript.includes("rosie")) {
        const command = transcript.replace(/^(hey|okay|yo)?\s*rosie/, "").trim();
        if (command.length > 2) handleAction(command);
        else speak("I'm listening.");
      }
    };

    recognitionRef.current = recognition;
    if (!isMicLocked) { try { recognition.start(); } catch(e){} }

    // THE HEARTBEAT (Keeps Mic Alive)
    const heartbeat = setInterval(() => {
        if (!isMicLocked && !isMicActive && recognitionRef.current) {
            console.log("💓 Reviving Mic...");
            try { recognitionRef.current.start(); } catch(e) {}
        }
    }, 2000);

    return () => { clearInterval(heartbeat); recognition.stop(); };
  }, [handleAction, isMicLocked, isMicActive]);

  // Data Sync
  useEffect(() => {
    signInAnonymously(auth).then(() => {
      onSnapshot(doc(db, "families", "main_family"), (docSnap) => {
        if (docSnap.exists()) setFamilyData(prev => ({ ...prev, ...docSnap.data() }));
        else setDoc(doc(db, "families", "main_family"), { shopping: [], chatHistory: [] });
      });
    });
  }, []);

  // --- UI COMPONENTS (PRESERVED) ---
  const RosieMascot = () => (
    <div className={`relative w-64 h-64 flex justify-center items-center mb-6 transition-transform duration-500 ${isThinking ? 'animate-pulse' : ''} ${isSpeaking ? 'scale-105' : ''}`}>
      <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl">
        <path fill="#FF7F50" d="M100,25 C115,15 135,20 145,35 C155,50 150,70 165,80 C180,90 190,110 180,130 C170,150 150,155 135,170 C120,185 100,195 80,185 C60,175 45,160 30,145 C15,130 10,110 20,90 C30,70 45,60 55,40 C65,20 85,15 100,25 Z" />
        <g transform="translate(85, 85)">
           <circle fill="white" cx="0" cy="0" r="14" />
           <circle fill="black" cx="4" cy="-3" r="7" />
           <circle fill="white" cx="40" cy="0" r="14" />
           <circle fill="black" cx="44" cy="-3" r="7" />
        </g>
        <path d="M95,120 Q105,135 115,120" fill="none" stroke="black" strokeWidth="4" strokeLinecap="round" className={isSpeaking ? "animate-bounce" : ""} />
      </svg>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center relative overflow-hidden">
      {/* Background injection */}
      <div className="absolute inset-0 z-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-orange-200 via-white to-white pointer-events-none" />
      
      {/* HEADER BAR */}
      <div className="w-full px-6 py-4 flex justify-between items-center bg-white/40 backdrop-blur-sm sticky top-0 z-50">
        <button onClick={() => setIsMicLocked(!isMicLocked)} className="bg-zinc-900 px-4 py-1 rounded-full flex items-center gap-2 shadow-lg active:scale-95 transition-transform">
           <div className={`w-2 h-2 rounded-full ${isMicLocked ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
           <span className="text-[10px] font-black text-white uppercase tracking-tighter">
             {isMicLocked ? 'Privacy Mode' : 'Rosie Active'}
           </span>
        </button>
        <ShieldCheck className="text-blue-500" size={20} />
      </div>

      <main className="flex-1 w-full max-w-md flex flex-col items-center px-6 py-10 z-10">
        {/* BRAIN TAB (DEFAULT CHAT VIEW) */}
        {activeTab === 'brain' && (
          <div className="w-full flex flex-col items-center animate-in fade-in zoom-in duration-500">
             <div className="text-center mb-8">
                <h1 className="text-5xl font-black text-[#f97316] tracking-tighter italic mb-2 drop-shadow-sm">HI I'M ROSIE</h1>
                <RosieMascot />
                <p className="text-2xl font-black text-gray-800 leading-tight">
                  {isThinking ? "Thinking..." : isSpeaking ? "Speaking..." : "Ask me anything!"}
                </p>
            </div>
             {/* Chat History Snippet */}
             <div className="w-full space-y-2 mb-6 max-h-40 overflow-y-auto scrollbar-hide">
                {familyData.chatHistory?.slice(-2).map((m, i) => (
                  <div key={i} className={`p-3 rounded-2xl text-xs font-bold ${m.role === 'user' ? 'bg-orange-100 ml-auto' : 'bg-white shadow-sm'}`}>{m.text}</div>
                ))}
             </div>
          </div>
        )}

        {/* FEED TAB (RADIO/NEWS) */}
        {activeTab === 'feed' && (
          <div className="w-full grid grid-cols-1 gap-4 animate-in slide-in-from-right">
             <h2 className="text-2xl font-black text-gray-800">Family Feed</h2>
             <div className="bg-white p-6 rounded-[30px] shadow-sm border border-orange-50">
                <h3 className="font-bold text-orange-500 flex items-center gap-2"><Radio size={16}/> LIVE NEWS</h3>
                <p className="text-sm font-medium mt-2 text-gray-600">Ask me to "Research the News" to populate this feed!</p>
             </div>
          </div>
        )}

        {/* HUB TAB (TOOLS & GRID) */}
        {activeTab === 'hub' && (
          <div className="w-full animate-in slide-in-from-right">
             <div className="grid grid-cols-2 gap-4 w-full mb-6">
              <button onClick={() => handleAction("Research the news")} className="bg-white border-4 border-orange-50 p-6 rounded-[45px] flex flex-col items-center gap-2 hover:scale-105 transition-transform shadow-sm">
                <Radio className="text-orange-500" size={32} />
                <span className="text-[10px] font-black text-gray-400 uppercase">Feed</span>
              </button>
              <button onClick={() => handleAction("Start navigation")} className="bg-white border-4 border-blue-50 p-6 rounded-[45px] flex flex-col items-center gap-2 hover:scale-105 transition-transform shadow-sm">
                <MapPin className="text-blue-500" size={32} />
                <span className="text-[10px] font-black text-gray-400 uppercase">Map</span>
              </button>
            </div>
            {/* Live Shopping List Preview */}
            <div className="bg-white/80 p-5 rounded-[30px] shadow-sm">
               <h3 className="font-black text-gray-400 text-xs uppercase mb-3">Shopping List</h3>
               {familyData.shopping?.map((item, i) => (
                 <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="font-bold text-gray-700">{item}</span>
                    <button onClick={() => executeAction('manage_shopping', {item, action: 'remove'})}><Trash2 size={14} className="text-red-400"/></button>
                 </div>
               ))}
            </div>
          </div>
        )}

        {/* SETUP TAB */}
        {activeTab === 'setup' && (
           <div className="w-full text-center p-10">
              <Settings size={40} className="text-gray-300 mx-auto mb-4"/>
              <h2 className="font-black text-gray-400">SETTINGS</h2>
              <p className="text-xs font-bold text-gray-300">v18.1 Hybrid Build</p>
           </div>
        )}
      </main>

      {/* INPUT BOX (FLOATING) */}
      <div className="absolute bottom-28 w-full max-w-md px-6 z-20">
        <div className="w-full bg-white rounded-[40px] p-2 shadow-[0_15px_40px_rgba(0,0,0,0.06)] border border-gray-50 flex items-center gap-2">
          <input 
            value={inputText} 
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAction(inputText)}
            placeholder="Ask the family admin..." 
            className="flex-1 px-6 outline-none font-bold text-gray-600 bg-transparent"
          />
          <button onClick={() => handleAction(inputText)} className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-200 hover:scale-110 transition-transform">
            <Send size={20} />
          </button>
        </div>
      </div>

      {/* BOTTOM NAV (MATCHES MOCKUP) */}
      <nav className="fixed bottom-0 w-full p-6 flex justify-center z-50">
        <div className="bg-white/95 backdrop-blur-2xl border border-white/50 rounded-[55px] shadow-[0_20px_60px_rgba(0,0,0,0.1)] p-2 flex justify-between items-center w-full max-w-sm">
          {[ 
            {id:'brain', icon:MessageCircle, label: 'BRAIN', color: 'text-rose-500'}, 
            {id:'feed', icon:Radio, label: 'FEED', color: 'text-yellow-500'}, 
            {id:'hub', icon:Grid, label: 'HUB', color: 'text-green-500'}, 
            {id:'setup', icon:Settings, label: 'SETUP', color: 'text-purple-500'} 
          ].map(({id, icon:Icon, label, color}) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`flex flex-col items-center justify-center w-full py-3 rounded-[35px] transition-all ${activeTab === id ? 'bg-gray-50 scale-105' : ''}`}>
              <Icon size={24} className={activeTab === id ? color : 'text-gray-300'} strokeWidth={2.5} />
              <span className={`text-[9px] font-black mt-1 ${activeTab === id ? color : 'text-gray-300'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
