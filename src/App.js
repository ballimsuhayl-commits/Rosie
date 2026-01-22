import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, setDoc, getDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, ShoppingCart, Calendar, Mic, Sparkles, Heart, 
  Camera, Book, ArrowLeft, PenLine, Utensils, X, AlertCircle, 
  Loader2, MessageCircle, Grid, Play, Settings, WifiOff, Wifi,
  DollarSign, Tag, Podcast, Volume2, MapPin, Navigation, Compass,
  Ear, Scan, RefreshCw, Signal
} from 'lucide-react';

const safeGetEnv = (key) => {
    try {
        if (typeof process !== 'undefined' && process.env) return process.env[key];
        if (typeof import.meta !== 'undefined' && import.meta.env) return import.meta.env[key];
    } catch (e) { return undefined; }
    return undefined;
};

const FIREBASE_CONFIG = {
  apiKey: safeGetEnv('NEXT_PUBLIC_FIREBASE_API_KEY') || "AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo",
  authDomain: safeGetEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN') || "rosie-pa.firebaseapp.com",
  projectId: safeGetEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID') || "rosie-pa",
  storageBucket: safeGetEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET') || "rosie-pa.firebasestorage.app",
  messagingSenderId: safeGetEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') || "767772651557",
  appId: safeGetEnv('NEXT_PUBLIC_FIREBASE_APP_ID') || "1:767772651557:web:239816f833c5af7c20cfcc",
  measurementId: safeGetEnv('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID') || "G-SQCQ424EYE"
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
  const [isOffline, setIsOffline] = useState(false);
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
    const { auth, db } = getServices();
    signInAnonymously(auth).then(() => setIsOffline(false)).catch(() => setIsOffline(true));
    const unsubAuth = auth.onAuthStateChanged((u) => setUser(u));
    let unsubData = () => {};
    if (user) {
        unsubData = onSnapshot(doc(db, "artifacts", APP_ID, "public", "data"), (s) => {
            if (s.exists()) setData(s.data());
            else setDoc(doc(db, "artifacts", APP_ID, "public", "data"), { messages: [], groceries: [], plans: [], memories: [], diary_books: ['Journal'], diary_entries: [], price_estimates: {} });
        });
    }
    return () => { unsubAuth(); unsubData(); };
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
        handleSpeak("Sure, opening my lens.");
        setIsCameraOpen(true);
        startCamera();
        return;
    }
    await sync('messages', { role: 'user', text, ts: new Date().toLocaleTimeString() });
    setIsGenerating(true); setRosieState('thinking');
    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash", 
        systemInstruction: `You are Rosie, a warm Alexa-style PA. Fast, visual, and smart.` 
      });
      const res = await model.generateContent(text);
      const reply = res.response.text();
      if (reply.includes('"type": "navigation"')) {
          const nav = JSON.parse(reply.match(/\{[\s\S]*\}/)[0]);
          setNavData({ ...nav, mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(nav.destination)}` });
          setCurrentNavStep(0);
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
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) { setIsCameraOpen(false); }
  };

  const captureAndAnalyze = async () => {
      if (!videoRef.current || !canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0);
      const img = canvasRef.current.toDataURL('image/jpeg', 0.8).split(',')[1];
      setIsGenerating(true); setRosieState('thinking');
      try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${config.gemini}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: "Extract info for a family PA." }, { inlineData: { mimeType: "image/jpeg", data: img } }] }] })
          });
          const result = await res.json();
          const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
          await sync('messages', { role: 'rosie', text, ts: new Date().toLocaleTimeString() });
          handleSpeak(text);
          stopCamera();
      } catch (e) { handleSpeak("I couldn't read that."); } finally { setIsGenerating(false); }
  };

  const stopCamera = () => {
      if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      setIsCameraOpen(false);
  };

  if (!config?.gemini) return (
      <div className="min-h-screen bg-[#EA4335] flex items-center justify-center p-6 font-sans">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-sm space-y-6">
              <h1 className="text-3xl font-black italic text-[#EA4335] text-center tracking-tighter">ROSIE SETUP</h1>
              <input id="gk" placeholder="Gemini API Key" className="w-full p-5 bg-gray-50 rounded-2xl outline-none font-bold" />
              <button onClick={() => {
                  const k = document.getElementById('gk').value.trim();
                  localStorage.setItem('rosie_gemini_key', k);
                  setConfig({ gemini: k });
              }} className="w-full p-5 bg-[#EA4335] text-white rounded-2xl font-black shadow-lg">INITIALIZE</button>
          </div>
      </div>
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4 font-sans select-none cursor-default">
      <div className="relative w-full max-w-[390px] h-[844px] bg-[#FFF8F0] rounded-[50px] shadow-2xl overflow-hidden border-[8px] border-[#1a1a1a] flex flex-col ring-[12px] ring-[#1a1a1a]/10">
        <StatusBar />
        <header className="px-7 pt-2 pb-2 z-20 flex justify-between items-center sticky top-0 bg-[#FFF8F0]/90 backdrop-blur-md">
            <div>
                <h1 className="text-2xl font-black italic text-[#EA4335] tracking-tighter">ROSIE.</h1>
                <div className="flex items-center gap-1.5 opacity-40"><div className={`w-1.5 h-1.5 rounded-full ${isWakeWordActive ? 'bg-green-500' : 'bg-gray-400'}`}></div><span className="text-[9px] font-black uppercase">{isWakeWordActive ? "Listening" : "Ready"}</span></div>
            </div>
            <div className="flex gap-2">
                <button onClick={() => { setIsCameraOpen(true); startCamera(); }} className="p-2.5 bg-white rounded-full shadow-md text-[#EA4335]"><Scan size={18} /></button>
                <button onClick={() => { setIsWakeWordActive(!isWakeWordActive); if(!isWakeWordActive) startWakeWordListener(); else recognitionRef.current?.stop(); }} className={`p-2.5 rounded-full shadow-md transition-all ${isWakeWordActive ? 'bg-[#EA4335] text-white' : 'bg-white text-gray-400'}`}><Mic size={18} /></button>
                <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="p-2.5 bg-white rounded-full shadow-md"><Settings size={18} /></button>
            </div>
        </header>

        {isCameraOpen && (
            <div className="absolute inset-0 z-50 bg-black flex flex-col">
                <StatusBar />
                <div className="p-6 flex justify-between text-white"><h2 className="font-black italic text-xl">ROSIE LENS</h2><button onClick={stopCamera}><X size={28}/></button></div>
                <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                    <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
                    {isGenerating && <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-4 text-white"><RefreshCw className="animate-spin" size={40}/><p className="font-black uppercase text-xs tracking-widest">Analyzing Scan...</p></div>}
                </div>
                <div className="p-12 pb-20 bg-black flex justify-center"><button onClick={captureAndAnalyze} className="w-20 h-20 bg-white rounded-full border-4 border-gray-300 flex items-center justify-center"><div className="w-16 h-16 bg-[#EA4335] rounded-full flex items-center justify-center text-white"><Scan size={32}/></div></button></div>
                <canvas ref={canvasRef} className="hidden" />
            </div>
        )}

        <main ref={scrollRef} className="flex-1 overflow-y-auto px-7 pt-4 pb-48 scrollbar-hide z-10">
          {navData && (
              <div className="bg-white rounded-[32px] p-6 shadow-xl border-b-[8px] border-[#EA4335] mb-6 animate-in slide-in-from-top-4">
                  <div className="flex justify-between items-start mb-4"><div className="flex items-center gap-3"><Navigation className="text-[#EA4335]" size={24}/><h3 className="font-black text-lg text-[#2D2D2D] leading-none truncate w-44">{navData.destination}</h3></div><button onClick={()=>setNavData(null)}><X size={20} className="text-gray-300"/></button></div>
                  <div className="bg-[#FFF8F0] p-4 rounded-2xl mb-5 border border-orange-100"><p className="text-sm font-bold text-gray-700 leading-tight">{navData.steps[currentNavStep]}</p></div>
                  <div className="flex gap-2">
                    <button onClick={() => { handleSpeak(navData.steps[currentNavStep]); if(currentNavStep < navData.steps.length - 1) setCurrentNavStep(s => s+1); }} className="flex-1 py-4 bg-[#EA4335] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95"><Volume2 size={18}/> {currentNavStep === navData.steps.length - 1 ? "Finish" : "Next"}</button>
                    <button onClick={() => window.open(navData.mapsUrl, '_blank')} className="px-6 bg-blue-500 text-white rounded-2xl shadow-xl flex items-center justify-center"><MapPin size={22}/></button>
                  </div>
              </div>
          )}

          <div className="flex flex-col items-center justify-center py-10">
              <div className={`w-40 h-40 bg-[#FF6B4A] rounded-[40px] flex items-center justify-center shadow-2xl ${rosieState === 'thinking' ? 'animate-pulse' : ''} ${rosieState === 'speaking' ? 'animate-bounce' : ''}`}>
                  <div className="flex gap-5"><div className="w-4 h-4 bg-white rounded-full"></div><div className="w-4 h-4 bg-white rounded-full"></div></div>
              </div>
              <h2 className="text-3xl font-black mt-8 tracking-tighter uppercase text-center">{isListening ? "Listening..." : "Hi Rosie"}</h2>
          </div>

          <div className="space-y-4">
            {data.messages?.slice(-3).map((m, i) => (
                <div key={i} className={`p-6 rounded-[2.5rem] shadow-sm text-sm font-bold ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto rounded-tr-none max-w-[85%]' : 'bg-white text-gray-700 rounded-tl-none max-w-[90%]'}`}>
                    <div className="leading-relaxed">{m.text}</div>
                </div>
            ))}
          </div>
        </main>

        <div className="px-6 pb-36 z-20 absolute bottom-0 w-full bg-gradient-to-t from-[#FFF8F0] pt-12 pointer-events-none">
            <div className="bg-white rounded-[35px] p-2 pl-5 pr-2 flex items-center shadow-2xl mb-2 pointer-events-auto border border-white/50">
              <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && processCommand(inputText)} placeholder="Ask Rosie..." className="flex-1 bg-transparent outline-none text-sm font-bold text-[#2D2D2D] placeholder:text-gray-300" />
              <button onClick={() => processCommand(inputText)} disabled={isGenerating} className="w-12 h-12 bg-[#EA4335] rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform">{isGenerating ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>}</button>
            </div>
        </div>

        <nav className="absolute bottom-10 left-5 right-5 bg-white rounded-[45px] shadow-2xl p-2.5 flex justify-between items-center z-30 border border-white/60 backdrop-blur-xl">
            {[ {id:'brain', icon:MessageCircle}, {id:'hub', icon:Grid}, {id:'plans', icon:Calendar}, {id:'memories', icon:Camera}, {id:'diaries', icon:Book} ].map((item) => (
                <button key={item.id} onClick={() => setActiveTab(item.id)} className={`p-4 rounded-[30px] transition-all ${activeTab === item.id ? 'bg-[#FFF0EC] text-[#EA4335] shadow-inner -translate-y-1' : 'text-gray-400'}`}>
                    <item.icon size={24} strokeWidth={activeTab === item.id ? 3 : 2} />
                </button>
            ))}
        </nav>
        <div className="absolute bottom-1.5 left-0 right-0 flex justify-center z-50"><div className="w-32 h-1.5 bg-[#2D2D2D]/10 rounded-full"></div></div>
      </div>
    </div>
  );
}
