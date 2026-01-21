import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Plus, Trash2, Radio, Send, ShoppingCart, Calendar, Book, Mic } from 'lucide-react';

const DOC_PATH = ["artifacts", "rosie-family-pa-v2026", "public", "data"];

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
      const result = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent(query);
      await sync('messages', { role: 'rosie', text: result.response.text(), ts: new Date().toLocaleTimeString() });
    } catch (e) { console.error("AI Failure:", e); }
    setIsGenerating(false);
  };

  if (!config) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#EA4335] p-6 text-white text-center">
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
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex justify-between items-center">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2">
          <Icon size={14} /> {title}
        </h2>
        <span className="text-[10px] font-bold bg-[#EA4335]/10 text-[#EA4335] px-2 py-0.5 rounded-full">{items?.length || 0}</span>
      </div>
      <div className="space-y-3 flex-1 overflow-y-auto">
        {items?.map((item, i) => (
          <div key={i} className="flex justify-between items-center p-4 bg-white rounded-2xl shadow-sm group">
            <span className="font-bold text-sm">{item}</span>
            <button onClick={() => sync(field, item, 'remove')} className="text-[#EA4335] p-1"><Trash2 size={18} /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-4">
        <input id={`${field}-input`} className="flex-1 p-4 rounded-2xl shadow-inner bg-white text-sm" placeholder={placeholder} onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target.value.trim()) { sync(field, e.target.value.trim()); e.target.value = ''; }
        }} />
        <button onClick={() => { const el = document.getElementById(`${field}-input`); if (el.value.trim()) { sync(field, el.value.trim()); el.value = ''; }}} className="p-4 bg-[#EA4335] text-white rounded-2xl shadow-xl"><Plus size={24} /></button>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-[#FFF8F0] h-[100dvh] flex flex-col font-sans antialiased text-[#202124]">
      <header className="p-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black italic tracking-tighter">ROSIE.</h1>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#EA4335]">
            <span className="w-1.5 h-1.5 bg-[#EA4335] rounded-full animate-pulse" /> LIVE_UPLINK
          </div>
        </div>
        <button className="p-3 bg-white rounded-full shadow-lg text-[#EA4335]"><Radio size={24} /></button>
      </header>

      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'brain' && (
          <div className="space-y-4">
            {data.messages?.map((m, i) => (
              <div key={i} className={`p-4 rounded-2xl relative group shadow-sm max-w-[90%] ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto' : 'bg-white'}`}>
                <p className="text-sm font-medium leading-relaxed">{m.text}</p>
                <button onClick={() => sync('messages', m, 'remove')} className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-gray-300 hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'hub' && <Section title="Inventory" icon={ShoppingCart} items={data.groceries} field="groceries" placeholder="Add grocery..." />}
        {activeTab === 'plans' && <Section title="Schedule" icon={Calendar} items={data.plans} field="plans" placeholder="Add event..." />}
        {activeTab === 'notebook' && <Section title="Memories" icon={Book} items={data.memories} field="memories" placeholder="Save a note..." />}
      </main>

      <footer className="p-6 bg-white border-t border-gray-100">
        {activeTab === 'brain' && (
          <div className="mb-6 flex gap-2">
            <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAiChat()} placeholder="Ask Rosie..." className="flex-1 p-4 bg-gray-100 rounded-full text-sm outline-none" />
            <button onClick={handleAiChat} className="p-4 bg-[#EA4335] text-white rounded-full shadow-lg"><Send size={20} /></button>
          </div>
        )}
        <nav className="flex justify-around items-center">
          <button onClick={() => setActiveTab('brain')} className={activeTab === 'brain' ? "text-[#EA4335]" : "text-gray-300"}><Mic size={28} /></button>
          <button onClick={() => setActiveTab('hub')} className={activeTab === 'hub' ? "text-[#EA4335]" : "text-gray-300"}><ShoppingCart size={28} /></button>
          <button onClick={() => setActiveTab('plans')} className={activeTab === 'plans' ? "text-[#EA4335]" : "text-gray-300"}><Calendar size={28} /></button>
          <button onClick={() => setActiveTab('notebook')} className={activeTab === 'notebook' ? "text-[#EA4335]" : "text-gray-300"}><Book size={28} /></button>
        </nav>
      </footer>
    </div>
  );
}
