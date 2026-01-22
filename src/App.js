import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, setDoc, getDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, ShoppingCart, Calendar, Mic, Sparkles, Heart, 
  Camera, Book, ArrowLeft, MessageCircle, Grid, Radio, Moon, Sun,
  MapPin, Home, Edit3, X, Check, Map as MapIcon, ChevronRight
} from 'lucide-react';

// --- CONFIGURATION (KEPT FROM YOUR V5) ---
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
  // --- STATE MANAGEMENT ---
  const [mode, setMode] = useState('HOME'); // HOME, DRIVING, BEDTIME
  const [activeTab, setActiveTab] = useState('hub');
  const [familyData, setFamilyData] = useState({ 
    chatHistory: [], shopping: [], plans: [], memories: [], diaries: [], location: { lat: 0, lng: 0 } 
  });
  const [isListening, setIsListening] = useState(false);
  const [openDiary, setOpenDiary] = useState(null);
  const [inputText, setInputText] = useState('');

  // --- RECOVERY: ALWAYS LISTENING (DRIVING MODE) ---
  const recognitionRef = useRef(null);

  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window)) return;
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = mode === 'DRIVING'; 
    recognition.interimResults = false;
    
    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      handleSend(transcript);
    };

    recognition.onend = () => {
      if (mode === 'DRIVING') recognition.start(); // Auto-restart in driving mode
      else setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [mode]);

  useEffect(() => {
    if (mode === 'DRIVING') startListening();
    else if (recognitionRef.current) recognitionRef.current.stop();
  }, [mode, startListening]);

  // --- FIREBASE SYNC ---
  useEffect(() => {
    signInAnonymously(auth).then(() => {
      const unsub = onSnapshot(doc(db, "families", "main_family"), (doc) => {
        if (doc.exists()) setFamilyData(doc.data());
      });
      return unsub;
    });
  }, []);

  // --- GEMINI AI LOGIC ---
  const handleSend = async (text) => {
    const msg = text || inputText;
    if (!msg) return;
    setInputText('');
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(msg);
    const response = await result.response;
    
    await updateDoc(doc(db, "families", "main_family"), {
      chatHistory: arrayUnion({ role: 'user', text: msg }, { role: 'model', text: response.text() })
    });
  };

  // --- DIARY CRUD OPERATIONS ---
  const addDiary = async () => {
    const title = prompt("Enter Diary Name:");
    if (!title) return;
    const newDiary = { id: Date.now(), title, entries: [], color: '#FFF0EC' };
    await updateDoc(doc(db, "families", "main_family"), { diaries: arrayUnion(newDiary) });
  };

  const deleteDiary = async (diaryId) => {
    if (!window.confirm("Delete this diary forever?")) return;
    const filtered = familyData.diaries.filter(d => d.id !== diaryId);
    await updateDoc(doc(db, "families", "main_family"), { diaries: filtered });
  };

  // --- SUB-COMPONENTS ---
  const GlobalHeader = () => (
    <div className={`p-6 flex justify-between items-center ${mode === 'BEDTIME' ? 'bg-black text-white' : 'bg-[#FFF8F0]'}`}>
      <div className="flex items-center gap-4">
        {activeTab !== 'hub' && (
          <button onClick={() => {setActiveTab('hub'); setOpenDiary(null);}} className="p-2 bg-white rounded-full shadow-sm text-red-500">
            <Home size={20} />
          </button>
        )}
        <h1 className="text-xl font-black italic">ROSIE</h1>
      </div>
      <div className="flex bg-gray-200/50 p-1 rounded-2xl backdrop-blur-md">
        <button onClick={() => setMode('DRIVING')} className={`p-2 rounded-xl transition-all ${mode === 'DRIVING' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-500'}`}><Radio size={18}/></button>
        <button onClick={() => setMode('HOME')} className={`p-2 rounded-xl transition-all ${mode === 'HOME' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-500'}`}><Sun size={18}/></button>
        <button onClick={() => setMode('BEDTIME')} className={`p-2 rounded-xl transition-all ${mode === 'BEDTIME' ? 'bg-white text-blue-500 shadow-sm' : 'text-gray-500'}`}><Moon size={18}/></button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen transition-all duration-700 ${mode === 'BEDTIME' ? 'bg-black text-gray-400' : 'bg-[#FFF8F0] text-gray-900'}`}>
      <GlobalHeader />

      <main className="px-6 pb-32">
        {/* HUB TAB */}
        {activeTab === 'hub' && (
          <div className="space-y-4">
            {/* RESTORED MAP CARD */}
            <div onClick={() => setActiveTab('map')} className="bg-blue-600 rounded-[32px] p-6 text-white shadow-lg relative overflow-hidden h-40 group cursor-pointer active:scale-95 transition-transform">
               <MapPin className="absolute top-4 right-4 animate-bounce" />
               <h2 className="text-2xl font-black italic">Family Map</h2>
               <p className="opacity-80">Track family safety & traffic.</p>
               <div className="mt-4 bg-white/20 inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest">Live View</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div onClick={() => setActiveTab('diaries')} className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 flex flex-col items-center gap-2 cursor-pointer active:scale-95 transition-transform">
                <Book className="text-red-500" size={32} />
                <span className="font-black text-xs uppercase tracking-tighter">Diaries</span>
              </div>
              <div onClick={() => setActiveTab('brain')} className="bg-[#EA4335] p-6 rounded-[32px] shadow-lg text-white flex flex-col items-center gap-2 cursor-pointer active:scale-95 transition-transform">
                <Sparkles size={32} />
                <span className="font-black text-xs uppercase tracking-tighter">AI Chat</span>
              </div>
            </div>
          </div>
        )}

        {/* DIARY LIBRARY TAB */}
        {activeTab === 'diaries' && !openDiary && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-black">Logs</h2>
              <button onClick={addDiary} className="bg-red-500 text-white p-3 rounded-full shadow-lg"><Plus /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {familyData.diaries?.map(diary => (
                <div key={diary.id} className="relative group">
                  <div onClick={() => setOpenDiary(diary)} className="aspect-[3/4] bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex flex-col justify-end cursor-pointer">
                    <Book className="text-red-500 mb-2" />
                    <h3 className="font-black leading-tight">{diary.title}</h3>
                  </div>
                  <button onClick={() => deleteDiary(diary.id)} className="absolute top-2 right-2 p-2 bg-red-100 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12}/></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DIARY VIEW */}
        {openDiary && (
          <div className="space-y-4">
            <button onClick={() => setOpenDiary(null)} className="flex items-center gap-2 text-red-500 font-bold"><ArrowLeft size={16}/> Back to Library</button>
            <div className="bg-white rounded-3xl p-6 shadow-lg min-h-[400px]">
              <h2 className="text-2xl font-black mb-4">{openDiary.title}</h2>
              <div className="space-y-4">
                {openDiary.entries.map((e, i) => (
                  <div key={i} className="border-l-4 border-red-500 pl-4 py-2 bg-gray-50 rounded-r-xl">
                    <p className="text-sm font-medium">{e}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MAP TAB */}
        {activeTab === 'map' && (
           <div className="space-y-4">
             <div className="bg-gray-200 rounded-[32px] h-[500px] flex items-center justify-center relative overflow-hidden border-4 border-white shadow-xl">
                <MapIcon className="text-gray-400" size={64} />
                <p className="absolute bottom-10 font-black text-gray-500 uppercase tracking-widest">MAP ENGINE ACTIVE</p>
                {/* Simulated Marker */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-500 p-2 rounded-full border-4 border-white shadow-lg animate-pulse">
                  <Heart className="text-white" size={16} fill="currentColor" />
                </div>
             </div>
             <div className="bg-white p-4 rounded-2xl shadow-sm flex items-center gap-4">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold uppercase text-[8px]">Dad</div>
                <p className="text-xs font-bold">Dad is currently: <b>On the Way Home</b> (5 mins)</p>
             </div>
           </div>
        )}

        {/* CHAT TAB (Preserved Logic) */}
        {activeTab === 'brain' && (
          <div className="flex flex-col h-[70vh]">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {familyData.chatHistory.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-4 rounded-3xl font-bold text-sm shadow-sm ${m.role === 'user' ? 'bg-red-500 text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white p-2 rounded-full shadow-xl flex items-center border border-gray-100">
              <input value={inputText} onChange={e => setInputText(e.target.value)} className="flex-1 px-4 bg-transparent outline-none font-bold" placeholder="Ask Rosie anything..." />
              <button onClick={() => startListening()} className={`p-4 rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-gray-400'}`}><Mic size={20}/></button>
              <button onClick={() => handleSend()} className="bg-red-500 text-white p-4 rounded-full"><Send size={20}/></button>
            </div>
          </div>
        )}
      </main>

      {/* NAVIGATION BAR */}
      <nav className="fixed bottom-0 w-full p-6 z-50">
        <div className="bg-white/80 backdrop-blur-2xl border border-white/60 rounded-[35px] shadow-2xl p-2 flex justify-between items-center">
          {[ {id:'brain', icon:MessageCircle, label: 'Chat'}, {id:'hub', icon:Grid, label: 'Hub'}, {id:'map', icon:MapPin, label: 'Map'}, {id:'diaries', icon:Book, label: 'Log'} ].map(({id, icon:Icon, label}) => (
            <button key={id} onClick={() => {setActiveTab(id); setOpenDiary(null);}} className={`flex flex-col items-center justify-center w-16 py-3 rounded-[28px] transition-all ${activeTab === id ? 'bg-red-50 -translate-y-2' : ''}`}>
              <Icon size={24} className={activeTab === id ? 'text-red-500' : 'text-gray-300'} strokeWidth={3} />
              <span className={`text-[8px] font-black uppercase mt-1 ${activeTab === id ? 'text-red-500' : 'text-gray-400'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
