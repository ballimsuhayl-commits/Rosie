import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, setDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, ShoppingCart, Calendar, Mic, MicOff, Sparkles, Heart, 
  Camera, Book, ArrowLeft, PenLine, Utensils, X, AlertCircle, 
  Loader2, MessageCircle, Grid, Play, Settings, Radio, Volume2, 
  MapPin, Navigation, Compass, Signal, Wifi, RefreshCw, Scan,
  ChefHat, Flame, User, CheckCircle
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

const FAMILY_MEMBERS = [
  { name: "Nasima", role: "Mum", color: "bg-rose-100 text-rose-600", icon: "👸" },
  { name: "Suhayl", role: "Dad", color: "bg-blue-100 text-blue-600", icon: "🧔" },
  { name: "Rayhaan", role: "Son", color: "bg-green-100 text-green-600", icon: "👦" },
  { name: "Zaara", role: "Daughter", color: "bg-purple-100 text-purple-600", icon: "👧" },
  { name: "Lisa", role: "Staff", color: "bg-orange-100 text-orange-600", icon: "🛠️" },
  { name: "Jabu", role: "Staff", color: "bg-teal-100 text-teal-600", icon: "🧹" }
];

// --- 1. DEFINE TOOL SCHEMAS (The Quantum Wire) ---
const ROSIE_TOOLS = [
  {
    name: "manage_shopping",
    description: "Add or remove items from the family shopping list.",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string", description: "Name of the grocery item" },
        action: { type: "string", enum: ["add", "remove"] }
      },
      required: ["item", "action"]
    }
  },
  {
    name: "update_schedule",
    description: "Add a new appointment or family plan to the calendar.",
    parameters: {
      type: "object",
      properties: {
        event: { type: "string", description: "Description and time of the event" }
      },
      required: ["event"]
    }
  },
  {
    name: "record_price_estimate",
    description: "Saves a cost estimate for family spending analysis.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Total amount estimated from receipt" },
        category: { type: "string", description: "e.g. Groceries, Fuel, Dining" }
      },
      required: ["amount", "category"]
    }
  }
];

// --- OS UI COMPONENTS ---
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
              <div className="w-6 h-3 border-[1.5px] border-[#2D2D2D] rounded-[4px] relative ml-1 flex items-center px-0.5">
                  <div className="h-[70%] w-[80%] bg-[#2D2D2D] rounded-[1px]"></div>
                  <div className="absolute -right-[3px] top-[2.5px] h-1 w-[1.5px] bg-[#2D2D2D] rounded-r-sm"></div>
              </div>
          </div>
      </div>
    );
};

const ConfettiPattern = () => (
  <div className="absolute inset-0 pointer-events-none opacity-40 z-0">
    <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <pattern id="confetti" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
        <circle cx="15" cy="15" r="3" fill="#8AB4F8" />
        <circle cx="85" cy="25" r="3" fill="#FF8C66" opacity="0.5" />
        <path d="M 35 45 Q 45 35 55 45" stroke="#FDE293" strokeWidth="3" fill="none" />
      </pattern>
      <rect width="100%" height="100%" fill="url(#confetti)" />
    </svg>
  </div>
);

