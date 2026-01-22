import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, Mic, Sparkles, Heart, Book, ArrowLeft, MessageCircle, 
  Grid, Radio, Moon, Sun, MapPin, Home, ShoppingCart, 
  CheckCircle, Search, Star, Zap, Utensils, Pray, ShieldAlert, Volume2, X
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
  const [familyData, setFamilyData] = useState({ 
    chatHistory: [], shopping: [], memberTasks: {}, diaries: [], 
    mealPlan: {}, userSettings: { religion: 'Islam' }, dailyMessage: "" 
  });
  const [inputText, setInputText] = useState('');
  const [mascotMood, setMascotMood] = useState('NORMAL'); // NORMAL, LISTENING, THINKING, SOS, BROADCAST
  
  const recognitionRef = useRef(null);
  const longPressTimer = useRef(null);
  const clickCount = useRef(0);
  const clickTimer = useRef(null);

  // --- FAMILY HIERARCHY ---
  const FAMILY = {
    "Nasima": { role: "Mum (The Boss) 👸", color: "bg-red-500", icon: "👑" },
    "Suhayl": { role: "Dad 👨", color: "bg-blue-600", icon: "🚗" },
    "Zaara": { role: "Daughter (16) 👧", color: "bg-pink-400", icon: "📚" },
    "Rayhaan": { role: "Son (12) 👦", color: "bg-green-500", icon: "⚽" },
    "Lisa": { role: "Maintenance 🛠️", color: "bg-orange-600", icon: "🔧" },
    "Jabu": { role: "House Helper 🧹", color: "bg-teal-600", icon: "✨" }
  };

  // --- REAL-TIME ENGINE ---
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

  // --- VOICE & AI LOGIC ---
  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window)) return;
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = mode === 'DRIVING';
    recognition.onstart = () => { setIsListening(true); setMascotMood('LISTENING'); };
    recognition.onresult = (e) => handleSend(e.results[e.results.length - 1][0].transcript);
    recognition.onend = () => { 
      if (mode === 'DRIVING') recognition.start(); 
      else { setIsListening(false); setMascotMood('NORMAL'); }
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [mode]);

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
        TASKS: Log 'Tell [Name] to [Task]' specifically for Lisa, Jabu, Suhayl, Zaara, or Rayhaan.
        MEALS: Plan weekly viral recipes and add to shopping list.
        TONE: Warm, efficient, proactive.`
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

  // --- MASCOT MULTI-TOUCH INTERACTION ---
  const handleMascotInteraction = (e) => {
    clickCount.current += 1;
    if (clickTimer.current) clearTimeout(clickTimer.current);

    clickTimer.current = setTimeout(() => {
      if (clickCount.current === 1) startListening(); // Short Tap: Mic
      if (clickCount.current === 2) { // Double Tap: Broadcast
        setMascotMood('BROADCAST');
        handleSend("Broadcast to family: Nasima needs everyone's attention on the Hub.");
      }
      if (clickCount.current === 3) { // Triple Tap: Cycle Mode
        const modes = ['HOME', 'DRIVING', 'BEDTIME'];
        const next = modes[(modes.indexOf(mode) + 1) % modes.length];
        setMode(next);
        const utterance = new SpeechSynthesisUtterance(`Switching to ${next} mode.`);
        window.speechSynthesis.speak(utterance);
      }
      clickCount.current = 0;
    }, 300);
  };

  const handleMascotDown = () => {
    longPressTimer.current = setTimeout(() => {
      setMascotMood('SOS');
      handleSend("EMERGENCY: Nasima has triggered an SOS. Send location to Suhayl immediately.");
    }, 1500);
  };

  const handleMascotUp = () => clearTimeout(longPressTimer.current);

  // --- UI RENDERERS ---
  const RosieMascot = () => (
    <div 
      onMouseDown={handleMascotDown} onMouseUp={handleMascotUp}
      onTouchStart={handleMascotDown} onTouchEnd={handleMascotUp}
      onClick={handleMascotInteraction}
      className={`relative w-32 h-32 rounded-full flex items-center justify-center cursor-pointer transition-all duration-500 shadow-2xl active:scale-90 ${
        mascotMood === 'SOS' ? 'bg-red-600 animate-bounce' : 
        mode === 'BEDTIME' ? 'bg-zinc-800 border-2 border-blue-900' : 
        mascotMood === 'THINKING' ? 'bg-orange-500 shadow-orange-200' : 'bg-red-500 shadow-red-200'
      }`}
    >
      <div className="flex gap-4">
        {mascotMood === 'NORMAL' && (
          <>
            {mode === 'HOME' && <><div className="w-5 h-5 bg-white rounded-full" /><div className="w-5 h-5 bg-white rounded-full" /></>}
            {mode === 'DRIVING' && <Radio className="text-white animate-pulse" size={40} />}
            {mode === 'BEDTIME' && <div className="flex gap-2"><div className="w-6 h-1 bg-blue-400 rounded-full" /><div className="w-6 h-1 bg-blue-400 rounded-full" /></div>}
          </>
        )}
        {mascotMood === 'LISTENING' && (
          <div className="flex gap-2 items-end">
            <div className="w-3 h-8 bg-white rounded-full animate-bounce" />
            <div className="w-3 h-12 bg-white rounded-full animate-bounce delay-75" />
            <div className="w-3 h-8 bg-white rounded-full animate-bounce delay-150" />
          </div>
        )}
        {mascotMood === 'THINKING' && <Sparkles className="text-white animate-spin" size={40} />}
        {mascotMood === 'SOS' && <ShieldAlert className="text-white scale-150" />}
        {mascotMood === 'BROADCAST' && <Volume2 className="text-white scale-150 animate-pulse" />}
      </div>
      {isListening && <div className="absolute inset-0 rounded-full border-8 border-white animate-ping opacity-20" />}
    </div>
  );

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-700 ${mode === 'BEDTIME' ? 'bg-black text-white' : 'bg-[#FFF8F0] text-gray-900'}`}>
      
      {/* SHARED COMMAND HEADER */}
      <header className={`px-6 py-6 flex justify-between items-center sticky top-0 z-50 backdrop-blur-2xl border-b transition-all ${mode === 'BEDTIME' ? 'bg-black/90 border-gray-900' : 'bg-white/90 border-gray-100'}`}>
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black italic tracking-tighter text-red-500">ROSIE</h1>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-50 border border-gray-100`}>
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 shadow-lg' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Durban North Sync</span>
          </div>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-2xl gap-1">
          <button onClick={() => setMode('HOME')} className={`p-2.5 rounded-xl transition-all ${mode === 'HOME' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'}`}><Sun size={18}/></button>
          <button onClick={() => setMode('DRIVING')} className={`p-2.5 rounded-xl transition-all ${mode === 'DRIVING' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'}`}><Radio size={18}/></button>
          <button onClick={() => setMode('BEDTIME')} className={`p-2.5 rounded-xl transition-all ${mode === 'BEDTIME' ? 'bg-zinc-800 text-blue-400 shadow-sm' : 'text-gray-400'}`}><Moon size={18}/></button>
        </div>
      </header>

      <main className="flex-1 w-full px-6 py-8 pb-48 overflow-x-hidden">
        {activeTab === 'hub' && (
          <div className="max-w-5xl mx-auto space-y-10">
            
            {/* THE HEART (MASCOT) */}
            <div className="flex flex-col items-center py-6 gap-4">
              <RosieMascot />
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] animate-pulse">
                {isListening ? 'Listening...' : 'Nasima\'s Personal Assistant'}
              </p>
            </div>

            {/* SPIRITUAL & MEAL LAYER */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="bg-white rounded-[45px] p-8 border-2 border-red-50 text-center shadow-sm">
                  <Pray className="mx-auto text-red-100 mb-3" size={32} />
                  <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-2">{familyData.userSettings.religion} Message</p>
                  <h3 className="text-lg font-black italic text-gray-800 leading-relaxed">{familyData.dailyMessage || "May your home be filled with peace."}</h3>
               </div>
               
               <div className="bg-gradient-to-br from-orange-400 to-red-500 rounded-[45px] p-8 text-white shadow-xl relative overflow-hidden">
                  <Utensils className="absolute -bottom-6 -right-6 opacity-10" size={150} />
                  <h3 className="text-2xl font-black italic mb-4 tracking-tighter">Meal Plan</h3>
                  <div className="space-y-2">
                    {['Mon', 'Tue', 'Wed'].map(d => (
                      <div key={d} className="flex justify-between items-center text-xs font-bold border-b border-white/10 pb-2">
                        <span className="opacity-60">{d}</span>
                        <span>{familyData.mealPlan?.[d] || "Chef's Surprise"}</span>
                      </div>
                    ))}
                  </div>
               </div>
            </div>

            {/* FAMILY COMMAND MATRIX */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {Object.keys(FAMILY).map(name => (
                <div key={name} className="bg-white rounded-[40px] p-8 shadow-sm border border-gray-50 flex justify-between items-center active:scale-95 transition-all">
                  <div>
                    <h3 className="text-xl font-black italic tracking-tighter">{name}</h3>
                    <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">{FAMILY[name].role}</p>
                  </div>
                  <div className="text-3xl filter grayscale opacity-20 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer">{FAMILY[name].icon}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CHAT VIEW (REMAINING FEATURES PRESERVED) */}
        {activeTab === 'brain' && (
          <div className="max-w-2xl mx-auto flex flex-col h-[70vh]">
            <div className="flex-1 overflow-y-auto space-y-6 pb-12 scroll-smooth px-2">
              {familyData.chatHistory.slice(-12).map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-7 rounded-[45px] font-bold text-sm leading-relaxed ${m.role === 'user' ? 'bg-red-500 text-white shadow-lg' : 'bg-white text-gray-900 border'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white p-2 rounded-[50px] shadow-2xl flex items-center border border-gray-100">
              <input value={inputText} onChange={e => setInputText(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} className="flex-1 px-8 bg-transparent outline-none font-black text-gray-800" placeholder="Ask Rosie..." />
              <button onClick={() => handleSend()} className="bg-red-500 text-white p-5 rounded-full active:scale-90 transition-transform shadow-xl shadow-red-100"><Send size={28}/></button>
            </div>
          </div>
        )}
      </main>

      {/* GLOBAL FOOTER NAV */}
      <nav className="fixed bottom-0 w-full p-6 z-50 flex justify-center">
        <div className="bg-white/95 backdrop-blur-3xl border border-white rounded-[55px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-3 flex justify-between items-center w-full max-w-4xl">
          {[ 
            {id:'brain', icon:MessageCircle, label: 'Chat'}, 
            {id:'hub', icon:Grid, label: 'Hub'}, 
            {id:'map', icon:MapPin, label: 'Map'}, 
            {id:'diaries', icon:Book, label: 'Log'} 
          ].map(({id, icon:Icon, label}) => (
            <button key={id} onClick={() => {setActiveTab(id);}} className={`flex flex-col items-center justify-center w-full py-5 rounded-[45px] transition-all duration-500 ${activeTab === id ? 'bg-red-50 -translate-y-5 shadow-2xl shadow-red-100' : 'hover:scale-105 active:scale-90'}`}>
              <Icon size={28} className={activeTab === id ? 'text-red-500' : 'text-gray-300'} strokeWidth={3} />
              <span className={`text-[10px] font-black uppercase mt-1.5 tracking-tighter ${activeTab === id ? 'text-red-500' : 'text-gray-400'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
