import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, Mic, Sparkles, Heart, Book, ArrowLeft, MessageCircle, 
  Grid, Radio, Moon, Sun, MapPin, Home, ShoppingCart, 
  CheckCircle, Search, Star, Zap, Utensils, ShieldAlert, Volume2, 
  Calendar, Camera, Scan, Clock, UserCheck, Eye, HeartHandshake, Map as MapUI, X,
  ExternalLink
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
  const [isLensOpen, setIsLensOpen] = useState(false);
  const [familyData, setFamilyData] = useState({ 
    chatHistory: [], shopping: [], memberTasks: {}, diaries: [], 
    plans: [], memories: [], mealPlan: {}, userSettings: { religion: 'Islam' }, dailyMessage: "" 
  });
  const [inputText, setInputText] = useState('');
  const [mascotMood, setMascotMood] = useState('NORMAL');
  const [openDiary, setOpenDiary] = useState(null);
  
  const videoRef = useRef(null);
  const recognitionRef = useRef(null);
  const longPressTimer = useRef(null);
  const clickCount = useRef(0);

  // --- FAMILY HIERARCHY ---
  const FAMILY = {
    "Nasima": { role: "Mum (The Boss) 👸", color: "bg-red-500", icon: <Heart size={18} fill="currentColor"/> },
    "Suhayl": { role: "Dad 👨", color: "bg-blue-600", icon: <UserCheck size={18}/> },
    "Zaara": { role: "Daughter (16) 👧", color: "bg-pink-400", icon: "📚" },
    "Rayhaan": { role: "Son (12) 👦", color: "bg-green-500", icon: "⚽" },
    "Lisa": { role: "Maintenance 🛠️", color: "bg-orange-600", icon: <Zap size={18}/> },
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

  // --- AI ACTIONS ---
  const handleSend = useCallback(async (text) => {
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
        MEALS: Plan weekly recipes and add to shopping list. Durban North specials only.`
      });
      const res = await model.generateContent(`System Data: ${JSON.stringify(familyData)}. Request: ${msg}`);
      const reply = res.response.text();
      await updateDoc(doc(db, "families", "main_family"), {
        chatHistory: arrayUnion({ role: 'user', text: msg }, { role: 'model', text: reply })
      });
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply));
    } catch (e) { console.error(e); } finally {
      setIsThinking(false);
      setMascotMood('NORMAL');
    }
  }, [inputText, familyData]);

  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window)) return;
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = mode === 'DRIVING';
    recognition.onstart = () => { setIsListening(true); setMascotMood('LISTENING'); };
    recognition.onresult = (e) => handleSend(e.results[e.results.length - 1][0].transcript);
    recognition.onend = () => { if (mode === 'DRIVING') recognition.start(); else { setIsListening(false); setMascotMood('NORMAL'); } };
    recognitionRef.current = recognition;
    recognition.start();
  }, [mode, handleSend]);

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
        {mascotMood === 'LISTENING' && <Mic className="text-white animate-pulse" size={40} />}
        {mascotMood === 'THINKING' && <Sparkles className="text-white animate-spin" size={40} />}
        {mascotMood === 'SOS' && <ShieldAlert className="text-white scale-150" />}
        {mascotMood === 'BROADCAST' && <Volume2 className="text-white scale-150" />}
      </div>
      {isListening && <div className="absolute inset-0 rounded-full border-8 border-white animate-ping opacity-10" />}
    </div>
  );

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-700 ${mode === 'BEDTIME' ? 'bg-black text-white' : 'bg-[#FFF8F0]'}`}>
      <header className={`px-6 py-6 flex justify-between items-center sticky top-0 z-50 backdrop-blur-2xl border-b ${mode === 'BEDTIME' ? 'bg-black/90 border-gray-800' : 'bg-white/90 border-gray-100'}`}>
        <div className="flex items-center gap-4">
          {activeTab !== 'hub' && <button onClick={() => {setActiveTab('hub'); setOpenDiary(null);}} className="p-2.5 bg-red-500 text-white rounded-2xl shadow-lg active:scale-90"><Home size={18}/></button>}
          <h1 className="text-2xl font-black italic tracking-tighter text-red-500">ROSIE</h1>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-50 border">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Online</span>
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
              <div className="bg-white rounded-[45px] p-8 border-2 border-red-50 text-center shadow-sm">
                <HeartHandshake className="mx-auto text-red-100 mb-2" size={32} />
                <h3 className="text-lg font-black italic text-gray-800">{familyData.dailyMessage || "May your day be blessed."}</h3>
              </div>
              <div className="bg-gradient-to-br from-orange-400 to-red-500 rounded-[45px] p-8 text-white shadow-xl relative overflow-hidden group">
                <ShoppingCart className="absolute -right-5 -bottom-5 opacity-20" size={120} />
                <h3 className="text-2xl font-black italic mb-2 tracking-tighter">Grocery Agent</h3>
                <div className="flex items-center gap-2 mb-4">
                  <Star size={12} fill="currentColor"/> <span className="text-[10px] font-black uppercase tracking-widest">ZAR Rands Active</span>
                </div>
                <div className="flex gap-2">
                  <div className="bg-white/20 p-3 rounded-2xl hover:bg-white/30 cursor-pointer" onClick={() => setActiveTab('brain')}><Search size={20}/></div>
                  <div className="bg-white/20 p-3 rounded-2xl cursor-pointer" onClick={toggleLens}><Eye size={20}/></div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
              {Object.keys(FAMILY).map(name => (
                <div key={name} className="bg-white rounded-[40px] p-7 shadow-sm border border-gray-50 flex justify-between items-center group active:scale-95 transition-all">
                  <div>
                    <h3 className="text-xl font-black italic tracking-tighter">{name}</h3>
                    <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">{FAMILY[name].role}</p>
                    <div className="mt-3 space-y-1">
                      {familyData.memberTasks?.[name]?.slice(0, 2).map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-[10px] font-bold text-gray-400"><CheckCircle size={10} className="text-green-500"/> {t}</div>
                      ))}
                    </div>
                  </div>
                  <div className="text-3xl filter grayscale group-hover:grayscale-0 transition-all">{FAMILY[name].icon}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DIARIES */}
        {activeTab === 'diaries' && !openDiary && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center px-2">
              <h2 className="text-4xl font-black italic tracking-tighter">Family Logs</h2>
              <button className="bg-red-500 text-white p-4 rounded-3xl shadow-lg active:scale-90"><Plus size={24}/></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {familyData.diaries?.map(d => (
                <div key={d.id} onClick={() => setOpenDiary(d)} className="aspect-[3/4] bg-white rounded-[35px] p-6 shadow-sm border flex flex-col justify-end relative group">
                  <Book className="text-red-500 mb-2" size={28}/>
                  <h3 className="font-black text-sm leading-tight">{d.title}</h3>
                  <button className="absolute top-4 right-4 p-2 bg-red-50 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12}/></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {openDiary && (
          <div className="max-w-2xl mx-auto space-y-4">
            <button onClick={() => setOpenDiary(null)} className="flex items-center gap-2 text-red-500 font-black text-xs uppercase tracking-widest"><ArrowLeft size={16}/> Back</button>
            <div className="bg-white rounded-[40px] p-8 shadow-xl min-h-[50vh] border border-gray-50">
              <h2 className="text-3xl font-black italic mb-6">{openDiary.title}</h2>
              <div className="space-y-4 font-medium text-sm text-gray-700">
                {openDiary.entries?.map((e, i) => ( <div key={i} className="p-4 bg-gray-50 rounded-2xl border-l-4 border-red-500">{e}</div> ))}
              </div>
            </div>
          </div>
        )}

        {/* PLANS / CALENDAR */}
        {activeTab === 'plans' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <h2 className="text-4xl font-black italic tracking-tighter">Family Schedule</h2>
            <div className="space-y-4">
              {familyData.plans?.map((p, i) => (
                <div key={i} className="bg-white p-6 rounded-[35px] shadow-sm border flex items-center gap-5">
                  <div className="bg-red-500 text-white p-4 rounded-2xl"><Clock size={24}/></div>
                  <div className="font-bold text-gray-800 tracking-tight">{p}</div>
                </div>
              )) || <p className="italic text-center py-20 opacity-30">No plans scheduled yet...</p>}
            </div>
          </div>
        )}

        {/* CHAT TAB */}
        {activeTab === 'brain' && (
          <div className="max-w-3xl mx-auto flex flex-col h-[72vh]">
            <div className="flex-1 overflow-y-auto space-y-6 pb-12 scroll-smooth px-2">
              {familyData.chatHistory.slice(-15).map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-7 rounded-[45px] text-sm font-bold shadow-md leading-relaxed ${m.role === 'user' ? 'bg-red-500 text-white' : 'bg-white text-gray-800 border'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isThinking && <div className="text-red-500 animate-pulse font-black text-[10px] uppercase px-6">Searching Durban North Retail...</div>}
            </div>
            <div className="bg-white p-3 rounded-[50px] shadow-2xl flex items-center border">
              <input value={inputText} onChange={e => setInputText(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} className="flex-1 px-8 bg-transparent outline-none font-black text-gray-800" placeholder="Ask Rosie..." />
              <button onClick={() => handleSend()} className="bg-red-500 text-white p-5 rounded-full shadow-xl shadow-red-100 active:scale-95 transition-transform"><Send size={28}/></button>
            </div>
          </div>
        )}

        {/* MAP TAB */}
        {activeTab === 'map' && (
          <div className="max-w-5xl mx-auto h-[65vh] bg-gray-200 rounded-[50px] border-[12px] border-white shadow-2xl relative overflow-hidden">
             <MapUI className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-300" size={150} />
             <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
             <div className="absolute bottom-10 left-10 right-10 bg-white/95 backdrop-blur-xl p-8 rounded-[40px] shadow-2xl flex items-center gap-6 border border-white">
                <div className="w-16 h-16 bg-green-500 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg">D</div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Dad Status</p>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
                  </div>
                  <p className="text-lg font-black text-gray-800">Driving to Durban North • 5 min away</p>
                </div>
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

      {/* 6-TAB FOOTER NAV */}
      <nav className="fixed bottom-0 w-full p-6 z-50 flex justify-center">
        <div className="bg-white/95 backdrop-blur-3xl border border-white rounded-[55px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-2.5 flex justify-between items-center w-full max-w-4xl">
          {[ 
            {id:'brain', icon:MessageCircle, label: 'Chat'}, {id:'hub', icon:Grid, label: 'Hub'}, {id:'map', icon:MapPin, label: 'Map'}, 
            {id:'plans', icon:Calendar, label: 'Plan'}, {id:'memories', icon:Camera, label: 'Pics'}, {id:'diaries', icon:Book, label: 'Log'} 
          ].map(({id, icon:Icon, label}) => (
            <button key={id} onClick={() => {setActiveTab(id); setOpenDiary(null);}} className={`flex flex-col items-center justify-center w-full py-4 rounded-[40px] transition-all duration-500 ${activeTab === id ? 'bg-red-50 -translate-y-6 shadow-2xl shadow-red-100' : 'active:scale-90'}`}>
              <Icon size={22} className={activeTab === id ? 'text-red-500' : 'text-gray-300'} strokeWidth={3} />
              <span className={`text-[8px] font-black uppercase mt-1.5 tracking-tighter ${activeTab === id ? 'text-red-500' : 'text-gray-400'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
