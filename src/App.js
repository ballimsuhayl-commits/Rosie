import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Plus, Trash2, Radio, Send, ShoppingCart, Calendar, Mic } from 'lucide-react';

// Immutable Data Path
const DATA_PATH = ["artifacts", "rosie-family-pa-v2026", "public", "data"];

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

  // Memoized DB Instance to prevent memory leaks during HMR
  const getDb = useCallback(() => {
    if (!config?.firebase) return null;
    const app = getApps().length === 0 ? initializeApp(config.firebase) : getApp();
    return getFirestore(app);
  }, [config]);

  // Real-time Data Synchronization
  useEffect(() => {
    const db = getDb();
    if (!db) return;

    const docRef = doc(db, ...DATA_PATH);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) setData(snap.data());
    }, (err) => console.error("Sync Error:", err));

    return () => unsubscribe();
  }, [getDb]);

  const handleMutation = async (field, value, op = 'add') => {
    const db = getDb();
    if (!db) return;
    try {
      const docRef = doc(db, ...DATA_PATH);
      await updateDoc(docRef, { [field]: op === 'add' ? arrayUnion(value) : arrayRemove(value) });
    } catch (e) { console.error("Mutation Error:", e); }
  };

  const handleAiChat = async () => {
    if (!inputText.trim() || isGenerating) return;
    const userPrompt = inputText.trim();
    setInputText("");
    setIsGenerating(true);

    const userMsg = { role: 'user', text: userPrompt, ts: new Date().toLocaleTimeString() };
    await handleMutation('messages', userMsg);

    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(userPrompt);
      const response = result.response.text();
      await handleMutation('messages', { role: 'rosie', text: response, ts: new Date().toLocaleTimeString() });
    } catch (e) {
      console.error("AI Error:", e);
    } finally { setIsGenerating(false); }
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

  return (
    <div className="max-w-md mx-auto bg-[#FFF8F0] min-h-screen flex flex-col font-sans antialiased text-[#202124]">
      {/* Dynamic Header */}
      <header className="p-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black italic tracking-tighter">ROSIE.</h1>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#EA4335]">
            <span className="w-1.5 h-1.5 bg-[#EA4335] rounded-full animate-pulse" /> SYSTEM_ACTIVE
          </div>
        </div>
        <button className="p-3 bg-white rounded-full shadow-lg text-[#EA4335]"><Radio size={24} /></button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'brain' && (
          <div className="space-y-4">
            {data.messages?.map((m, i) => (
              <div key={i} className={`p-4 rounded-2xl relative group shadow-sm max-w-[90%] ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto' : 'bg-white'}`}>
                <p className="text-sm font-medium">{m.text}</p>
                <button onClick={() => handleMutation('messages', m, 'remove')} className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-gray-300 hover:text-red-500">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'hub' && (
          <div className="space-y-6">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Family Inventory</h2>
            {data.groceries?.map((item, i) => (
              <div key={i} className="flex justify-between items-center p-4 bg-white rounded-2xl shadow-sm group">
                <span className="font-bold text-sm">{item}</span>
                <button onClick={() => handleMutation('groceries', item, 'remove')} className="text-[#EA4335] p-1"><Trash2 size={18} /></button>
              </div>
            ))}
            <div className="flex gap-2 sticky bottom-0">
              <input id="hub-input" className="flex-1 p-4 rounded-2xl shadow-inner bg-white text-sm" placeholder="Add to list..." onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.value.trim()) { handleMutation('groceries', e.target.value.trim()); e.target.value = ''; }
              }} />
              <button onClick={() => { const el = document.getElementById('hub-input'); if (el.value.trim()) { handleMutation('groceries', el.value.trim()); el.value = ''; }}} className="p-4 bg-[#EA4335] text-white rounded-2xl shadow-xl active:scale-90 transition-transform"><Plus size={24} /></button>
            </div>
          </div>
        )}
      </main>

      {/* Persistent Navigation */}
      <footer className="p-6 bg-white/80 backdrop-blur-lg border-t border-gray-100">
        {activeTab === 'brain' && (
          <div className="mb-6 flex gap-2">
            <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAiChat()} placeholder="Ask Rosie..." className="flex-1 p-4 bg-gray-100 rounded-full text-sm outline-none" />
            <button onClick={handleAiChat} className="p-4 bg-[#EA4335] text-white rounded-full shadow-lg active:scale-90"><Send size={20} /></button>
          </div>
        )}
        <nav className="flex justify-around items-center">
          <button onClick={() => setActiveTab('brain')} className={activeTab === 'brain' ? "text-[#EA4335]" : "text-gray-300"}><Mic size={28} /></button>
          <button onClick={() => setActiveTab('hub')} className={activeTab === 'hub' ? "text-[#EA4335]" : "text-gray-300"}><ShoppingCart size={28} /></button>
          <button onClick={() => setActiveTab('plans')} className={activeTab === 'plans' ? "text-[#EA4335]" : "text-gray-300"}><Calendar size={28} /></button>
        </nav>
      </footer>
    </div>
  );
}