const RosieMascot = ({ state, onClick }) => {
  const anim = state === 'thinking' ? 'animate-pulse' : state === 'celebrating' ? 'animate-bounce' : state === 'speaking' ? 'animate-bounce-slow' : 'hover:scale-105';
  return (
    <div className={`cursor-pointer transition-all duration-300 ${anim}`} onClick={onClick}>
      <svg viewBox="0 0 200 200" className="w-48 h-48 drop-shadow-2xl">
        <path d="M100 30 C115 20, 130 20, 140 40 C155 35, 175 45, 170 70 C190 85, 190 110, 170 125 C175 150, 155 170, 130 160 C115 180, 85 180, 70 160 C45 170, 25 150, 30 125 C10 110, 10 85, 30 70 C25 45, 45 35, 60 40 C70 20, 85 20, 100 30 Z" fill="#FF6B4A" />
        <g transform="translate(78, 95)">
           <circle r="14" fill="white" /><circle r="6" fill="#1A1A1A" />
        </g>
        <g transform="translate(122, 95)">
           <circle r="14" fill="white" /><circle r="6" fill="#1A1A1A" />
        </g>
        <path d="M 85 118 Q 100 138 115 118" stroke="#1A1A1A" strokeWidth="5" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('brain');
  const [familyData, setFamilyData] = useState({ shopping: [], plans: [], chatHistory: [], estimates: [] });
  const [inputText, setInputText] = useState("");
  const [rosieState, setRosieState] = useState('default');
  const [isMicLocked, setIsMicLocked] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const synthRef = window.speechSynthesis;
  const familyDataRef = useRef(familyData);

  useEffect(() => { familyDataRef.current = familyData; }, [familyData]);

  useEffect(() => {
    signInAnonymously(auth).then(() => {
      onSnapshot(doc(db, "families", "main_family"), (docSnap) => {
        if (docSnap.exists()) setFamilyData(prev => ({ ...prev, ...docSnap.data() }));
      });
    });
  }, []);

  const sync = async (field, val, op = 'add') => {
    const docRef = doc(db, "families", "main_family");
    await updateDoc(docRef, { [field]: op === 'add' ? arrayUnion(val) : arrayRemove(val) });
  };

  const speak = (text) => {
    synthRef.cancel();
    setRosieState('speaking');
    const u = new SpeechSynthesisUtterance(text);
    u.onend = () => setRosieState('default');
    synthRef.speak(u);
  };

  // --- 2. TOOL-USE EXECUTION (The Brain) ---
  const handleAction = useCallback(async (transcript) => {
    if (!transcript) return;
    setRosieState('thinking');
    
    // Quick Nav Override
    if (transcript.toLowerCase().includes("navigate to")) {
      const dest = transcript.split("navigate to")[1];
      speak(`Opening maps for ${dest}.`);
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
      return;
    }

    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        tools: [{ functionDeclarations: ROSIE_TOOLS }]
      });

      const chat = model.startChat();
      const result = await chat.sendMessage(`User: ${transcript}. Context: ${JSON.stringify(familyDataRef.current)}`);
      const call = result.response.functionCalls()?.[0];

      if (call) {
        const { name, args } = call;
        if (name === "manage_shopping") {
           await sync('shopping', args.item, args.action);
           speak(`Done! I've ${args.action}ed ${args.item} for you.`);
        } else if (name === "update_schedule") {
           await sync('plans', args.event, 'add');
           speak(`Scheduled! I've added ${args.event}.`);
        } else if (name === "record_price_estimate") {
           await sync('estimates', { ...args, date: new Date().toLocaleDateString() });
           speak(`I've logged that R${args.amount} for the ${args.category} budget.`);
        }
        setRosieState('celebrating');
      } else {
        const reply = result.response.text();
        await sync('chatHistory', { role: 'rosie', text: reply, ts: new Date().toLocaleTimeString() });
        speak(reply);
      }
    } catch (e) {
      setRosieState('default');
      speak("My brain flickered. Can you repeat that?");
    }
  }, []);

  // --- 3. VISION INTELLIGENCE (Price Estimates) ---
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
      const res = await model.generateContent([
        "Analyze this family image. If it's a receipt, tell me the total amount and items. If it's a person, say hello!",
        { inlineData: { data: img, mimeType: "image/jpeg" } }
      ]);
      handleAction(`I saw this: ${res.response.text()}`);
    } catch (e) { speak("I couldn't see that clearly."); }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4 select-none overflow-hidden">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&display=swap');
        .font-sans { font-family: 'Fredoka', sans-serif; }
        .animate-bounce-slow { animation: bounce 1s infinite; }`}</style>

      <div className="relative w-full max-w-[390px] h-[844px] bg-[#FFF8F0] rounded-[50px] shadow-2xl overflow-hidden border-[8px] border-[#1a1a1a] flex flex-col font-sans">
        <StatusBar />
        <ConfettiPattern />

        {/* HEADER */}
        <header className="px-7 pt-2 pb-2 z-20 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-black italic text-[#EA4335] tracking-tighter">ROSIE.</h1>
              <span className="text-[9px] font-black uppercase tracking-widest opacity-40">v18.0 Active</span>
            </div>
            <div className="flex gap-2">
                <button onClick={() => setIsMicLocked(!isMicLocked)} className="p-2.5 bg-white rounded-full shadow-md"><Mic size={18} className={isMicLocked ? 'text-red-500' : 'text-green-500'}/></button>
                <button onClick={() => setIsCameraOpen(true)} className="p-2.5 bg-white rounded-full shadow-md text-[#EA4335]"><Scan size={18} /></button>
            </div>
        </header>

        <main className="flex-1 overflow-y-auto px-7 pt-4 pb-48 z-10 scrollbar-hide">
          {activeTab === 'brain' && (
            <div className="flex flex-col items-center py-10">
               <RosieMascot state={rosieState} onClick={() => handleAction("Hi Rosie!")} />
               <h2 className="text-xl font-black text-center mt-8 uppercase tracking-tighter">HI NASIMA!<br/>I'M READY.</h2>
               <div className="w-full mt-10 space-y-4">
                  {familyData.chatHistory.slice(-2).map((m, i) => (
                    <div key={i} className={`p-4 rounded-2xl text-sm font-bold ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto' : 'bg-white text-gray-700'}`}>{m.text}</div>
                  ))}
               </div>
            </div>
          )}

          {activeTab === 'hub' && (
            <div className="grid grid-cols-2 gap-4 pt-4">
               <div className="bg-white p-6 rounded-[30px] shadow-sm flex flex-col items-center gap-2">
                  <ShoppingCart className="text-[#EA4335]" size={32}/>
                  <span className="font-black text-xs uppercase">{familyData.shopping.length} Items</span>
               </div>
               <div className="bg-white p-6 rounded-[30px] shadow-sm flex flex-col items-center gap-2">
                  <Calendar className="text-blue-500" size={32}/>
                  <span className="font-black text-xs uppercase">{familyData.plans.length} Events</span>
               </div>
            </div>
          )}
        </main>

        {/* CAMERA OVERLAY */}
        {isCameraOpen && (
           <div className="absolute inset-0 z-50 bg-black flex flex-col">
              <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" onLoadedMetadata={() => videoRef.current.play()} />
              <div className="p-10 flex justify-center gap-6 bg-black">
                 <button onClick={() => setIsCameraOpen(false)} className="p-4 bg-white/20 rounded-full text-white"><X/></button>
                 <button onClick={captureAndAnalyze} className="w-20 h-20 bg-white rounded-full flex items-center justify-center"><div className="w-16 h-16 bg-[#EA4335] rounded-full"/></button>
              </div>
              <canvas ref={canvasRef} className="hidden" />
           </div>
        )}

        {/* INPUT */}
        <div className="absolute bottom-28 w-full px-6 z-20">
            <div className="bg-white rounded-[35px] p-2 flex items-center shadow-xl border border-white/50">
              <input value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAction(inputText)} placeholder="Ask Rosie..." className="flex-1 px-4 outline-none font-bold text-sm" />
              <button onClick={() => handleAction(inputText)} className="w-12 h-12 bg-[#EA4335] rounded-full flex items-center justify-center text-white shadow-lg"><Send size={20}/></button>
            </div>
        </div>

        {/* NAV */}
        <nav className="absolute bottom-9 w-full px-6 z-30 flex justify-between bg-white/80 backdrop-blur-md p-2 rounded-[35px] shadow-lg">
            {[ {id:'brain', icon:MessageCircle}, {id:'hub', icon:Grid}, {id:'plans', icon:Calendar}, {id:'memories', icon:Camera}, {id:'diaries', icon:Book} ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-4 rounded-full ${activeTab === t.id ? 'bg-[#EA4335] text-white' : 'text-gray-400'}`}><t.icon size={24}/></button>
            ))}
        </nav>
      </div>
    </div>
  );
}
