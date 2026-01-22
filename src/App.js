import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, setDoc, getDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, ShoppingCart, Calendar, Mic, Sparkles, Heart, 
  Camera, Book, ArrowLeft, PenLine, Utensils, X, AlertCircle, 
  Loader2, MessageCircle, Grid, Play, Settings, Radio, Volume2, 
  MapPin, Navigation, Compass, Signal, Wifi, Battery, RefreshCw, Scan
} from 'lucide-react';

// --- CONFIGURATION ---
const APP_ID = "rosie-family-pa-v2026";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo",
  authDomain: "rosie-pa.firebaseapp.com",
  projectId: "rosie-pa",
  storageBucket: "rosie-pa.firebasestorage.app",
  messagingSenderId: "767772651557",
  appId: "1:767772651557:web:239816f833c5af7c20cfcc",
  measurementId: "G-SQCQ424EYE"
};

// Safe Environment Access for Production
const safeGetEnv = (key) => {
    try {
        if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) return import.meta.env[key];
    } catch (e) { return undefined; }
    return undefined;
};

const GEMINI_KEY = safeGetEnv('NEXT_PUBLIC_GEMINI_API_KEY');

// --- AUDIO UTILS ---
const base64ToArrayBuffer = (base64) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
};

const pcmToWav = (pcmData, sampleRate = 24000) => {
  const numChannels = 1;
  const dataSize = pcmData.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); 
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  const pcmBytes = new Uint8Array(pcmData);
  const wavBytes = new Uint8Array(buffer, 44);
  wavBytes.set(pcmBytes);
  return buffer;
};

// --- VISUAL ASSETS ---
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
      <defs>
        <pattern id="confetti-dense" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
          <circle cx="15" cy="15" r="3" fill="#8AB4F8" />
          <circle cx="85" cy="25" r="3" fill="#FF8C66" opacity="0.5" />
          <path d="M 35 45 Q 45 35 55 45" stroke="#FDE293" strokeWidth="3" fill="none" strokeLinecap="round" />
          <rect x="25" y="65" width="8" height="4" transform="rotate(-15 25 65)" fill="#EA4335" opacity="0.4" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#confetti-dense)" />
    </svg>
  </div>
);

const RosieMascot = ({ isThinking, isCelebrating, isSpeaking, onClick }) => (
  <svg onClick={onClick} viewBox="0 0 200 200" className={`w-48 h-48 mx-auto drop-shadow-xl transition-transform hover:scale-105 duration-300 cursor-pointer ${isThinking ? 'animate-pulse' : ''} ${isSpeaking ? 'animate-bounce-slow' : ''}`}>
    <path d="M100 30 C115 20, 130 20, 140 40 C155 35, 175 45, 170 70 C190 85, 190 110, 170 125 C175 150, 155 170, 130 160 C115 180, 85 180, 70 160 C45 170, 25 150, 30 125 C10 110, 10 85, 30 70 C25 45, 45 35, 60 40 C70 20, 85 20, 100 30 Z" fill="#FF6B4A" />
    <g transform="rotate(-5 100 100)">
      {isCelebrating ? (
        <>
          <path d="M 70 95 Q 78 85 86 95" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M 114 95 Q 122 85 130 95" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="78" cy="95" r="14" fill="white" />
          <circle cx="78" cy="95" r="6" fill="black" />
          <circle cx="122" cy="95" r="14" fill="white" />
          <circle cx="122" cy="95" r="6" fill="black" />
        </>
      )}
    </g>
    {isSpeaking ? (
      <circle cx="100" cy="122" r="10" fill="black" className="animate-ping" />
    ) : (
      <path d={isCelebrating ? "M 85 115 Q 100 145 115 115" : "M 85 118 Q 100 138 115 118"} stroke="black" strokeWidth="4" strokeLinecap="round" fill="none" />
    )}
  </svg>
);

