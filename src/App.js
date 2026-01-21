import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Plus, Trash2, Radio, Send, ShoppingCart, Calendar, Book, Mic, Settings, Copy, RefreshCw } from 'lucide-react';

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

  const handleAiChat = async () => {
    if (!inputText.trim() || isGenerating) return;
    const query = inputText.trim();
    setInputText("");
    setIsGenerating(true);
    await sync('messages', { role: 'user', text: query, ts: new Date().toLocaleTimeString() });

    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `You are Rosie, a helpful family assistant. Context: ${JSON.stringify(data)}. User says: ${query}`;
      const result = await model.generateContent(prompt);
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
        <input name="g" placeholder="Gemini API Key" className="w-full p-4 rounded-2xl text-black outline-none shadow-xl" required />
        <textarea name="f" placeholder="Firebase JSON" className="w-full p-4 rounded-2xl text-black h-40 font-mono text-xs outline-none shadow-xl" required />
        <button className="w-full p-4 bg-black rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-transform shadow-2xl">Initialize System</button>
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
          <div key={i} className="flex justify-between items-center p-4 bg-white rounded-2xl shadow-sm border border-gray-50 group hover:border-[#EA4335]/20 transition-all">
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
            <span className="w-1.5 h-1.5 bg-[#EA4335] rounded-full animate-pulse" /> UPLINK_STABLE
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('settings')} className={`p-3 rounded-full transition-all ${activeTab === 'settings' ? 'bg-[#EA4335] text-white shadow-lg' : 'bg-white text-gray-400 shadow-sm'}`}>
            <Settings size={20} />
          </button>
          <button onClick={() => alert("Daily Briefing Generation Logic Coming Soon...")} className="p-3 bg-white rounded-full shadow-lg text-[#EA4335] active:scale-95"><Radio size={20} /></button>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'brain' && (
          <div className="space-y-4 pb-24">
            {data.messages?.map((m, i) => (
              <div key={i} className={`p-4 rounded-2xl relative group shadow-sm max-w-[90%] animate-in slide-in-from-bottom-2 duration-300 ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                <p className="text-sm font-medium leading-relaxed">{m.text}</p>
                <button onClick={() => sync('messages', m, 'remove')} className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-gray-300 hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            ))}
            {isGenerating && <div className="text-[10px] font-black text-gray-300 animate-pulse uppercase tracking-widest pl-2">Syncing with Brain...</div>}
          </div>
        )}

        {activeTab === 'hub' && <Section title="Inventory" icon={ShoppingCart} items={data.groceries} field="groceries" placeholder="Need something?..." />}
        {activeTab === 'plans' && <Section title="Family Calendar" icon={Calendar} items={data.plans} field="plans" placeholder="Add event..." />}
        {activeTab === 'notebook' && <Section title="Shared Notes" icon={Book} items={data.memories} field="memories" placeholder="Save a thought..." />}

        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in zoom-in-95 duration-300">
            <div className="bg-white p-6 rounded-[2.5rem] shadow-xl text-center border border-gray-50">
              <div className="inline-block p-4 bg-[#FFF8F0] rounded-3xl mb-4 border-2 border-[#EA4335]/10">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${APP_URL}`} alt="Invite" className="w-40 h-40 mix-blend-multiply" />
              </div>
              <h3 className="font-black text-xl tracking-tighter">Onboard Family</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6">Scan to sync Mum's phone</p>
              
              <div className="space-y-3">
                <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(config)); alert("Config Copied! WhatsApp this to Mum."); }} className="w-full flex items-center justify-center gap-2 p-4 bg-gray-50 rounded-2xl font-bold text-xs hover:bg-gray-100 transition-all border border-gray-100"><Copy size={16} /> Copy Setup Payload</button>
                <button onClick={() => { localStorage.removeItem('rosie_config'); window.location.reload(); }} className="w-full flex items-center justify-center gap-2 p-4 text-red-500 font-black text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all"><RefreshCw size={14} /> Factory Reset App</button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="p-6 bg-white/80 backdrop-blur-xl border-t border-gray-100 z-40">
        {activeTab === 'brain' && (
          <div className="mb-6 flex gap-2 animate-in slide-in-from-bottom-2">
            <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAiChat()} placeholder="Command Rosie..." className="flex-1 p-4 bg-gray-100 rounded-full text-sm outline-none border-none focus:ring-2 focus:ring-[#EA4335] shadow-inner" />
            <button onClick={handleAiChat} className="p-4 bg-[#EA4335] text-white rounded-full shadow-lg active:scale-90 transition-transform"><Send size={20} /></button>
          </div>
        )}
        <nav className="flex justify-around items-center">
          <button onClick={() => setActiveTab('brain')} className={`transition-all duration-300 ${activeTab === 'brain' ? "text-[#EA4335] scale-125 shadow-sm" : "text-gray-300 hover:text-gray-400"}`}><Mic size={28} strokeWidth={2.5} /></button>
          <button onClick={() => setActiveTab('hub')} className={`transition-all duration-300 ${activeTab === 'hub' ? "text-[#EA4335] scale-125" : "text-gray-300 hover:text-gray-400"}`}><ShoppingCart size={28} strokeWidth={2.5} /></button>
          <button onClick={() => setActiveTab('plans')} className={`transition-all duration-300 ${activeTab === 'plans' ? "text-[#EA4335] scale-125" : "text-gray-300 hover:text-gray-400"}`}><Calendar size={28} strokeWidth={2.5} /></button>
          <button onClick={() => setActiveTab('notebook')} className={`transition-all duration-300 ${activeTab === 'notebook' ? "text-[#EA4335] scale-125" : "text-gray-300 hover:text-gray-400"}`}><Book size={28} strokeWidth={2.5} /></button>
        </nav>
      </footer>
    </div>
  );
}
