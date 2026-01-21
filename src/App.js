import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, setDoc, getDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Plus, Trash2, Radio, Send, ShoppingCart, Calendar, Mic, Sparkles, Heart, Camera, UserPlus } from 'lucide-react';

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

export default function App() {
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('rosie_gemini_key');
    return saved ? { gemini: saved } : null;
  });

  const [activeTab, setActiveTab] = useState('brain');
  const [data, setData] = useState({ messages: [], groceries: [], plans: [], memories: [] });
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [data.messages, isGenerating]);

  const getDb = useCallback(() => {
    const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
    return getFirestore(app);
  }, []);

  useEffect(() => {
    const db = getDb();
    const docRef = doc(db, "artifacts", APP_ID, "public", "data");
    
    const init = async () => {
      const snap = await getDoc(docRef);
      if (!snap.exists()) await setDoc(docRef, { messages: [], groceries: [], plans: [], memories: [] });
    };
    init();

    return onSnapshot(docRef, (s) => s.exists() && setData(s.data()));
  }, [getDb]);

  const sync = async (field, val, op = 'add') => {
    try {
      const docRef = doc(getDb(), "artifacts", APP_ID, "public", "data");
      await updateDoc(docRef, { [field]: op === 'add' ? arrayUnion(val) : arrayRemove(val) });
    } catch (e) { console.error(e); }
  };

  const startVoice = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) return alert("Speech API not supported");
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
    setIsGenerating(true);

    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: "You are Rosie, a warm family PA. Be concise, witty, and helpful."
      });
      const res = await model.generateContent(`Context: ${JSON.stringify(data)}. User: ${query}`);
      await sync('messages', { role: 'rosie', text: res.response.text(), ts: new Date().toLocaleTimeString() });
    } catch (e) {
      await sync('messages', { role: 'rosie', text: "I'm having a little glitch. Try again?", ts: userMsg.ts });
    } finally { setIsGenerating(false); }
  };

  if (!config) return (
    <div className="min-h-screen bg-[#EA4335] p-8 flex items-center justify-center font-sans">
      <div className="bg-white p-8 rounded-[2rem] shadow-2xl w-full max-w-xs space-y-4">
        <h1 className="text-2xl font-black italic">ROSIE SETUP</h1>
        <input id="gk" placeholder="Gemini API Key" className="w-full p-4 bg-gray-50 rounded-xl border-0" />
        <button onClick={() => {
          const k = document.getElementById('gk').value.trim();
          if(k) { localStorage.setItem('rosie_gemini_key', k); setConfig({gemini: k}); }
        }} className="w-full p-4 bg-black text-white rounded-xl font-bold">ACTIVATE</button>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-[#FFF8F0] h-[100dvh] flex flex-col font-sans text-[#202124] overflow-hidden">
      <header className="p-6 flex justify-between items-start bg-white/60 backdrop-blur-lg border-b border-white sticky top-0 z-20">
        <div className="flex gap-3">
          <div className="w-12 h-12 bg-[#EA4335] rounded-2xl flex items-center justify-center text-white shadow-xl shadow-[#EA4335]/20">
             <Sparkles size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight italic">ROSIE.</h1>
            <div className="flex -space-x-1.5 mt-1">
                {[1,2,3].map(i => <div key={i} className="w-5 h-5 rounded-full border-2 border-white bg-gray-200" />)}
                <div className="w-5 h-5 rounded-full border-2 border-white bg-[#EA4335] flex items-center justify-center text-white"><UserPlus size={8} strokeWidth={4} /></div>
            </div>
          </div>
        </div>
        <button className="p-3 bg-white rounded-full shadow-sm text-[#EA4335] border border-gray-100"><Radio size={20} strokeWidth={2.5} /></button>
      </header>

      <main ref={scrollRef} className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'brain' && (
          <div className="space-y-4">
            {data.messages?.map((m, i) => (
              <div key={i} className={`p-4 rounded-[1.5rem] shadow-sm max-w-[85%] ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                <p className="text-sm font-medium">{m.text}</p>
                <button onClick={() => sync('messages', m, 'remove')} className="text-[8px] mt-1 opacity-20 uppercase font-bold">Delete</button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'hub' && (
          <div className="space-y-3">
             <h2 className="text-[10px] font-black uppercase text-gray-400 mb-4 flex gap-2"><ShoppingCart size={12}/> Grocery List</h2>
             {data.groceries?.map((it, i) => (
               <div key={i} className="flex justify-between p-4 bg-white rounded-2xl shadow-sm">
                 <span className="font-bold text-sm">{it}</span>
                 <button onClick={() => sync('groceries', it, 'remove')} className="text-gray-200"><Trash2 size={16}/></button>
               </div>
             ))}
             <div className="flex gap-2 pt-2">
                <input id="hi" className="flex-1 p-3 rounded-xl border-0 shadow-sm" placeholder="Add item..." />
                <button onClick={() => { const el = document.getElementById('hi'); if(el.value) {sync('groceries', el.value); el.value='';} }} className="p-3 bg-[#EA4335] text-white rounded-xl"><Plus size={20}/></button>
             </div>
          </div>
        )}

        {activeTab === 'plans' && (
          <div className="space-y-3">
            <h2 className="text-[10px] font-black uppercase text-gray-400 mb-4 flex gap-2"><Calendar size={12}/> Family Plans</h2>
            {data.plans?.map((p, i) => (
              <div key={i} className="p-4 bg-white rounded-2xl border-l-4 border-[#EA4335] flex justify-between shadow-sm">
                <span className="font-bold text-sm">{p}</span>
                <button onClick={() => sync('plans', p, 'remove')} className="text-gray-200"><Trash2 size={16}/></button>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
                <input id="pi" className="flex-1 p-3 rounded-xl border-0 shadow-sm" placeholder="New plan..." />
                <button onClick={() => { const el = document.getElementById('pi'); if(el.value) {sync('plans', el.value); el.value='';} }} className="p-3 bg-[#EA4335] text-white rounded-xl"><Plus size={20}/></button>
            </div>
          </div>
        )}

        {activeTab === 'memories' && (
          <div className="space-y-3">
            <h2 className="text-[10px] font-black uppercase text-gray-400 mb-4 flex gap-2"><Camera size={12}/> Milestones</h2>
            <div className="grid grid-cols-2 gap-3">
                {data.memories?.map((m, i) => (
                    <div key={i} className="aspect-square bg-white rounded-2xl p-4 flex flex-col justify-between shadow-sm border border-gray-50">
                        <Heart size={14} className="text-[#EA4335]" fill="#EA4335" />
                        <p className="text-[11px] font-bold leading-tight">{m}</p>
                        <button onClick={() => sync('memories', m, 'remove')} className="text-[8px] text-gray-200 uppercase font-black text-right">Remove</button>
                    </div>
                ))}
            </div>
            <div className="flex gap-2 pt-2">
                <input id="mi" className="flex-1 p-3 rounded-xl border-0 shadow-sm" placeholder="Memory..." />
                <button onClick={() => { const el = document.getElementById('mi'); if(el.value) {sync('memories', el.value); el.value='';} }} className="p-3 bg-[#EA4335] text-white rounded-xl"><Plus size={20}/></button>
            </div>
          </div>
        )}
      </main>

      {activeTab === 'brain' && (
        <div className="p-4 bg-white border-t border-gray-50 pb-10 flex gap-2">
          <button onClick={startVoice} className={`p-4 rounded-full ${isListening ? 'bg-[#EA4335] text-white animate-pulse' : 'bg-gray-100 text-gray-400'}`}><Mic size={20}/></button>
          <div className="flex-1 relative">
            <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && askRosie()} placeholder="Ask Rosie..." className="w-full p-4 bg-gray-100 rounded-full border-0 text-sm" />
            <button onClick={askRosie} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#EA4335]"><Send size={18}/></button>
          </div>
        </div>
      )}

      <nav className="bg-white border-t border-gray-50 pb-8 pt-2 flex justify-around">
        {[ {id:'brain', icon:Mic}, {id:'hub', icon:ShoppingCart}, {id:'plans', icon:Calendar}, {id:'memories', icon:Camera} ].map(({id, icon:Icon}) => (
          <button key={id} onClick={() => setActiveTab(id)} className={`p-3 relative ${activeTab === id ? "text-[#EA4335] scale-110" : "text-gray-200"}`}>
            <Icon size={24} strokeWidth={activeTab === id ? 3 : 2} />
          </button>
        ))}
      </nav>
    </div>
  );
}