export default function App() {
  const [config, setConfig] = useState(() => {
    if (GEMINI_KEY) return { gemini: GEMINI_KEY };
    try {
      const saved = localStorage.getItem('rosie_gemini_key');
      return saved ? { gemini: saved } : null;
    } catch (e) { return null; }
  });

  const [activeTab, setActiveTab] = useState('brain');
  const [data, setData] = useState({ messages: [], groceries: [], plans: [], memories: [], diary_books: [], diary_entries: [] });
  const [inputText, setInputText] = useState("");
  const [openBook, setOpenBook] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [user, setUser] = useState(null);

  // Mascot & Features
  const [rosieState, setRosieState] = useState('default');
  const [showMealPlanner, setShowMealPlanner] = useState(false);
  const [mealPlannerPrompt, setMealPlannerPrompt] = useState("");
  const [recipe, setRecipe] = useState(null);
  const [clashWarning, setClashWarning] = useState(null);
  const [calendarInput, setCalendarInput] = useState("");
  
  // Radio Station & Vision
  const [showRadioTuner, setShowRadioTuner] = useState(false);
  const [radioTopic, setRadioTopic] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [data.messages, isGenerating, openBook]);

  const getServices = useCallback(() => {
    const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
    const auth = getAuth(app);
    const db = getFirestore(app);
    return { auth, db };
  }, []);

  useEffect(() => {
    const { auth, db } = getServices();
    const initAuth = async () => {
        try {
            // Support for global token
            if (typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
                await signInWithCustomToken(auth, window.__initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }
        } catch (e) { console.error("Auth Failed", e); }
    };
    initAuth();

    const unsubAuth = auth.onAuthStateChanged((u) => setUser(u));
    const docRef = doc(db, "artifacts", APP_ID, "public", "data");
    
    const unsubData = onSnapshot(docRef, (s) => {
        if (s.exists()) setData(s.data());
        else setDoc(docRef, { messages: [], groceries: [], plans: [], memories: [], diary_books: ['My Journal'], diary_entries: [] });
    });

    return () => { unsubAuth(); unsubData(); };
  }, [getServices]);

  const sync = async (field, val, op = 'add') => {
    const { db } = getServices();
    try {
      const docRef = doc(db, "artifacts", APP_ID, "public", "data");
      await updateDoc(docRef, { [field]: op === 'add' ? arrayUnion(val) : arrayRemove(val) });
    } catch (e) { console.error("Sync Error", e); }
  };

  const handleSpeak = async (text, isRadioMode = false) => {
    if (!config?.gemini || !text) return;
    setRosieState('speaking');
    try {
      const voiceConfig = isRadioMode ? {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            { speaker: "Rosie", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
            { speaker: "Guest", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } }
          ]
        }
      } : { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } };

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${config.gemini}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: text }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: voiceConfig },
          model: "gemini-2.5-flash-preview-tts"
        })
      });
      const resJson = await res.json();
      const base64Audio = resJson.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const wavBuffer = pcmToWav(base64ToArrayBuffer(base64Audio));
        const audio = new Audio(URL.createObjectURL(new Blob([wavBuffer], { type: 'audio/wav' })));
        audio.onended = () => { setRosieState('default'); };
        await audio.play();
      } else { setRosieState('default'); }
    } catch (e) { setRosieState('default'); }
  };

  const startVoice = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) return;
    const rec = new Speech();
    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onresult = (e) => setInputText(e.results[0][0].transcript);
    rec.start();
  };

  const askRosie = async () => {
    if (!inputText.trim() || isGenerating) return;
    const userMsg = { role: 'user', text: inputText, ts: new Date().toLocaleTimeString() };
    await sync('messages', userMsg);
    const query = inputText;
    setInputText("");
    setIsGenerating(true); setRosieState('thinking');

    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: "You are Rosie, a warm family PA. Keep it concise." });
      const res = await model.generateContent(`Context: ${JSON.stringify(data)}. User: ${query}`);
      const reply = res.response.text();
      await sync('messages', { role: 'rosie', text: reply, ts: new Date().toLocaleTimeString() });
      handleSpeak(reply);
      setRosieState('celebrating');
    } catch (e) { setRosieState('default'); } 
    finally { setIsGenerating(false); setTimeout(() => setRosieState('default'), 3000); }
  };

  const handleRadioBroadcast = async () => {
    if (!config?.gemini) return;
    setIsGenerating(true); setRosieState('thinking'); setShowRadioTuner(false);
    try {
      const prompt = !radioTopic.trim() 
        ? `Short, fun radio broadcast for 'Rosie FM'. DJ Rosie updates the family on: ${data.memories.join('; ')}.`
        : `Radio podcast for 'Rosie FM' about: "${radioTopic}". Rosie (Host) and Guest (Zephyr). Use Rosie: and Guest: labels.`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${config.gemini}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const json = await res.json();
      const script = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (script) await handleSpeak(script, true);
    } catch (err) { console.error(err); } finally { setIsGenerating(false); setRadioTopic(""); }
  };

  const startCamera = async () => {
      try { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); if (videoRef.current) videoRef.current.srcObject = s; } catch (e) { setIsCameraOpen(false); }
  };
  const stopCamera = () => { if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t => t.stop()); setIsCameraOpen(false); };
  
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
              body: JSON.stringify({ contents: [{ parts: [{ text: "Extract info from this image for a family assistant." }, { inlineData: { mimeType: "image/jpeg", data: img } }] }] })
          });
          const result = await res.json();
          const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
          await sync('messages', { role: 'rosie', text, ts: new Date().toLocaleTimeString() });
          handleSpeak(text);
          stopCamera();
      } catch (e) { handleSpeak("I couldn't read that."); } finally { setIsGenerating(false); }
  };

  if (!config) return (
    <div className="min-h-screen bg-[#EA4335] p-8 flex items-center justify-center font-sans">
      <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-sm space-y-6">
        <h1 className="text-3xl font-black italic text-[#EA4335] text-center tracking-tighter">ROSIE SETUP</h1>
        <input id="gk" placeholder="Gemini API Key" className="w-full p-5 bg-gray-50 rounded-2xl outline-none font-bold" />
        <button onClick={() => { const k = document.getElementById('gk').value.trim(); if(k) { localStorage.setItem('rosie_gemini_key', k); setConfig({gemini: k}); } }} className="w-full p-5 bg-[#EA4335] text-white rounded-2xl font-black shadow-lg">INITIALIZE</button>
      </div>
    </div>
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4 font-sans select-none">
      <div className="relative w-full max-w-[390px] h-[844px] bg-[#FFF8F0] rounded-[50px] shadow-2xl overflow-hidden border-[8px] border-[#1a1a1a] flex flex-col ring-[12px] ring-[#1a1a1a]/10">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&display=swap'); .font-sans { font-family: 'Fredoka', sans-serif; } .scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
        <StatusBar />
        <ConfettiPattern />

        {/* HEADER */}
        <header className="px-7 pt-2 pb-2 z-20 flex justify-between items-center bg-[#FFF8F0]/90 backdrop-blur-md">
            <div>
              <h1 className="text-2xl font-black italic text-[#EA4335] tracking-tighter">ROSIE.</h1>
              <div className="flex items-center gap-1.5 opacity-40">
                  <div className={`w-1.5 h-1.5 rounded-full ${user ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                  <span className="text-[9px] font-black uppercase">{user ? "Synced" : "Offline"}</span>
              </div>
            </div>
            <div className="flex gap-2">
                <button onClick={() => { setIsCameraOpen(true); startCamera(); }} className="p-2.5 bg-white rounded-full shadow-md text-[#EA4335]"><Scan size={18} /></button>
                <button onClick={()=>setShowRadioTuner(true)} className="p-2.5 bg-white rounded-full shadow-md text-[#EA4335]"><Radio size={18}/></button>
                <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="p-2.5 bg-white rounded-full shadow-md"><Settings size={18} /></button>
            </div>
        </header>

        {isCameraOpen && (
            <div className="absolute inset-0 z-50 bg-black flex flex-col animate-in fade-in duration-300">
                <StatusBar />
                <div className="p-6 flex justify-between text-white"><h2 className="font-black italic text-xl">ROSIE LENS</h2><button onClick={stopCamera}><X size={28}/></button></div>
                <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                    <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
                    {isGenerating && <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-4 text-white"><RefreshCw className="animate-spin" size={40}/><p className="font-black uppercase text-xs tracking-widest text-center">Analyzing Scan...</p></div>}
                </div>
                <div className="p-12 pb-20 bg-black flex justify-center"><button onClick={captureAndAnalyze} className="w-20 h-20 bg-white rounded-full border-4 border-gray-300 flex items-center justify-center"><div className="w-16 h-16 bg-[#EA4335] rounded-full flex items-center justify-center text-white"><Scan size={32}/></div></button></div>
                <canvas ref={canvasRef} className="hidden" />
            </div>
        )}

        <main ref={scrollRef} className="flex-1 overflow-y-auto px-7 pt-4 pb-48 scrollbar-hide z-10">
          
          {showRadioTuner && (
             <div className="bg-white p-5 rounded-[25px] shadow-lg mb-6 border-l-4 border-[#EA4335] relative animate-in slide-in-from-top-4">
                <button onClick={()=>setShowRadioTuner(false)} className="absolute top-3 right-3 text-gray-300"><X size={16}/></button>
                <h3 className="text-lg font-black flex items-center gap-2 mb-1"><Radio className="text-[#EA4335]" size={18}/> Rosie FM</h3>
                <div className="flex gap-2">
                   <input className="flex-1 bg-[#FFF8F0] rounded-xl px-4 py-3 text-sm font-bold outline-none" placeholder="Topic (e.g. F1 Results)..." value={radioTopic} onChange={e=>setRadioTopic(e.target.value)} />
                   <button onClick={handleRadioBroadcast} className="bg-[#EA4335] text-white p-3 rounded-xl shadow-md active:scale-95"><Play size={20} fill="currentColor"/></button>
                </div>
             </div>
          )}

          {activeTab === 'brain' && (
            <div className="flex flex-col min-h-full">
              <div className="flex-1 flex flex-col items-center justify-center py-10">
                 <RosieMascot isThinking={rosieState === 'thinking'} isCelebrating={rosieState === 'celebrating'} isSpeaking={rosieState === 'speaking'} onClick={() => setRosieState('celebrating')} />
                 <h2 className="text-xl font-black text-[#2D2D2D] mt-6 text-center leading-tight uppercase">HI I'M ROSIE!<br/>HAVE THE BEST DAY EVER!!</h2>
              </div>
              <div className="space-y-4">
                {data.messages?.slice(-3).map((m, i) => (
                  <div key={i} className={`p-5 rounded-[2rem] shadow-sm text-sm font-bold ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto rounded-tr-none max-w-[85%]' : 'bg-white text-gray-700 rounded-tl-none max-w-[90%]'}`}>
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'hub' && (
            <div className="space-y-4 pt-4">
               <h2 className="text-xl font-black flex items-center gap-2 uppercase tracking-tighter"><ShoppingCart className="text-[#EA4335]"/> Shopping List</h2>
               {data.groceries?.map((it, i) => (
                   <div key={i} className="flex justify-between items-center p-5 bg-white rounded-3xl shadow-sm border border-white/50">
                     <span className="font-bold text-sm text-[#2D2D2D]">{it}</span>
                     <button onClick={() => sync('groceries', it, 'remove')} className="text-gray-200"><Trash2 size={18}/></button>
                   </div>
               ))}
               <div className="flex gap-2 pt-4">
                  <input id="hi" className="flex-1 p-4 rounded-xl border-none shadow-xl bg-white font-bold text-sm" placeholder="Add item..." />
                  <button onClick={() => { const el = document.getElementById('hi'); if(el.value) {sync('groceries', el.value); el.value='';} }} className="p-4 bg-[#EA4335] text-white rounded-xl shadow-xl"><Plus size={20}/></button>
               </div>
            </div>
          )}

          {activeTab === 'plans' && (
            <div className="space-y-4 pt-4">
              <h2 className="text-xl font-black flex items-center gap-2 uppercase tracking-tighter"><Calendar className="text-[#8AB4F8]"/> Schedule</h2>
              {data.plans?.map((p, i) => (
                <div key={i} className="p-5 bg-white rounded-3xl border-l-[8px] border-[#8AB4F8] flex justify-between shadow-sm">
                    <span className="font-bold text-sm text-[#2D2D2D]">{p}</span>
                    <button onClick={() => sync('plans', p, 'remove')} className="text-gray-200"><Trash2 size={18}/></button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'memories' && (
            <div className="space-y-4 pt-4">
              <h2 className="text-xl font-black flex items-center gap-2 uppercase tracking-tighter"><Camera className="text-[#EA4335]"/> Memories</h2>
              <div className="grid grid-cols-2 gap-3">
                  {data.memories?.map((m, i) => (
                      <div key={i} className="aspect-square bg-white rounded-2xl p-4 flex flex-col justify-between shadow-sm relative border border-white/50">
                          <Heart size={14} className="text-[#EA4335]" fill="#EA4335" />
                          <p className="text-[11px] font-black leading-tight text-[#2D2D2D]">{m}</p>
                          <button onClick={() => sync('memories', m, 'remove')} className="absolute bottom-2 right-2 text-gray-100"><Trash2 size={14}/></button>
                      </div>
                  ))}
              </div>
            </div>
          )}

          {activeTab === 'diaries' && (
            <div className="space-y-4 pt-4 h-full flex flex-col">
              {!openBook ? (
                <>
                  <h2 className="text-xl font-black flex items-center gap-2 uppercase tracking-tighter"><Book className="text-[#EA4335]"/> Diaries</h2>
                  <div className="grid grid-cols-2 gap-4">
                    {data.diary_books?.map((book, i) => (
                      <button key={i} onClick={() => setOpenBook(book)} className="aspect-[3/4] bg-white rounded-r-2xl rounded-l-md border-l-8 border-l-[#EA4335] shadow-sm p-4 flex flex-col justify-between hover:scale-105 transition-transform text-left group border border-white/20">
                        <span className="font-black text-xl leading-tight break-words text-[#2D2D2D]">{book}</span>
                        <span className="text-[10px] text-gray-300 font-black">OPEN</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <button onClick={() => setOpenBook(null)} className="p-2 bg-white rounded-full shadow-sm"><ArrowLeft size={20}/></button>
                    <h2 className="font-black text-xl truncate">{openBook}</h2>
                  </div>
                  <div className="flex-1 space-y-4 overflow-y-auto mb-20 scrollbar-hide">
                    {data.diary_entries?.filter(e => e.book === openBook).map((entry, i) => (
                      <div key={i} className="bg-white p-5 rounded-[1.5rem] shadow-sm relative border border-white/50">
                        <p className="text-sm font-bold leading-relaxed font-serif text-gray-700">{entry.text}</p>
                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50 uppercase tracking-widest text-[9px] font-black text-gray-300">{entry.ts}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 py-4 absolute bottom-28 w-[calc(100%-56px)] z-20">
                    <input id="entry-in" className="flex-1 p-4 rounded-2xl border-none shadow-xl font-bold bg-white text-sm" placeholder="Dear Diary..." />
                    <button onClick={() => { 
                      const el = document.getElementById('entry-in'); 
                      if(el.value.trim()) {
                        sync('diary_entries', { book: openBook, text: el.value.trim(), ts: new Date().toLocaleString() }); 
                        el.value='';
                      } 
                    }} className="p-4 bg-[#EA4335] text-white rounded-2xl shadow-lg"><PenLine size={24}/></button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* INPUT AREA */}
        {activeTab === 'brain' && (
          <div className="px-6 pb-28 z-20 absolute bottom-0 w-full bg-gradient-to-t from-[#FFF8F0] via-[#FFF8F0] pt-12 pointer-events-none">
            <div className="bg-white rounded-[35px] p-2 pl-4 pr-2 flex items-center shadow-2xl mb-2 pointer-events-auto border border-white/50">
              <button onClick={startVoice} className={`p-2 rounded-full ${isListening ? 'text-[#EA4335] animate-pulse' : 'text-gray-400'}`}><Mic size={20} /></button>
              <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && askRosie()} placeholder="Ask Rosie..." className="flex-1 bg-transparent outline-none text-sm font-bold ml-2 text-[#2D2D2D]" />
              <button onClick={askRosie} disabled={isGenerating} className="w-12 h-12 bg-[#EA4335] rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform">
                {isGenerating ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>}
              </button>
            </div>
          </div>
        )}

        {/* NAVIGATION */}
        <div className="px-6 pb-9 z-30 absolute bottom-0 w-full">
          <nav className="bg-white rounded-[35px] shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-2 flex justify-between items-center border border-white/60 backdrop-blur-xl">
            {[ {id:'brain', icon:MessageCircle, label: 'Chat'}, {id:'hub', icon:Grid, label: 'Hub'}, {id:'plans', icon:Calendar, label: 'Plan'}, {id:'memories', icon:Camera, label: 'Pics'}, {id:'diaries', icon:Book, label: 'Log'} ].map(({id, icon:Icon, label}) => (
              <button key={id} onClick={() => {setActiveTab(id); setOpenBook(null);}} className={`flex flex-col items-center justify-center w-14 py-3 rounded-[28px] transition-all duration-300 ${activeTab === id ? 'bg-[#FFF0EC] -translate-y-2' : 'bg-transparent active:scale-95'}`}>
                <Icon size={24} className={`${activeTab === id ? 'text-[#EA4335]' : 'text-gray-400'}`} strokeWidth={activeTab === id ? 3 : 2} />
                <span className={`text-[9px] font-black uppercase tracking-tight mt-1 ${activeTab === id ? 'text-[#EA4335]' : 'text-gray-400'}`}>{label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="absolute bottom-1.5 left-0 right-0 flex justify-center z-50 pointer-events-none">
            <div className="w-36 h-1.5 bg-[#2D2D2D]/20 rounded-full"></div>
        </div>
      </div>
    </div>
  );
}
