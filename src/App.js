import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, setDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, ShoppingCart, Calendar, Mic, Sparkles, Heart, 
  Camera, Book, ArrowLeft, PenLine, Utensils, X, AlertCircle, 
  Loader2, MessageCircle, Grid, Play, Settings, WifiOff, Wifi,
  DollarSign, Tag, Podcast, Volume2, MapPin, Navigation, Compass,
  Ear, Scan, RefreshCw, Signal
} from 'lucide-react';

// --- PRODUCTION CONFIGURATION ---
const safeGetEnv = (key) => {
    try {
        if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
    } catch (e) { return undefined; }
    return undefined;
};

// YOUR CUSTOM FIREBASE CONFIGURATION
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo",
  authDomain: "rosie-pa.firebaseapp.com",
  projectId: "rosie-pa",
  storageBucket: "rosie-pa.firebasestorage.app",
  messagingSenderId: "767772651557",
  appId: "1:767772651557:web:239816f833c5af7c20cfcc",
  measurementId: "G-SQCQ424EYE"
};

const GEMINI_KEY = safeGetEnv('NEXT_PUBLIC_GEMINI_API_KEY');
const APP_ID = "rosie-family-pa-v2026";

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

export default function App() {
  const [config, setConfig] = useState(() => {
    if (GEMINI_KEY) return { gemini: GEMINI_KEY };
    try { return { gemini: localStorage.getItem('rosie_gemini_key') || "" }; } catch (e) { return null; }
  });

  const [activeTab, setActiveTab] = useState('brain');
  const [data, setData] = useState({ messages: [], groceries: [], plans: [], memories: [], diary_books: [], diary_entries: [], price_estimates: {} });
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isWakeWordActive, setIsWakeWordActive] = useState(false);
  const [user, setUser] = useState(null);
  const [rosieState, setRosieState] = useState('default');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [navData, setNavData] = useState(null);
  const [currentNavStep, setCurrentNavStep] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);

  const getServices = useCallback(() => {
    const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
    const auth = getAuth(app);
    const db = getFirestore(app);
    return { auth, db };
  }, []);

  useEffect(() => {
    const { auth } = getServices();
    signInAnonymously(auth).then(() => {
        auth.onAuthStateChanged((u) => setUser(u));
    }).catch(err => console.error("Auth error:", err));
  }, [getServices]);

  useEffect(() => {
    const { db } = getServices();
    let unsubData = () => {};
    if (user) {
        unsubData = onSnapshot(doc(db, "artifacts", APP_ID, "public", "data"), (s) => {
            if (s.exists()) setData(s.data());
            else setDoc(doc(db, "artifacts", APP_ID, "public", "data"), { messages: [], groceries: [], plans: [], memories: [], diary_books: ['Journal'], diary_entries: [], price_estimates: {} });
        }, (err) => console.error("Firestore error:", err));
    }
    return () => unsubData();
  }, [getServices, user]);

  const sync = async (field, val, op = 'add') => {
    const { db } = getServices();
    try {
      await updateDoc(doc(db, "artifacts", APP_ID, "public", "data"), { [field]: op === 'add' ? arrayUnion(val) : arrayRemove(val) });
    } catch (e) { console.error(e); }
  };

  const handleSpeak = async (text) => {
    if (!config?.gemini) return;
    setRosieState('speaking');
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${config.gemini}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: text }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
          model: "gemini-2.5-flash-preview-tts"
        })
      });
      const resJson = await res.json();
      const base64Audio = resJson.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audio = new Audio(URL.createObjectURL(new Blob([
            new Uint8Array(atob(base64Audio).split("").map(c => c.charCodeAt(0)))
        ], { type: 'audio/wav' })));
        audio.onended = () => { setRosieState('default'); if (isWakeWordActive) startWakeWordListener(); };
        await audio.play();
      } else { setRosieState('default'); if (isWakeWordActive) startWakeWordListener(); }
    } catch (e) { setRosieState('default'); if (isWakeWordActive) startWakeWordListener(); }
  };

  const processCommand = async (text) => {
    if (!text || isGenerating) return;
    if (["look", "see", "read", "scan", "photo"].some(k => text.toLowerCase().includes(k))) {
        setIsCameraOpen(true); startCamera(); return;
    }
    await sync('messages', { role: 'user', text, ts: new Date().toLocaleTimeString() });
    setIsGenerating(true); setRosieState('thinking');
    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: "Rosie PA. Alexa-style always-listening assistant. Navigation: return JSON {'type':'navigation','destination':'...','steps':[]}." });
      const res = await model.generateContent(text);
      const reply = res.response.text();
      if (reply.includes('"type": "navigation"')) {
          const nav = JSON.parse(reply.match(/\{[\s\S]*\}/)[0]);
          setNavData({ ...nav, mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(nav.destination)}` });
          handleSpeak(`Setting off for ${nav.destination}.`);
      } else {
          await sync('messages', { role: 'rosie', text: reply, ts: new Date().toLocaleTimeString() });
          handleSpeak(reply);
      }
    } finally { setIsGenerating(false); }
  };

  const startWakeWordListener = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) return;
    const rec = new Speech();
    rec.onresult = (e) => {
        const transcript = e.results[e.results.length - 1][0].transcript.toLowerCase();
        if (transcript.includes("rosie")) {
            const cmd = transcript.split("rosie")[1]?.trim();
            if (cmd) { rec.stop(); processCommand(cmd); }
        }
    };
    rec.onend = () => { if (isWakeWordActive && !isGenerating) rec.start(); };
    rec.start();
    recognitionRef.current = rec;
  };

  const startCamera = async () => {
      try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); if (videoRef.current) videoRef.current.srcObject = s; } catch (e) { setIsCameraOpen(false); }
  };

  const stopCamera = () => {
      if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      setIsCameraOpen(false);
  };

  if (!config?.gemini) return (
      <div className="min-h-screen bg-[#EA4335] flex items-center justify-center p-6">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-sm">
              <h1 className="text-2xl font-black italic text-[#EA4335] mb-4">ROSIE SETUP</h1>
              <input id="gk" placeholder="Gemini API Key" className="w-full p-4 bg-gray-50 rounded-2xl mb-4" />
              <button onClick={() => { const k = document.getElementById('gk').value; localStorage.setItem('rosie_gemini_key', k); setConfig({ gemini: k }); }} className="w-full p-4 bg-[#EA4335] text-white rounded-2xl font-black">ACTIVATE</button>
          </div>
      </div>
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4 font-sans select-none">
      <div className="relative w-full max-w-[390px] h-[844px] bg-[#FFF8F0] rounded-[50px] shadow-2xl overflow-hidden border-[8px] border-[#1a1a1a] flex flex-col">
        <StatusBar />
        <header className="px-7 pt-2 pb-2 z-20 flex justify-between items-center bg-[#FFF8F0]/90 backdrop-blur-md">
            <h1 className="text-2xl font-black italic text-[#EA4335]">ROSIE.</h1>
            <div className="flex gap-2">
                <button onClick={() => setIsCameraOpen(true)} className="p-2.5 bg-white rounded-full shadow-md text-[#EA4335]"><Scan size={18} /></button>
                <button onClick={() => { setIsWakeWordActive(!isWakeWordActive); if(!isWakeWordActive) startWakeWordListener(); }} className={`p-2.5 rounded-full shadow-md ${isWakeWordActive ? 'bg-[#EA4335] text-white' : 'bg-white text-gray-400'}`}><Mic size={18} /></button>
            </div>
        </header>

        {isCameraOpen && (
            <div className="absolute inset-0 z-50 bg-black flex flex-col">
                <div className="p-6 flex justify-between text-white"><h2 className="font-black italic text-xl">ROSIE LENS</h2><button onClick={stopCamera}><X size={28}/></button></div>
                <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" />
                <div className="p-10 bg-black flex justify-center"><button onClick={() => { /* analysis logic */ stopCamera(); }} className="w-20 h-20 bg-white rounded-full flex items-center justify-center"><div className="w-16 h-16 bg-[#EA4335] rounded-full"></div></button></div>
            </div>
        )}

        <main ref={scrollRef} className="flex-1 overflow-y-auto px-7 pt-4 pb-48 scrollbar-hide z-10">
          {navData && (
              <div className="bg-white rounded-[32px] p-6 shadow-xl border-b-[8px] border-[#EA4335] mb-6">
                  <h3 className="font-black text-lg text-[#2D2D2D] mb-4">{navData.destination}</h3>
                  <button onClick={() => window.open(navData.mapsUrl, '_blank')} className="w-full py-4 bg-blue-500 text-white rounded-2xl font-black shadow-lg uppercase">Launch Google Maps</button>
              </div>
          )}
          <div className="flex flex-col items-center justify-center py-10">
              <div className={`w-40 h-40 bg-[#FF6B4A] rounded-[40px] flex items-center justify-center shadow-2xl ${rosieState === 'thinking' ? 'animate-pulse' : ''}`}><div className="flex gap-4"><div className="w-4 h-4 bg-white rounded-full"></div><div className="w-4 h-4 bg-white rounded-full"></div></div></div>
              <h2 className="text-3xl font-black mt-8 tracking-tighter uppercase">{isListening ? "Listening..." : "Hi Rosie"}</h2>
          </div>
          <div className="space-y-4">
            {data.messages?.slice(-3).map((m, i) => (<div key={i} className={`p-6 rounded-[2.5rem] shadow-sm text-sm font-bold ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto' : 'bg-white text-gray-700'}`}>{m.text}</div>))}
          </div>
        </main>

        <nav className="absolute bottom-10 left-5 right-5 bg-white rounded-[45px] shadow-2xl p-2.5 flex justify-between items-center z-30">
            {['brain', 'hub', 'plans', 'memories', 'diaries'].map((id) => (
                <button key={id} onClick={() => setActiveTab(id)} className={`p-4 rounded-[30px] ${activeTab === id ? 'bg-[#FFF0EC] text-[#EA4335]' : 'text-gray-400'}`}>
                    {id === 'brain' ? <MessageCircle size={24}/> : id === 'hub' ? <Grid size={24}/> : id === 'plans' ? <Calendar size={24}/> : id === 'memories' ? <Camera size={24}/> : <Book size={24}/>}
                </button>
            ))}
        </nav>
      </div>
    </div>
  );
}
