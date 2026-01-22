import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, Mic, Sparkles, Heart, Book, ArrowLeft, MessageCircle, 
  Grid, Radio, Moon, Sun, MapPin, Home, ShoppingCart, 
  CheckCircle, Search, Star, Zap, Utensils, Pray, ShieldAlert, Volume2
} from 'lucide-react';

// --- PRODUCTION CONFIG ---
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
  // --- STATE ---
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

  // --- FAMILY DIRECTORY ---
  const FAMILY = {
    "Nasima": { role: "Mum (The Boss) 👸", color: "bg-red-500", icon: "👑" },
    "Suhayl": { role: "Dad 👨", color: "bg-blue-600", icon: "🚗" },
    "Zaara": { role: "Daughter (16) 👧", color: "bg-pink-400", icon: "📚" },
    "Rayhaan": { role: "Son (12) 👦", color: "bg-green-500", icon: "⚽" },
    "Lisa": { role: "Maintenance 🛠️", color: "bg-orange-600", icon: "🔧" },
    "Jabu": { role: "House Helper 🧹", color: "bg-teal-600", icon: "✨" }
  };

  // --- ENGINE ---
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
        systemInstruction: `You are Rosie, Durban North Family PA. Boss: Nasima. Household: Suhayl, Zaara, Rayhaan, Lisa, Jabu. Religion: ${familyData.userSettings.religion}. Currency: Rands (R). Stores: Woolies, Checkers Virginia, PnP Hyper, Food Lovers.`
      });
      const res = await model.generateContent(`User: ${msg}`);
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

  // --- MASCOT INTERACTION LOGIC ---
  const handleMascotDown = () => {
    longPressTimer.current = setTimeout(() => {
      setMascotMood('SOS');
      handleSend("EMERGENCY: Send my location to the whole family.");
    }, 1500);
  };

  const handleMascotUp = () => {
    clearTimeout(longPressTimer.current);
  };

  const handleMascotClick = (e) => {
    if (e.detail === 1) startListening(); // Single Tap
    if (e.detail === 2) { // Double Tap
      setMascotMood('BROADCAST');
      handleSend("Broadcast to family: Everyone please check the hub for updates.");
    }
  };

  // --- UI COMPONENTS ---
  const RosieMascot = () => (
    <div 
      onMouseDown={handleMascotDown}
      onMouseUp={handleMascotUp}
      onTouchStart={handleMascotDown}
      onTouchEnd={handleMascotUp}
      onClick={handleMascotClick}
      className={`relative w-28 h-28 rounded-full flex items-center justify-center cursor-pointer transition-all duration-500 shadow-2xl active:scale-90 ${
        mascotMood === 'SOS' ? 'bg-red-600 animate-bounce' : 
        mascotMood === 'THINKING' ? 'bg-orange-500' : 'bg-red-500'
      }`}
    >
      {/* Dynamic Eyes (The Face) */}
      <div className="flex gap-4">
        {mascotMood === 'NORMAL' && (
          <>
            <div className="w-4 h-4 bg-white rounded-full" />
            <div className="w-4 h-4 bg-white rounded-full" />
          </>
        )}
        {mascotMood === 'LISTENING' && (
          <div className="flex gap-2 items-center">
            <div className="w-3 h-8 bg-white rounded-full animate-pulse" />
            <div className="w-3 h-8 bg-white rounded-full animate-pulse" />
          </div>
        )}
        {mascotMood === 'THINKING' && (
          <div className="flex gap-2">
            <Sparkles className="text-white animate-spin" size={32} />
          </div>
        )}
        {mascotMood === 'SOS' && <ShieldAlert className="text-white scale-150" />}
        {mascotMood === 'BROADCAST' && <Volume2 className="text-white scale-150" />}
      </div>
      
      {/* Halo Pulse for Listening */}
      {isListening && (
        <div className="absolute inset-0 rounded-full border-4 border-white animate-ping opacity-30" />
      )}
    </div>
  );

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-700 ${mode === 'BEDTIME' ? 'bg-black' : 'bg-[#FFF8F0]'}`}>
      
      {/* SHARED HEADER */}
      <header className={`px-6 py-5 flex justify-between items-center sticky top-0 z-50 backdrop-blur-xl border-b ${mode === 'BEDTIME' ? 'bg-black/90 border-gray-800' : 'bg-white/90 border-gray-100'}`}>
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black italic tracking-tighter text-red-500">ROSIE</h1>
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
        </div>
        <div className="flex bg-gray-100 p-1 rounded-2xl gap-1">
          <button onClick={() => setMode('DRIVING')} className={`p-2.5 rounded-xl ${mode === 'DRIVING' ? 'bg-white text-red-500' : 'text-gray-400'}`}><Radio size={18}/></button>
          <button onClick={() => setMode('HOME')} className={`p-2.5 rounded-xl ${mode === 'HOME' ? 'bg-white text-red-500' : 'text-gray-400'}`}><Sun size={18}/></button>
          <button onClick={() => setMode('BEDTIME')} className={`p-2.5 rounded-xl ${mode === 'BEDTIME' ? 'bg-zinc-800 text-blue-400' : 'text-gray-400'}`}><Moon size={18}/></button>
        </div>
      </header>

      {/* CORE HUB */}
      <main className="flex-1 w-full px-6 py-8 pb-44 overflow-x-hidden flex flex-col items-center">
        
        {activeTab === 'hub' && (
          <div className="max-w-5xl w-full space-y-8">
            
            {/* THE MASCOT (CENTRAL CONTROL) */}
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
               <RosieMascot />
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">
                 {mascotMood === 'NORMAL' ? 'Tap to Talk • Hold for SOS' : mascotMood}
               </p>
            </div>

            {/* SPIRITUAL & MEAL CARDS (PRESERVED) */}
            <div className="bg-white rounded-[40px] p-8 border-2 border-red-50 text-center">
               <Pray className="mx-auto text-red-100 mb-2" size={40} />
               <h3 className="text-xl font-black italic text-gray-800">{familyData.dailyMessage || "Stay blessed today, Nasima."}</h3>
            </div>

            {/* MEAL ENGINE */}
            <div className="bg-gradient-to-br from-orange-400 to-red-500 rounded-[50px] p-8 text-white shadow-xl">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-3xl font-black italic tracking-tighter">Meal Plan</h2>
                 <Utensils size={24} />
               </div>
               <div className="grid grid-cols-1 gap-3">
                 {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                   <div key={day} className="bg-white/10 p-4 rounded-3xl flex justify-between items-center font-bold">
                     <span>{day}</span>
                     <span className="text-xs uppercase opacity-80">{familyData.mealPlan?.[day] || "Nasima's Choice"}</span>
                   </div>
                 ))}
               </div>
            </div>

            {/* FAMILY TASK MATRIX */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(FAMILY).map(name => (
                <div key={name} className="bg-white rounded-[35px] p-6 shadow-sm border border-gray-50 flex justify-between items-center">
                  <div>
                    <h3 className="font-black italic text-lg">{name}</h3>
                    <p className="text-[8px] font-black text-red-500 uppercase tracking-widest">{FAMILY[name].role}</p>
                  </div>
                  <div className="text-2xl">{FAMILY[name].icon}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CHAT TAB */}
        {activeTab === 'brain' && (
          <div className="max-w-2xl w-full flex flex-col h-[70vh]">
            <div className="flex-1 overflow-y-auto space-y-6 pb-12">
              {familyData.chatHistory.slice(-10).map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-6 rounded-[35px] font-bold text-sm ${m.role === 'user' ? 'bg-red-500 text-white' : 'bg-white text-gray-800 border'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white p-2 rounded-[40px] shadow-2xl flex items-center border">
              <input value={inputText} onChange={e => setInputText(e.target.value)} className="flex-1 px-6 bg-transparent outline-none font-bold" placeholder="Message Rosie..." />
              <button onClick={() => handleSend()} className="bg-red-500 text-white p-4 rounded-full"><Send size={24}/></button>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER NAV */}
      <nav className="fixed bottom-0 w-full p-6 z-50 flex justify-center">
        <div className="bg-white/95 backdrop-blur-3xl border border-white rounded-[50px] shadow-2xl p-2.5 flex justify-between items-center w-full max-w-2xl">
          {[ {id:'brain', icon:MessageCircle, label: 'Chat'}, {id:'hub', icon:Grid, label: 'Hub'}, {id:'map', icon:MapPin, label: 'Map'}, {id:'diaries', icon:Book, label: 'Log'} ].map(({id, icon:Icon, label}) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`flex flex-col items-center justify-center w-full py-4 rounded-[35px] transition-all ${activeTab === id ? 'bg-red-50 -translate-y-4 shadow-xl' : ''}`}>
              <Icon size={26} className={activeTab === id ? 'text-red-500' : 'text-gray-300'} strokeWidth={3} />
              <span className={`text-[10px] font-black uppercase mt-1 tracking-tight ${activeTab === id ? 'text-red-500' : 'text-gray-400'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
