import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Plus, Trash2, Radio, Send, ShoppingCart, Calendar, Mic, Sparkles, Heart, Camera } from 'lucide-react';

const COLLECTION_PATH = "artifacts";
const DOC_ID = "rosie-family-pa-v2026";
const SUB_COLLECTION = "public";
const DATA_DOC_ID = "data";

export default function App() {
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('rosie_config');
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });

  const [activeTab, setActiveTab] = useState('brain');
  const [data, setData] = useState({ messages: [], groceries: [], plans: [], memories: [] });
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const getDb = useCallback(() => {
    if (!config?.firebase) return null;
    try {
      const app = getApps().length === 0 ? initializeApp(config.firebase) : getApp();
      return getFirestore(app);
    } catch (error) { return null; }
  }, [config]);

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const docRef = doc(db, COLLECTION_PATH, DOC_ID, SUB_COLLECTION, DATA_DOC_ID);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) setData(snapshot.data());
    }, (error) => console.error("Sync Error:", error.message));
    return () => unsubscribe();
  }, [getDb]);

  const handleSync = async (field, value, operation = 'add') => {
    const db = getDb();
    if (!db) return;
    try {
      const docRef = doc(db, COLLECTION_PATH, DOC_ID, SUB_COLLECTION, DATA_DOC_ID);
      await updateDoc(docRef, {
        [field]: operation === 'add' ? arrayUnion(value) : arrayRemove(value)
      });
    } catch (error) { alert("Update failed. Check connection."); }
  };

  const executeAiQuery = async () => {
    if (!inputText.trim() || !config?.gemini || isGenerating) return;
    const userEntry = { role: 'user', text: inputText, ts: new Date().toLocaleTimeString() };
    await handleSync('messages', userEntry);
    const query = inputText;
    setInputText("");
    setIsGenerating(true);

    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(query);
      await handleSync('messages', { role: 'rosie', text: result.response.text(), ts: new Date().toLocaleTimeString() });
    } catch (error) {
      await handleSync('messages', { role: 'rosie', text: "[System Error: Rosie is resting. Please try again.]", ts: userEntry.ts });
    } finally { setIsGenerating(false); }
  };

  if (!config) {
    return (
      <div className="min-h-screen bg-[#EA4335] p-6 flex flex-col justify-center font-sans">
        <div className="bg-white p-8 rounded-[2.5rem] space-y-6 shadow-2xl">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-[#EA4335] rounded-2xl flex items-center justify-center text-white">
                <Sparkles size={28} />
             </div>
             <h1 className="text-2xl font-black text-[#202124] tracking-tighter italic">ROSIE SETUP</h1>
          </div>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            try {
              const cfg = { gemini: formData.get('gemini').trim(), firebase: JSON.parse(formData.get('firebase')) };
              localStorage.setItem('rosie_config', JSON.stringify(cfg));
              setConfig(cfg);
            } catch (err) { alert("Check JSON formatting."); }
          }} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Gemini Key</label>
              <input name="gemini" className="w-full p-4 bg-gray-50 rounded-2xl font-mono text-sm border border-gray-100" required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Firebase Config JSON</label>
              <textarea name="firebase" className="w-full p-4 bg-gray-50 rounded-2xl h-32 font-mono text-xs border border-gray-100" required />
            </div>
            <button type="submit" className="w-full p-5 bg-[#202124] text-white rounded-2xl font-bold active:scale-95 transition-all">INITIALIZE ROSIE</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-[#FFF8F0] h-[100dvh] flex flex-col font-sans text-[#202124] overflow-hidden">
      <header className="p-6 pb-4 flex justify-between items-start bg-white/60 backdrop-blur-lg sticky top-0 z-20 border-b border-white">
        <div className="flex gap-3">
          <div className="w-14 h-14 bg-[#EA4335] rounded-3xl flex items-center justify-center text-white shadow-lg shadow-[#EA4335]/20 overflow-hidden border-2 border-white">
             {/* ROSIE MASCOT PLACEHOLDER */}
             <Sparkles size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight italic">ROSIE.</h1>
            <div className="flex -space-x-2 mt-1">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center overflow-hidden">
                    <span className="text-[8px] font-bold text-gray-400">{i}</span>
                  </div>
                ))}
                <div className="w-6 h-6 rounded-full border-2 border-white bg-[#EA4335] flex items-center justify-center text-white">
                  <Plus size={10} strokeWidth={4} />
                </div>
            </div>
          </div>
        </div>
        <button className="p-3 bg-white rounded-full shadow-sm text-[#EA4335] border border-gray-100 active:bg-gray-50 transition-colors">
          <Radio size={24} strokeWidth={2.5} />
        </button>
      </header>

      <main className="flex-1 p-6 overflow-y-auto scroll-smooth custom-scrollbar">
        {activeTab === 'brain' && (
          <div className="space-y-6 pb-4">
            {data.messages?.length === 0 && (
              <div className="text-center py-10 opacity-30">
                <Sparkles className="mx-auto mb-2" size={32} />
                <p className="font-bold text-sm">Say hello to Rosie!</p>
              </div>
            )}
            {data.messages?.map((m, i) => (
              <div key={i} className={`p-5 rounded-[2rem] relative group shadow-sm transition-all max-w-[85%] ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto rounded-tr-none' : 'bg-white rounded-tl-none border border-gray-100'}`}>
                <p className="text-[15px] leading-relaxed font-medium whitespace-pre-wrap">{m.text}</p>
                <div className="flex items-center justify-between mt-3 opacity-40">
                  <span className="text-[9px] font-bold uppercase">{m.ts}</span>
                  <button onClick={() => handleSync('messages', m, 'remove')} className="p-1 hover:text-[#EA4335] opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12}/></button>
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="p-5 rounded-[2rem] bg-white border border-gray-100 shadow-sm w-20 rounded-tl-none flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-200 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-gray-200 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-1.5 h-1.5 bg-gray-200 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'hub' && (
          <section className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 mb-6">
              <ShoppingCart size={16} /> Family Inventory
            </h2>
            {data.groceries?.map((item, i) => (
              <div key={i} className="flex justify-between items-center p-5 bg-white rounded-3xl shadow-sm border border-transparent hover:border-gray-100 transition-all">
                <span className="font-bold text-[15px]">{item}</span>
                <button onClick={() => handleSync('groceries', item, 'remove')} className="p-2 text-gray-200 hover:text-[#EA4335] transition-colors"><Trash2 size={20}/></button>
              </div>
            ))}
            <div className="flex gap-2 mt-4">
               <input id="grocery-input" className="flex-1 p-4 rounded-2xl bg-white shadow-sm border-0 font-bold placeholder:text-gray-200" placeholder="Need something?" />
               <button onClick={() => {
                 const el = document.getElementById('grocery-input');
                 if(el.value.trim()){ handleSync('groceries', el.value.trim()); el.value = ''; }
               }} className="p-4 bg-[#EA4335] text-white rounded-2xl shadow-lg active:scale-90 transition-all"><Plus size={24} strokeWidth={3}/></button>
            </div>
          </section>
        )}

        {activeTab === 'plans' && (
          <section className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 mb-6">
              <Calendar size={16} /> Upcoming Events
            </h2>
            {data.plans?.map((plan, i) => (
              <div key={i} className="p-5 bg-white rounded-3xl shadow-sm border-l-4 border-l-[#EA4335]">
                <p className="font-bold text-[15px]">{plan}</p>
                <button onClick={() => handleSync('plans', plan, 'remove')} className="mt-2 text-[10px] font-black text-gray-300 uppercase hover:text-[#EA4335]">Remove Event</button>
              </div>
            ))}
            <div className="flex gap-2 mt-4">
               <input id="plan-input" className="flex-1 p-4 rounded-2xl bg-white shadow-sm border-0 font-bold placeholder:text-gray-200" placeholder="New family plan..." />
               <button onClick={() => {
                 const el = document.getElementById('plan-input');
                 if(el.value.trim()){ handleSync('plans', el.value.trim()); el.value = ''; }
               }} className="p-4 bg-[#EA4335] text-white rounded-2xl shadow-lg active:scale-90 transition-all"><Plus size={24} strokeWidth={3}/></button>
            </div>
          </section>
        )}

        {activeTab === 'memories' && (
          <section className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 mb-6">
              <Camera size={16} /> Family Memories
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {data.memories?.map((memory, i) => (
                <div key={i} className="aspect-square bg-white rounded-[2rem] p-4 flex flex-col justify-between shadow-sm border border-gray-50 relative group">
                  <div className="w-8 h-8 bg-[#EA4335]/10 text-[#EA4335] rounded-full flex items-center justify-center">
                    <Heart size={14} fill="currentColor" />
                  </div>
                  <p className="text-[13px] font-bold leading-tight">{memory}</p>
                  <button onClick={() => handleSync('memories', memory, 'remove')} className="absolute top-2 right-2 p-2 text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#EA4335]">
                    <Trash2 size={16}/>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
               <input id="memory-input" className="flex-1 p-4 rounded-2xl bg-white shadow-sm border-0 font-bold placeholder:text-gray-200" placeholder="Capture a milestone..." />
               <button onClick={() => {
                 const el = document.getElementById('memory-input');
                 if(el.value.trim()){ handleSync('memories', el.value.trim()); el.value = ''; }
               }} className="p-4 bg-[#EA4335] text-white rounded-2xl shadow-lg active:scale-90 transition-all"><Plus size={24} strokeWidth={3}/></button>
            </div>
          </section>
        )}
      </main>

      {activeTab === 'brain' && (
        <div className="p-6 bg-white border-t border-gray-50 pb-10">
          <div className="flex gap-3 relative">
            <input 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && executeAiQuery()}
              placeholder="Ask Rosie anything..."
              disabled={isGenerating}
              className="flex-1 p-5 bg-gray-50 rounded-[2rem] border-0 text-[15px] font-bold focus:ring-2 focus:ring-[#EA4335] pr-14"
            />
             <button onClick={executeAiQuery} disabled={isGenerating || !inputText.trim()} className={`absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full ${inputText.trim() ? 'bg-[#EA4335] text-white shadow-lg' : 'bg-gray-100 text-gray-300'}`}>
              <Send size={20} strokeWidth={3}/>
            </button>
          </div>
        </div>
      )}

      <nav className="bg-white border-t border-gray-50 pb-8 pt-2">
        <div className="flex justify-around items-center px-6">
          {[
            { id: 'brain', icon: Mic },
            { id: 'hub', icon: ShoppingCart },
            { id: 'plans', icon: Calendar },
            { id: 'memories', icon: Camera }
          ].map(({ id, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`p-4 transition-all relative ${activeTab === id ? "text-[#EA4335] scale-110" : "text-gray-200 hover:text-gray-400"}`}>
              <Icon size={24} strokeWidth={activeTab === id ? 3 : 2} />
              {activeTab === id && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#EA4335] rounded-full" />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
