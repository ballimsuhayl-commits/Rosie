import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Plus, Trash2, Radio, Send, ShoppingCart, Calendar, Mic } from 'lucide-react';

// Define constant document path for Firestore
const COLLECTION_PATH = "artifacts";
const DOC_ID = "rosie-family-pa-v2026";
const SUB_COLLECTION = "public";
const DATA_DOC_ID = "data";

export default function App() {
  // State Initialization with Lazy Loading for localStorage
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('rosie_config');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("Failed to parse local config", e);
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState('brain');
  const [data, setData] = useState({ messages: [], groceries: [], plans: [], memories: [] });
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Singleton Firebase Instance Getter
  const getDb = useCallback(() => {
    if (!config?.firebase) return null;
    try {
      const app = getApps().length === 0 ? initializeApp(config.firebase) : getApp();
      return getFirestore(app);
    } catch (error) {
      console.error("Firebase Initialization Error:", error);
      return null;
    }
  }, [config]);

  // Firestore Real-time Listener
  useEffect(() => {
    const db = getDb();
    if (!db) return;

    // Construct reference path: artifacts/rosie-family-pa-v2026/public/data
    const docRef = doc(db, COLLECTION_PATH, DOC_ID, SUB_COLLECTION, DATA_DOC_ID);
    
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        setData(snapshot.data());
      } else {
        console.warn("Document does not exist. Check Firebase structure.");
      }
    }, (error) => {
      console.error("Firestore Snapshot Error:", error.message);
    });

    return () => unsubscribe();
  }, [getDb]);

  // Generic Data Mutation Handler (Add/Remove)
  const handleSync = async (field, value, operation = 'add') => {
    const db = getDb();
    if (!db) {
      console.error("Cannot sync: DB not initialized");
      return;
    }
    
    try {
      const docRef = doc(db, COLLECTION_PATH, DOC_ID, SUB_COLLECTION, DATA_DOC_ID);
      await updateDoc(docRef, {
        [field]: operation === 'add' ? arrayUnion(value) : arrayRemove(value)
      });
    } catch (error) {
      console.error(`Failed to ${operation} item:`, error);
      alert("Sync failed. Check network or permissions.");
    }
  };

  // AI execution handler
  const executeAiQuery = async () => {
    if (!inputText.trim() || !config?.gemini || isGenerating) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const userEntry = { role: 'user', text: inputText, ts: timestamp };
    // Optimistic update not needed as onSnapshot will catch it, but good for UX
    await handleSync('messages', userEntry);
    
    const query = inputText;
    setInputText("");
    setIsGenerating(true);

    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(query);
      const responseText = result.response.text();

      await handleSync('messages', { role: 'rosie', text: responseText, ts: new Date().toLocaleTimeString() });
    } catch (error) {
      console.error("Gemini API Error:", error);
      await handleSync('messages', { role: 'rosie', text: "[System Error: AI unavailable]", ts: timestamp });
    } finally {
      setIsGenerating(false);
    }
  };

  // Config View (If no keys are present)
  if (!config) {
    return (
      <div className="min-h-screen bg-[#EA4335] p-6 flex flex-col justify-center">
        <div className="bg-white p-6 rounded-3xl space-y-6 shadow-2xl">
          <h1 className="text-2xl font-black text-[#202124] uppercase tracking-tighter">System Setup</h1>
          <form onSubmit={(e) => {
            e.preventDefault();
            try {
              const formData = new FormData(e.target);
              const cfg = {
                gemini: formData.get('gemini').trim(),
                firebase: JSON.parse(formData.get('firebase'))
              };
              localStorage.setItem('rosie_config', JSON.stringify(cfg));
              setConfig(cfg);
            } catch (err) {
              alert("Invalid Config Data. Check JSON formatting.");
            }
          }} className="space-y-4">
            <input name="gemini" placeholder="Gemini API Key" className="w-full p-4 bg-gray-100 rounded-xl font-mono text-sm border-0" required />
            <textarea name="firebase" placeholder="Firebase Config JSON object" className="w-full p-4 bg-gray-100 rounded-xl h-32 font-mono text-xs border-0" required />
            <button type="submit" className="w-full p-4 bg-black text-white rounded-xl font-bold hover:bg-gray-900 transition-colors">INITIALIZE CLIENT</button>
          </form>
        </div>
      </div>
    );
  }

  // Main App View
  return (
    <div className="max-w-md mx-auto bg-[#FFF8F0] h-[100dvh] flex flex-col font-sans text-[#202124]">
      <header className="p-6 flex justify-between items-center bg-white/50 backdrop-blur-md sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-black tracking-tight italic">ROSIE.</h1>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EA4335] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EA4335]"></span>
            </span>
            <span className="text-xs font-bold text-[#EA4335] tracking-wider">LIVE UPLINK</span>
          </div>
        </div>
        <button className="p-3 bg-white rounded-full shadow-sm text-[#EA4335] border border-gray-100 active:bg-gray-50 transition-colors">
          <Radio size={24} strokeWidth={2.5} />
        </button>
      </header>

      <main className="flex-1 p-6 overflow-y-auto scroll-smooth">
        {activeTab === 'brain' && (
          <div className="space-y-6 pb-4">
            {data.messages?.map((m, i) => (
              <div key={i} className={`p-5 rounded-[2rem] relative group shadow-sm transition-all max-w-[90%] ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                <p className="text-[15px] leading-relaxed font-medium">{m.text}</p>
                <span className="text-[10px] opacity-50 absolute bottom-2 right-4">{m.ts}</span>
                <button onClick={(e) => { e.stopPropagation(); handleSync('messages', m, 'remove'); }} className="absolute -left-12 top-1/2 -translate-y-1/2 p-2 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#EA4335]">
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
             {isGenerating && (
              <div className="p-5 rounded-[2rem] bg-white shadow-sm w-24 rounded-tl-none">
                <div className="flex space-x-2 animate-pulse">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'hub' && (
          <div className="space-y-8">
            <section>
              <div className="flex items-center justify-between mb-4">
                 <h2 className="text-sm font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                  <ShoppingCart size={18} /> Inventory
                 </h2>
                 <span className="text-xs font-bold bg-[#EA4335]/10 text-[#EA4335] px-2 py-1 rounded-full">{data.groceries?.length || 0} ITEMS</span>
              </div>
             
              <div className="space-y-3">
                {data.groceries?.map((item, i) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-white rounded-2xl shadow-sm group border border-transparent hover:border-gray-100 transition-all">
                    <span className="font-bold text-[15px]">{item}</span>
                    <button onClick={() => handleSync('groceries', item, 'remove')} className="p-2 text-gray-300 hover:text-[#EA4335] transition-colors">
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-3 mt-6 sticky bottom-4">
                <input 
                  id="grocery-input"
                  className="flex-1 p-4 rounded-2xl border-0 shadow-lg bg-white text-[15px] font-medium placeholder:text-gray-300 focus:ring-2 focus:ring-[#EA4335]"
                  placeholder="Add item to list..."
                  onKeyDown={(e) => {
                    if(e.key === 'Enter' && e.currentTarget.value.trim()) {
                      handleSync('groceries', e.currentTarget.value.trim());
                      e.currentTarget.value = '';
                    }
                  }}
                />
                 <button 
                    onClick={() => {
                      const el = document.getElementById('grocery-input');
                      if(el && el.value.trim()) {
                         handleSync('groceries', el.value.trim());
                         el.value = '';
                      }
                    }}
                    className="p-4 bg-[#EA4335] text-white rounded-2xl shadow-lg active:scale-95 transition-transform flex items-center justify-center"
                  >
                  <Plus size={24} strokeWidth={3} />
                </button>
              </div>
            </section>
          </div>
        )}
      </main>

      {activeTab === 'brain' && (
        <div className="p-4 bg-white border-t border-gray-50 pb-8">
          <div className="flex gap-3 relative">
            <input 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && executeAiQuery()}
              placeholder="Message Rosie..."
              disabled={isGenerating}
              className="flex-1 p-4 bg-gray-100 rounded-full border-0 text-[15px] font-medium focus:ring-2 focus:ring-[#EA4335] pr-12 disabled:opacity-50"
            />
             <button 
              onClick={executeAiQuery}
              disabled={isGenerating || !inputText.trim()}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${inputText.trim() && !isGenerating ? 'bg-[#EA4335] text-white shadow-md active:scale-90' : 'bg-gray-200 text-gray-400'}`}
            >
              <Send size={20} strokeWidth={2.5} className={isGenerating ? 'animate-pulse' : ''}/>
            </button>
          </div>
        </div>
      )}

      <nav className="bg-white border-t border-gray-50 pb-6">
        <div className="flex justify-around p-4">
        <button onClick={() => setActiveTab('brain')} className={`p-2 transition-colors relative ${activeTab === 'brain' ? "text-[#EA4335]" : "text-gray-300 hover:text-gray-400"}`}>
          <Mic size={28} strokeWidth={activeTab === 'brain' ? 2.5 : 2} />
          {activeTab === 'brain' && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#EA4335] rounded-full" />}
        </button>
        <button onClick={() => setActiveTab('hub')} className={`p-2 transition-colors relative ${activeTab === 'hub' ? "text-[#EA4335]" : "text-gray-300 hover:text-gray-400"}`}>
          <ShoppingCart size={28} strokeWidth={activeTab === 'hub' ? 2.5 : 2} />
          {activeTab === 'hub' && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#EA4335] rounded-full" />}
        </button>
        <button onClick={() => setActiveTab('plans')} className={`p-2 transition-colors relative ${activeTab === 'plans' ? "text-[#EA4335]" : "text-gray-300 hover:text-gray-400"}`}>
          <Calendar size={28} strokeWidth={activeTab === 'plans' ? 2.5 : 2} />
          {activeTab === 'plans' && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#EA4335] rounded-full" />}
        </button>
        </div>
      </nav>
    </div>
  );
}
