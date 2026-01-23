import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, setDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Send, Mic, MicOff, MessageCircle, 
  Grid, MapPin, Radio, ArrowLeft, ChefHat, 
  ShieldCheck, Search, Volume2, Navigation, Settings,
  Zap, Heart, Book, Trash2, CheckCircle
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

export default function App() {
  const [activeTab, setActiveTab] = useState('hub');
  const [isMicLocked, setIsMicLocked] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [familyData, setFamilyData] = useState({ shopping: [], chatHistory: [] });
  const [inputText, setInputText] = useState('');
  
  const recognitionRef = useRef(null);
  const synthRef = window.speechSynthesis;

  // --- WAKE WORD & NAV ENGINE ---
  const handleAction = useCallback(async (text) => {
    if (!text) return;
    const msg = text.toLowerCase();
    
    if (msg.includes("navigate to")) {
      const dest = msg.split("navigate to")[1].trim();
      speak(`Right away! Let's go to ${dest}.`);
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
      return;
    }

    setIsThinking(true);
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const res = await model.generateContent(text);
      const reply = res.response.text();
      setIsThinking(false);
      speak(reply);
    } catch (e) { setIsThinking(false); }
  }, []);

  const speak = (text) => {
    synthRef.cancel();
    setIsSpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setIsSpeaking(false);
    synthRef.speak(utterance);
  };

  useEffect(() => {
    signInAnonymously(auth).then(() => {
      onSnapshot(doc(db, "families", "main_family"), (docSnap) => {
        if (docSnap.exists()) setFamilyData(prev => ({ ...prev, ...docSnap.data() }));
      });
    });
  }, []);

  // --- PRECISION 8-PETAL MASCOT ---
  const RosieMascot = () => (
    <div className="relative w-64 h-64 flex justify-center items-center animate-rosie mb-6">
      <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl">
        {/* Irregular 8-Petal Path from Mockup */}
        <path 
          fill="#FF7F50" 
          d="M100,25 C115,15 135,20 145,35 C155,50 150,70 165,80 C180,90 190,110 180,130 C170,150 150,155 135,170 C120,185 100,195 80,185 C60,175 45,160 30,145 C15,130 10,110 20,90 C30,70 45,60 55,40 C65,20 85,15 100,25 Z" 
        />
        {/* Eyes Looking Up like Mockup */}
        <g transform="translate(85, 85)">
           <circle fill="white" cx="0" cy="0" r="14" />
           <circle fill="black" cx="4" cy="-3" r="7" />
           <circle fill="white" cx="40" cy="0" r="14" />
           <circle fill="black" cx="44" cy="-3" r="7" />
        </g>
        {/* Simple Smile */}
        <path 
          d="M95,120 Q105,135 115,120" 
          fill="none" stroke="black" strokeWidth="4" strokeLinecap="round" 
          className={isSpeaking ? "mouth-talking" : ""}
        />
      </svg>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center">
      <div className="rosie-scatter-bg" />
      
      {/* HEADER BAR */}
      <div className="w-full px-6 py-4 flex justify-between items-center bg-white/40 backdrop-blur-sm sticky top-0 z-50">
        <div className="bg-zinc-900 px-4 py-1 rounded-full flex items-center gap-2">
           <div className={`w-2 h-2 rounded-full ${isMicLocked ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
           <span className="text-[10px] font-black text-white uppercase tracking-tighter">
             {isMicLocked ? 'Privacy' : 'Rosie Active'}
           </span>
        </div>
        <ShieldCheck className="text-blue-500" size={20} />
      </div>

      <main className="flex-1 w-full max-w-md flex flex-col items-center px-6 py-10">
        
        {/* THE GREETING (MATCHES MOCKUP) */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black text-[#f97316] tracking-tighter italic mb-2 drop-shadow-sm">
            HI I'M ROSIE
          </h1>
          <RosieMascot />
          <p className="text-2xl font-black text-gray-800 leading-tight">
            Ask me anything, family! I'm ready to help.
          </p>
        </div>

        {/* INPUT BOX (MATCHES MOCKUP) */}
        <div className="w-full bg-white rounded-[40px] p-2 shadow-[0_15px_40px_rgba(0,0,0,0.06)] border border-gray-50 flex items-center gap-2 mb-10">
          <input 
            value={inputText} 
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAction(inputText)}
            placeholder="Ask the family admin..." 
            className="flex-1 px-6 outline-none font-bold text-gray-600 bg-transparent"
          />
          <button 
            onClick={() => handleAction(inputText)}
            className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-200 hover:scale-110 transition-transform"
          >
            <Send size={20} />
          </button>
        </div>

        {/* GRID FUNCTIONS (IF IN HUB) */}
        {activeTab === 'hub' && (
          <div className="grid grid-cols-2 gap-4 w-full">
            <button onClick={() => handleAction("Research the news")} className="bubble-btn bg-white border-4 border-orange-50 p-6 rounded-[45px] flex flex-col items-center gap-2">
              <Radio className="text-orange-500" size={32} />
              <span className="text-[10px] font-black text-gray-400 uppercase">Feed</span>
            </button>
            <button onClick={() => handleAction("Start navigation")} className="bubble-btn bg-white border-4 border-blue-50 p-6 rounded-[45px] flex flex-col items-center gap-2">
              <MapPin className="text-blue-500" size={32} />
              <span className="text-[10px] font-black text-gray-400 uppercase">Map</span>
            </button>
          </div>
        )}
      </main>

      {/* BOTTOM NAV (MATCHES MOCKUP ICONS) */}
      <nav className="fixed bottom-0 w-full p-6 flex justify-center">
        <div className="bg-white/95 backdrop-blur-2xl border border-white/50 rounded-[55px] shadow-[0_20px_60px_rgba(0,0,0,0.1)] p-2 flex justify-between items-center w-full max-w-sm">
          {[ 
            {id:'brain', icon:MessageCircle, label: 'BRAIN', color: 'text-rose-500'}, 
            {id:'feed', icon:Radio, label: 'FEED', color: 'text-yellow-500'}, 
            {id:'hub', icon:Grid, label: 'HUB', color: 'text-green-500'}, 
            {id:'setup', icon:Settings, label: 'SETUP', color: 'text-purple-500'} 
          ].map(({id, icon:Icon, label, color}) => (
            <button 
              key={id} 
              onClick={() => setActiveTab(id)} 
              className={`flex flex-col items-center justify-center w-full py-3 rounded-[35px] transition-all ${activeTab === id ? 'bg-gray-50 scale-105' : ''}`}
            >
              <Icon size={24} className={activeTab === id ? color : 'text-gray-300'} strokeWidth={2.5} />
              <span className={`text-[9px] font-black mt-1 ${activeTab === id ? color : 'text-gray-300'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
