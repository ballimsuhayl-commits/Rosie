import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Plus, Trash2, Radio, Send, ShoppingCart, Calendar, Book, Mic, Settings, Copy, RefreshCw, Volume2, Camera } from 'lucide-react';

const DOC_PATH = ["artifacts", "rosie-family-pa-v2026", "public", "data"];
const APP_URL = window.location.origin;

export default function App() {
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('rosie_config');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [activeTab, setActiveTab] = useState('brain');
  const [data, setData] = useState({ messages: [], groceries: [], plans: [], memories: [] });
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const getDb = useCallback(() => {
    if (!config?.firebase) return null;
    const app = getApps().length === 0 ? initializeApp(config.firebase) : getApp();
    return getFirestore(app);
  }, [config]);

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const docRef = doc(db, ...DOC_PATH);
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) setData(snap.data());
    }, (err) => console.error("Sync Failure:", err));
  }, [getDb]);

  const sync = async (field, value, op = 'add') => {
    const db = getDb();
    if (!db) return;
    try {
      const docRef = doc(db, ...DOC_PATH);
      await updateDoc(docRef, { [field]: op === 'add' ? arrayUnion(value) : arrayRemove(value) });
    } catch (e) { console.error("Update Failure:", e); }
  };

  const speak = (text) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const handleRadio = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      // UPGRADED TO GEMINI 2.0 FLASH
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const prompt = `You are Rosie, a warm family PA. Create a 30-second spoken briefing. 
      Groceries: ${data.groceries.join(", ")}. 
      Schedule: ${data.plans.join(", ")}. 
      Mention if we need to prep anything for the kids or soccer. Use a helpful, cheerful tone.`;
      
      const result = await model.generateContent(prompt);
      speak(result.response.text());
    } catch (e) { 
      speak("Brain connection stuttered, but I'm still here.");
    }
    setIsGenerating(false);
  };

  const handleAiChat = async () => {
    if (!inputText.trim() || isGenerating) return;
    const query = inputText.trim();
    setInputText("");
    setIsGenerating(true);
    await sync('messages', { role: 'user', text: query, ts: new Date().toLocaleTimeString() });

    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      // UPGRADED TO GEMINI 2.0 FLASH
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(`Context: ${JSON.stringify(data)}. User: ${query}. Respond as Rosie.`);
      await sync('messages', { role: 'rosie', text: result.response.text(), ts: new Date().toLocaleTimeString() });
    } catch (e) { console.error("AI Failure:", e); }
    setIsGenerating(false);
  };

  if (!config) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#EA4335] p-6 text-white text-center font-sans">
      <h1 className="text-4xl font-black mb-6 uppercase italic">Mount Rosie.</h1>
      <form onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const cfg = { gemini: fd.get('g'), firebase: JSON.parse(fd.get('f')) };
        localStorage.setItem('rosie_config', JSON.stringify(cfg));
        setConfig(cfg);
      }} className="w-full max-w-xs space-y-4">
        <input name="g" placeholder="Gemini API Key" className="w-full p-4 rounded-2xl text-black outline-none" required />
        <textarea name="f" placeholder="Firebase JSON" className="w-full p-4 rounded-2xl text-black h-40 font-mono text-xs outline-none" required />
        <button className="w-full p-4 bg-black rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-transform">Initialize</button>
      </form>
    </div>
  );

  const Section = ({ title, icon: Icon, items, field, placeholder }) => (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2">
          <Icon size={14} /> {title}
        </h2>
        <span className="text-[10px] font-bold bg-[#EA4335]/10 text-[#EA4335] px-2 py-0.5 rounded-full">{items?.length || 0}</span>
      </div>
      <div className="space-y-3 flex-1 overflow-y-auto pb-20">
        {items?.map((item, i) => (
          <div key={i} className="flex justify-between items-center p-4 bg-white rounded-2xl shadow-sm border border-gray-50">
            <span className="font-bold text-sm">{item}</span>
            <button onClick={() => sync(field, item, 'remove')} className="text-[#EA4335] p-1"><Trash2 size={18} /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 p-4 fixed bottom-24 left-0 right-0 max-w-md mx-auto z-20">
        <input id={`${field}-input`} className="flex-1 p-4 rounded-2xl shadow-xl bg-white text-sm outline-none border-none focus:ring-2 focus:ring-[#EA4335]" placeholder={placeholder} onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target.value.trim()) { sync(field, e.target.value.trim()); e.target.value = ''; }
        }} />
        <button onClick={() => { const el = document.getElementById(`${field}-input`); if (el.value.trim()) { sync(field, el.value.trim()); el.value = ''; }}} className="p-4 bg-[#EA4335] text-white rounded-2xl shadow-xl active:scale-90 transition-transform"><Plus size={24} /></button>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-[#FFF8F0] h-[100dvh] flex flex-col font-sans antialiased text-[#202124] overflow-hidden">
      <header className="p-6 flex justify-between items-center bg-white/70 backdrop-blur-md z-30">
        <div>
          <h1 className="text-2xl font-black italic tracking-tighter leading-none">ROSIE.</h1>
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#EA4335] mt-1">
            <span className={`w-1.5 h-1.5 bg-[#EA4335] rounded-full ${isSpeaking ? 'animate-ping' : 'animate-pulse'}`} />
            {isSpeaking ? 'GEMINI_2.0_VOCAL' : 'GEMINI_2.0_READY'}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('settings')} className={`p-3 rounded-full transition-all ${activeTab === 'settings' ? 'bg-[#EA4335] text-white shadow-lg' : 'bg-white text-gray-400 shadow-sm'}`}>
            <Settings size={20} />
          </button>
          <button onClick={handleRadio} className={`p-3 rounded-full shadow-lg transition-all ${isSpeaking ? 'bg-[#EA4335] text-white animate-pulse' : 'bg-white text-[#EA4335]'}`}>
            {isSpeaking ? <Volume2 size={20} /> : <Radio size={20} />}
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'brain' && (
          <div className="space-y-4 pb-24">
            {data.messages?.map((m, i) => (
              <div key={i} className={`p-4 rounded-2xl relative group shadow-sm max-w-[90%] animate-in slide-in-from-bottom-2 ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                <p className="text-sm font-medium leading-relaxed">{m.text}</p>
                <button onClick={() => sync('messages', m, 'remove')} className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-gray-300 hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'hub' && <Section title="Shopping List" icon={ShoppingCart} items={data.groceries} field="groceries" placeholder="Add to list..." />}
        {activeTab === 'plans' && <Section title="Calendar" icon={Calendar} items={data.plans} field="plans" placeholder="Schedule event..." />}
        {activeTab === 'notebook' && <Section title="Shared Notes" icon={Book} items={data.memories} field="memories" placeholder="Save memory..." />}

        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in zoom-in-95 duration-300 text-center">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100">
               <div className="inline-block p-4 bg-[#FFF8F0] rounded-3xl mb-4">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${APP_URL}`} alt="Invite" className="w-40 h-40 mix-blend-multiply" />
              </div>
              <h3 className="font-black text-xl tracking-tighter">Onboard Family</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6 italic">Gemini 2.0 Flash Active</p>
              <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(config)); alert("Config Copied!"); }} className="w-full flex items-center justify-center gap-2 p-4 bg-gray-50 rounded-2xl font-bold text-xs"><Copy size={16} /> Copy Config</button>
              <button onClick={() => { localStorage.removeItem('rosie_config'); window.location.reload(); }} className="w-full mt-4 text-red-500 font-black text-[10px] uppercase tracking-widest"><RefreshCw size={12} /> Reset System</button>
            </div>
          </div>
        )}
      </main>

      <footer className="p-6 bg-white/80 backdrop-blur-xl border-t border-gray-100 z-40">
        {activeTab === 'brain' && (
          <div className="mb-6 flex gap-2">
            <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAiChat()} placeholder="Ask Rosie anything..." className="flex-1 p-4 bg-gray-100 rounded-full text-sm outline-none" />
            <button onClick={handleAiChat} className="p-4 bg-[#EA4335] text-white rounded-full shadow-lg"><Send size={20} /></button>
          </div>
        )}
        <nav className="flex justify-around items-center">
          <button onClick={() => setActiveTab('brain')} className={`transition-all ${activeTab === 'brain' ? "text-[#EA4335] scale-125" : "text-gray-300"}`}><Mic size={28} strokeWidth={2.5} /></button>
          <button onClick={() => setActiveTab('hub')} className={`transition-all ${activeTab === 'hub' ? "text-[#EA4335] scale-125" : "text-gray-300"}`}><ShoppingCart size={28} strokeWidth={2.5} /></button>
          <button onClick={() => setActiveTab('plans')} className={`transition-all ${activeTab === 'plans' ? "text-[#EA4335] scale-125" : "text-gray-300"}`}><Calendar size={28} strokeWidth={2.5} /></button>
          <button onClick={() => setActiveTab('notebook')} className={`transition-all ${activeTab === 'notebook' ? "text-[#EA4335] scale-125" : "text-gray-300"}`}><Book size={28} strokeWidth={2.5} /></button>
        </nav>
      </footer>
    </div>
  );
}
