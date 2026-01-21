import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Plus, Trash2, Radio, Send, ShoppingCart, Calendar, Book, Mic, Settings, Copy, Volume2, Camera } from 'lucide-react';

// Production Firestore Path
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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const fileInputRef = useRef(null);

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

  const handleVision = async (e) => {
    const file = e.target.files[0];
    if (!file || isGenerating) return;
    setIsGenerating(true);
    
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result.split(',')[1];
        const genAI = new GoogleGenerativeAI(config.gemini);
        // MODEL LOCK: Gemini 2.0 Flash-Thinking (Advanced Reasoner)
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-thinking-preview" });
        
        const result = await model.generateContent([
          "Analyze this image. If it's a shopping list or task list, return it as a comma-separated list of items only. Otherwise, describe it for a family diary.",
          { inlineData: { data: base64Data, mimeType: file.type } }
        ]);

        const text = result.response.text();
        if (text.includes(',') || text.length < 40) {
          const items = text.split(',').map(i => i.trim());
          for (const item of items) await sync('groceries', item);
        } else {
          await sync('memories', `Vision Note: ${text}`);
        }
      };
      reader.readAsDataURL(file);
    } catch (e) { console.error("Vision Error:", e); }
    setIsGenerating(false);
  };

  const handleRadio = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-thinking-preview" });
      const prompt = `Family Briefing. Groceries: ${data.groceries.join(", ")}. Schedule: ${data.plans.join(", ")}. Think through the family's day, then be warm, concise, and helpful. 30 seconds max.`;
      const result = await model.generateContent(prompt);
      speak(result.response.text());
    } catch (e) { speak("I'm here, just some minor interference."); }
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
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-thinking-preview" });
      const result = await model.generateContent(`Context: ${JSON.stringify(data)}. User: ${query}. Respond as Rosie, the family assistant. Use your thinking capability to provide highly personalized support.`);
      await sync('messages', { role: 'rosie', text: result.response.text(), ts: new Date().toLocaleTimeString() });
    } catch (e) { console.error("AI Failure:", e); }
    setIsGenerating(false);
  };

  if (!config) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#EA4335] p-8 text-white text-center">
      <h1 className="text-5xl font-black mb-8 italic tracking-tighter">ROSIE.</h1>
      <form onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const cfg = { gemini: fd.get('g'), firebase: JSON.parse(fd.get('f')) };
        localStorage.setItem('rosie_config', JSON.stringify(cfg));
        setConfig(cfg);
      }} className="w-full max-w-sm space-y-4">
        <input name="g" placeholder="Gemini Key" className="w-full p-5 rounded-3xl text-black outline-none border-0" required />
        <textarea name="f" placeholder="Firebase JSON" className="w-full p-5 rounded-3xl text-black h-48 font-mono text-xs outline-none border-0" required />
        <button className="w-full p-5 bg-black rounded-3xl font-black uppercase tracking-widest active:scale-95 transition-all">Initialize</button>
      </form>
    </div>
  );

  const Section = ({ title, icon: Icon, items, field, placeholder }) => (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-700">
      <div className="flex justify-between items-center">
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 flex items-center gap-2">
          <Icon size={14} /> {title}
        </h2>
        <span className="text-[10px] font-bold bg-[#EA4335]/10 text-[#EA4335] px-2 py-0.5 rounded-full">{items?.length || 0}</span>
      </div>
      <div className="space-y-3 flex-1 overflow-y-auto pb-32">
        {items?.map((item, i) => (
          <div key={i} className="flex justify-between items-center p-5 bg-white rounded-[1.8rem] shadow-sm border border-gray-50">
            <span className="font-bold text-sm leading-tight">{item}</span>
            <button onClick={() => sync(field, item, 'remove')} className="text-[#EA4335] p-1"><Trash2 size={18} /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 p-4 fixed bottom-24 left-0 right-0 max-w-md mx-auto z-20">
        <button onClick={() => fileInputRef.current.click()} className="p-4 bg-white text-gray-400 rounded-2xl shadow-xl active:scale-90 border border-gray-50">
          <Camera size={24} />
        </button>
        <input id={`${field}-input`} className="flex-1 p-4 rounded-2xl shadow-xl bg-white text-sm outline-none border-none focus:ring-2 focus:ring-[#EA4335]" placeholder={placeholder} onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target.value.trim()) { sync(field, e.target.value.trim()); e.target.value = ''; }
        }} />
        <button onClick={() => { const el = document.getElementById(`${field}-input`); if (el.value.trim()) { sync(field, el.value.trim()); el.value = ''; }}} className="p-4 bg-[#EA4335] text-white rounded-2xl shadow-xl active:scale-90"><Plus size={24} /></button>
      </div>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleVision} />
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-[#FFF8F0] h-[100dvh] flex flex-col font-sans antialiased text-[#202124] overflow-hidden">
      <header className="p-6 flex justify-between items-center bg-white/70 backdrop-blur-md z-30">
        <div>
          <h1 className="text-2xl font-black italic tracking-tighter leading-none">ROSIE.</h1>
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#EA4335] mt-1">
            <span className={`w-1.5 h-1.5 bg-[#EA4335] rounded-full ${isGenerating || isSpeaking ? 'animate-ping' : 'animate-pulse'}`} />
            {isGenerating ? 'FLASH_THINKING' : isSpeaking ? 'ROSIE_VOCAL' : 'UPLINK_STABLE'}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('settings')} className={`p-3 rounded-full transition-all ${activeTab === 'settings' ? 'bg-[#EA4335] text-white shadow-lg' : 'bg-white text-gray-400 shadow-sm'}`}><Settings size={20} /></button>
          <button onClick={handleRadio} className={`p-3 rounded-full shadow-lg transition-all ${isSpeaking ? 'bg-[#EA4335] text-white animate-pulse' : 'bg-white text-[#EA4335]'}`}>{isSpeaking ? <Volume2 size={20} /> : <Radio size={20} />}</button>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'brain' && (
          <div className="space-y-4 pb-32">
            {data.messages?.map((m, i) => (
              <div key={i} className={`p-5 rounded-[2rem] relative group shadow-sm max-w-[85%] animate-in slide-in-from-bottom-2 ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                <p className="text-sm font-medium leading-relaxed">{m.text}</p>
                <button onClick={() => sync('messages', m, 'remove')} className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'hub' && <Section title="Inventory" icon={ShoppingCart} items={data.groceries} field="groceries" placeholder="Add grocery..." />}
        {activeTab === 'plans' && <Section title="Schedule" icon={Calendar} items={data.plans} field="plans" placeholder="Soccer at 5?..." />}
        {activeTab === 'notebook' && <Section title="Memories" icon={Book} items={data.memories} field="memories" placeholder="Save a note..." />}

        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in zoom-in-95 duration-500 text-center pt-10">
            <div className="bg-white p-8 rounded-[3rem] shadow-2xl">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${window.location.origin}`} alt="QR" className="w-40 h-40 mx-auto mb-6" />
              <h3 className="font-black text-xl tracking-tighter">Family Link</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-8 italic">Gemini 2.0 Flash Thinking</p>
              <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(config)); alert("Config Copied!"); }} className="w-full p-5 bg-gray-50 rounded-2xl font-bold text-xs"><Copy size={16} /> Copy Config</button>
              <button onClick={() => { localStorage.removeItem('rosie_config'); window.location.reload(); }} className="mt-8 text-red-500 font-black text-[10px] uppercase tracking-widest block mx-auto underline">Reset App</button>
            </div>
          </div>
        )}
      </main>

      <footer className="p-6 bg-white border-t border-gray-100 pb-12 z-40">
        {activeTab === 'brain' && (
          <div className="mb-6 flex gap-2">
            <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAiChat()} placeholder="Command Rosie..." className="flex-1 p-4 bg-gray-100 rounded-full text-sm outline-none border-0" />
            <button onClick={handleAiChat} className="p-4 bg-[#EA4335] text-white rounded-full shadow-lg active:scale-90"><Send size={20} /></button>
          </div>
        )}
        <nav className="flex justify-around items-center">
          <button onClick={() => setActiveTab('brain')} className={activeTab === 'brain' ? "text-[#EA4335] scale-125" : "text-gray-200"}><Mic size={32} strokeWidth={2.5} /></button>
          <button onClick={() => setActiveTab('hub')} className={activeTab === 'hub' ? "text-[#EA4335] scale-125" : "text-gray-200"}><ShoppingCart size={32} strokeWidth={2.5} /></button>
          <button onClick={() => setActiveTab('plans')} className={activeTab === 'plans' ? "text-[#EA4335] scale-125" : "text-gray-200"}><Calendar size={32} strokeWidth={2.5} /></button>
          <button onClick={() => setActiveTab('notebook')} className={activeTab === 'notebook' ? "text-[#EA4335] scale-125" : "text-gray-200"}><Book size={32} strokeWidth={2.5} /></button>
        </nav>
      </footer>
    </div>
  );
}
