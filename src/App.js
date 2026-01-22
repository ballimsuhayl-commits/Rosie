import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, Mic, Sparkles, Heart, Book, ArrowLeft, MessageCircle, 
  Grid, Radio, Moon, Sun, MapPin, Home, ShoppingCart, 
  CheckCircle, Search, Star, Zap, Utensils, ShieldAlert, Volume2, 
  Calendar, Camera, Scan, Clock, UserCheck, Eye, HandHeart, Map as MapUI, X
} from 'lucide-react';

// --- PRODUCTION CONFIG (DURBAN NORTH CLOUD) ---
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

export default function App() {
  // --- CORE STATE ---
  const [mode, setMode] = useState('HOME'); 
  const [activeTab, setActiveTab] = useState('hub');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isLensOpen, setIsLensOpen] = useState(false);
  const [familyData, setFamilyData] = useState({ 
    chatHistory: [], shopping: [], memberTasks: {}, diaries: [], 
    plans: [], memories: [], mealPlan: {}, userSettings: { religion: 'Islam' }, dailyMessage: "" 
  });
  const [inputText, setInputText] = useState('');
  const [mascotMood, setMascotMood] = useState('NORMAL');
  
  const videoRef = useRef(null);
  const recognitionRef = useRef(null);
  const longPressTimer = useRef(null);
  const clickCount = useRef(0);

  // --- FAMILY HIERARCHY ---
  const FAMILY = {
    "Nasima": { role: "Mum (The Boss) 👸", color: "bg-red-500", icon: "👑" },
    "Suhayl": { role: "Dad 👨", color: "bg-blue-600", icon: "🚗" },
    "Zaara": { role: "Daughter (16) 👧", color: "bg-pink-400", icon: "📚" },
    "Rayhaan": { role: "Son (12) 👦", color: "bg-green-500", icon: "⚽" },
    "Lisa": { role: "Maintenance 🛠️", color: "bg-orange-600", icon: "🔧" },
    "Jabu": { role: "House Helper 🧹", color: "bg-teal-600", icon: "✨" }
  };

  // --- SYNC ENGINE ---
  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    signInAnonymously(auth).then(() => {
      onSnapshot(doc(db, "families", "main_family"), (doc) => {
        if (doc.exists()) setFamilyData(prev => ({ ...prev, ...doc.data() }));
      });
    });
    return () => { window.removeEventListener('online', handleStatus); window.removeEventListener('offline', handleStatus); };
  }, []);

  // --- AI BRAIN ---
  const handleSend = async (text) => {
    const msg = text || inputText;
    if (!msg) return;
    setInputText('');
    setIsThinking(true);
    setMascotMood('THINKING');

    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: `You are Rosie, the Personal Alexa for the Durban North Family. 
        BOSS: Nasima (The Boss). DAD: Suhayl. RELIGION: ${familyData.userSettings.religion}.
        STORES: Woolworths, Checkers Virginia Circle, PnP Hyper, Food Lovers, Spar. 
        CURRENCY: ZAR (R).
        TASKS: "Tell [Name] to [Task]" -> Update memberTasks.
        MEALS: Plan weekly recipes and add to shopping list.
        TONE: Simplified, efficient, proactive.`
      });
      const res = await model.generateContent(`System Data: ${JSON.stringify(familyData)}. Request: ${msg}`);
      const reply = res.response.text();
      await updateDoc(doc(db, "families", "main_family"), {
        chatHistory: arrayUnion({ role: 'user', text: msg }, { role: 'model', text: reply })
      });
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply));
    } finally {
      setIsThinking(false);
      setMascotMood('NORMAL');
    }
  };

  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window)) return;
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = mode === 'DRIVING';
    recognition.onstart = () => { setIsListening(true); setMascotMood('LISTENING'); };
    recognition.onresult = (e) => handleSend(e.results[e.results.length - 1][0].transcript);
    recognition.onend = () => { if (mode === 'DRIVING') recognition.start(); else { setIsListening(false); setMascotMood('NORMAL'); } };
    recognitionRef.current = recognition;
    recognition.start();
  }, [mode]);

  // --- MASCOT LOGIC ---
  const handleMascotClick = () => {
    clickCount.current += 1;
    setTimeout(() => {
      if (clickCount.current === 1) startListening();
      if (clickCount.current === 2) { setMascotMood('BROADCAST'); handleSend("Broadcast: Everyone check the hub for Nasima's updates."); }
      if (clickCount.current === 3) setMode(prev => prev === 'HOME' ? 'DRIVING' : prev === 'DRIVING' ? 'BEDTIME' : 'HOME');
      clickCount.current = 0;
    }, 300);
  };

  const handleMascotDown = () => {
    longPressTimer.current = setTimeout(() => {
      setMascotMood('SOS');
      handleSend("EMERGENCY: SOS Triggered. Alerting family.");
    }, 1500);
  };

  // --- CAMERA LENS ---
  const toggleLens = async () => {
    if (!isLensOpen) {
      setIsLensOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } else {
      videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
      setIsLensOpen(false);
    }
  };

  const RosieMascot = () => (
    <div onMouseDown={handleMascotDown} onMouseUp={() => clearTimeout(longPressTimer.current)} onClick={handleMascotClick}
      className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl active:scale-90 ${
        mascotMood === 'SOS' ? 'bg-red-600 animate-bounce' : mascotMood === 'THINKING' ? 'bg-orange-500' : 'bg-red-500'
      }`}>
      <div className="flex gap-4">
        {mascotMood === 'NORMAL' && (
          mode === 'BEDTIME' ? <><div className="w-6 h-1 bg-blue-400 rounded-full"/><div className="w-6 h-1 bg-blue-400 rounded-full"/></> :
          <><div className="w-5 h-5 bg-white rounded-full"/><div className="w-5 h-5 bg-white rounded-full"/></>
        )}
        {mascotMood === 'LISTENING' && <div className="w-12 h-12 bg-white rounded-full animate-ping opacity-50" />}
        {mascotMood === 'THINKING' && <Sparkles className="text-white animate-spin" size={40} />}
        {mascotMood === 'SOS' && <ShieldAlert className="text-white scale-150" />}
        {mascotMood === 'BROADCAST' && <Volume2 className="text-white scale-150" />}
      </div>
      {isListening && <div className="absolute inset-0 rounded-full border-8 border-white animate-ping opacity-10" />}
    </div>
  );

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-700 ${mode === 'BEDTIME' ? 'bg-black text-white' : 'bg-[#FFF8F0]'}`}>
      <header className={`px-6 py-6 flex justify-between items-center sticky top-0 z-50 backdrop-blur-2xl border-b ${mode === 'BEDTIME' ? 'bg-black/90 border-gray-900' : 'bg-white/90 border-gray-100'}`}>
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black italic tracking-tighter text-red-500">ROSIE</h1>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-50 border">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Durban North</span>
          </div>
        </div>
        <div className="flex bg-gray-100 p-1.5 rounded-2xl gap-1">
          <button onClick={() => setMode('HOME')} className={`p-2.5 rounded-xl ${mode === 'HOME' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'}`}><Sun size={18}/></button>
          <button onClick={() => setMode('DRIVING')} className={`p-2.5 rounded-xl ${mode === 'DRIVING' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'}`}><Radio size={18}/></button>
          <button onClick={() => setMode('BEDTIME')} className={`p-2.5 rounded-xl ${mode === 'BEDTIME' ? 'bg-zinc-800 text-blue-400 shadow-sm' : 'text-gray-400'}`}><Moon size={18}/></button>
        </div>
      </header>

      <main className="flex-1 w-full px-6 py-8 pb-48 overflow-x-hidden">
        {activeTab === 'hub' && (
          <div className="max-w-5xl mx-auto space-y-10 flex flex-col items-center">
            <RosieMascot />
            
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* FIXED: Pray icon replaced with HandHeart */}
              <div className="bg-white rounded-[45px] p-8 border-2 border-red-50 text-center shadow-sm">
                <HandHeart className="mx-auto text-red-100 mb-2" size={32} />
                <h3 className="text-lg font-black italic text-gray-800">{familyData.dailyMessage || "Nasima, may your day be effortless."}</h3>
              </div>
              <div className="bg-gradient-to-br from-orange-400 to-red-500 rounded-[45px] p-8 text-white shadow-xl relative overflow-hidden">
                <h3 className="text-2xl font-black italic mb-2 tracking-tighter">Kitchen Brain</h3>
                <p className="text-[10px] font-black opacity-70 uppercase tracking-widest mb-4">Meal Plan & Durban Specials</p>
                <div className="flex gap-2">
                  <div className="bg-white/20 p-3 rounded-2xl"><Utensils size={20}/></div>
                  <div className="bg-white/20 p-3 rounded-2xl" onClick={toggleLens}><Eye size={20}/></div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
              {Object.keys(FAMILY).map(name => (
                <div key={name} className="bg-white rounded-[40px] p-7 shadow-sm border border-gray-50 flex justify-between items-center group active:scale-95 transition-all">
                  <div>
                    <h3 className="text-xl font-black italic tracking-tighter">{name}</h3>
                    <p className="text-[9px] font-black text-red-500 uppercase">{FAMILY[name].role}</p>
                  </div>
                  <div className="text-3xl grayscale group-hover:grayscale-0 transition-all">{FAMILY[name].icon}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CHAT TAB */}
        {activeTab === 'brain' && (
          <div className="max-w-3xl mx-auto flex flex-col h-[72vh]">
            <div className="flex-1 overflow-y-auto space-y-6 pb-12 px-2 scroll-smooth">
              {familyData.chatHistory.slice(-12).map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-7 rounded-[45px] text-base font-bold shadow-md ${m.role === 'user' ? 'bg-red-500 text-white' : 'bg-white text-gray-800 border'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isThinking && <div className="text-red-500 animate-pulse font-black text-[10px] uppercase px-6">Searching Durban North Retail...</div>}
            </div>
            <div className="bg-white p-3 rounded-[50px] shadow-2xl flex items-center border">
              <input value={inputText} onChange={e => setInputText(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} className="flex-1 px-8 bg-transparent outline-none font-black text-gray-800" placeholder="Ask Rosie..." />
              <button onClick={() => handleSend()} className="bg-red-500 text-white p-5 rounded-full shadow-xl shadow-red-100"><Send size={28}/></button>
            </div>
          </div>
        )}
      </main>

      {isLensOpen && (
        <div className="fixed inset-0 z-[100] bg-black">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <button onClick={toggleLens} className="absolute top-10 right-10 bg-white/20 p-4 rounded-full text-white"><X size={32}/></button>
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-4 text-white font-black italic tracking-tighter">
            <Scan className="animate-pulse" /> ROSIE LENS SCANNING
          </div>
        </div>
      )}

      {/* 6-TAB FLUID NAV */}
      <nav className="fixed bottom-0 w-full p-6 z-50 flex justify-center">
        <div className="bg-white/95 backdrop-blur-3xl border border-white rounded-[55px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-2.5 flex justify-between items-center w-full max-w-4xl">
          {[ 
            {id:'brain', icon:MessageCircle, label: 'Chat'}, {id:'hub', icon:Grid, label: 'Hub'}, {id:'map', icon:MapPin, label: 'Map'}, 
            {id:'plans', icon:Calendar, label: 'Plan'}, {id:'memories', icon:Camera, label: 'Pics'}, {id:'diaries', icon:Book, label: 'Log'} 
          ].map(({id, icon:Icon, label}) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`flex flex-col items-center justify-center w-full py-4 rounded-[40px] transition-all duration-500 ${activeTab === id ? 'bg-red-50 -translate-y-6 shadow-2xl' : 'active:scale-90'}`}>
              <Icon size={22} className={activeTab === id ? 'text-red-500' : 'text-gray-300'} strokeWidth={3} />
              <span className={`text-[8px] font-black uppercase mt-1.5 tracking-tighter ${activeTab === id ? 'text-red-500' : 'text-gray-400'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
