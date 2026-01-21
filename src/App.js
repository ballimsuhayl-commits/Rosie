import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, setDoc, getDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Plus, Trash2, Radio, Send, ShoppingCart, Calendar, Mic, Sparkles, Heart, Camera, UserPlus } from 'lucide-react';

const COLLECTION_PATH = "artifacts";
const DOC_ID = "rosie-family-pa-v2026";
const SUB_COLLECTION = "public";
const DATA_DOC_ID = "data";

// Your provided configuration
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
    return saved ? { gemini: saved, firebase: FIREBASE_CONFIG } : null;
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
    try {
      const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
      return getFirestore(app);
    } catch (error) { return null; }
  }, []);

  // Initialize and Sync Firestore
  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const docRef = doc(db, COLLECTION_PATH, DOC_ID, SUB_COLLECTION, DATA_DOC_ID);

    const initDoc = async () => {
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        await setDoc(docRef, { messages: [], groceries: [], plans: [], memories: [] });
      }
    };
    initDoc();

    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) setData(snapshot.data());
    });
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
    } catch (error) { console.error("Sync failed:", error); }
  };

  const startVoiceCapture = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Speech not supported");
    const recognition = new SpeechRecognition();
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (e) => setInputText(e.results[0][0].transcript);
    recognition.start();
  };

  const executeAiQuery = async () => {
    if (!inputText.trim() || !config?.gemini || isGenerating) return;
    const userMsg = { role: 'user', text: inputText, ts: new Date().toLocaleTimeString() };
    await handleSync('messages', userMsg);
    const query = inputText;
    setInputText("");
    setIsGenerating(true);

    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: "You are Rosie, a warm and efficient AI family assistant for the Rosie household. You manage their schedules, groceries, and memories. Be concise and friendly."
      });
      const result = await model.generateContent(query);
      await handleSync('messages', { role: 'rosie', text: result.response.text(), ts: new Date().toLocaleTimeString() });
    } catch (error) {
      await handleSync('messages', { role: 'rosie', text: "[Rosie is offline temporarily]", ts: userMsg.ts });
    } finally { setIsGenerating(false); }
  };

  if (!config) {
    return (
      <div className="min-h-screen bg-[#EA4335] p-8 flex flex-col justify-center font-sans">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl space-y-6">
          <h1 className="text-2xl font-black italic tracking-tighter">ROSIE SETUP</h1>
          <input id="gk" placeholder="Gemini API Key" className="w-full p-5 bg-gray-50 rounded-2xl font-mono text-sm border-0" />
          <button onClick={() => {
            const key = document.getElementById('gk').value.trim();
            if(key) { localStorage.setItem('rosie_gemini_key', key); setConfig({gemini: key}); }
          }} className="w-full p-5 bg-black text-white rounded-2xl font-bold">START ROSIE</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-[#FFF8F0] h-[100dvh] flex flex-col font-sans text-[#202124] overflow-hidden">
      <header className="p-6 pb-4 flex justify-between items-start bg-white/60 backdrop-blur-lg border-b border-white sticky top-0 z-20">
        <div className="flex gap-3">
          <div className="w-14 h-14 bg-[#EA4335] rounded-[1.5rem] flex items-center justify-center text-white shadow-xl shadow-[#EA4335]/20 overflow-hidden border-2 border-white">
             <Sparkles size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight italic">ROSIE.</h1>
            <div className="flex -space-x-1.5 mt-1">
                {[1, 2, 3].map(i => <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-gray-200" />)}
                <div className="w-6 h-6 rounded-full border-2 border-white bg-[#EA4335] flex items-center justify-center text-white"><UserPlus size={10} strokeWidth={4} /></div>
            </div>
          </div>
        </div>
        <button className="p-3 bg-white rounded-full shadow-sm text-[#EA4335] border border-gray-100"><Radio size={24} strokeWidth={2.5} /></button>
      </header>

      <main ref={scrollRef} className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'brain' && (
          <div className="space-y-6">
            {data.messages?.map((m, i) => (
              <div key={i} className={`p-5 rounded-[2rem] relative group shadow-sm max-w-[85%] ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto rounded-tr-none' : 'bg-white rounded-tl-none border border-gray-100'}`}>
                <p className="text-[15px] font-medium leading-relaxed">{m.text}</p>
                <div className="flex justify-between mt-2 opacity-30 text-[9px] font-bold">
                  <span>{m.ts}</span>
                  <button onClick={() => handleSync('messages', m, 'remove')} className="group-hover:opacity-100 opacity-0"><Trash2 size={12}/></button>
                </div>
              </div>
            ))}
            {isGenerating && <div className="p-4 bg-white rounded-2xl w-12 animate-pulse text-center">...</div>}
          </div>
        )}

        {activeTab === 'hub' && (
          <div className="space-y-4">
             <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2"><ShoppingCart size={14}/> Family Hub / Groceries</h2>
             {data.groceries?.map((item, i) => (
               <div key={i} className="flex justify-between items-center p-5 bg-white rounded-3xl shadow-sm">
                 <span className="font-bold">{item}</span>
                 <button onClick={() => handleSync('groceries', item, 'remove')} className="text-gray-200"><Trash2 size={20}/></button>
               </div>
             ))}
             <div className="flex gap-2 pt-4">
                <input id="h-in" className="flex-1 p-4 rounded-2xl border-0 shadow-sm font-bold" placeholder="Add to list..." />
                <button onClick={() => { const el = document.getElementById('h-in'); if(el.value) {handleSync('groceries', el.value); el.value='';} }} className="p-4 bg-[#EA4335] text-white rounded-2xl"><Plus/></button>
             </div>
          </div>
        )}

        {activeTab === 'plans' && (
          <div className="space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2"><Calendar size={14}/> Family Plans</h2>
            {data.plans?.map((plan, i) => (
              <div key={i} className="p-5 bg-white rounded-3xl shadow-sm border-l-4 border-[#EA4335] flex justify-between items-center">
                <span className="font-bold">{plan}</span>
                <button onClick={() => handleSync('plans', plan, 'remove')} className="text-gray-200"><Trash2 size={20}/></button>
              </div>
            ))}
            <div className="flex gap-2 pt-4">
                <input id="p-in" className="flex-1 p-4 rounded-2xl border-0 shadow-sm font-bold" placeholder="New plan..." />
                <button onClick={() => { const el = document.getElementById('p-in'); if(el.value) {handleSync('plans', el.value); el.value='';} }} className="p-4 bg-[#EA4335] text-white rounded-2xl"><Plus/></button>
            </div>
          </div>
        )}

        {activeTab === 'memories' && (
          <div className="space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2"><Camera size={14}/> Milestones</h2>
            <div className="grid grid-cols-2 gap-4">
                {data.memories?.map((m, i) => (
                    <div key={i} className="aspect-square bg-white rounded-[2rem] p-5 flex flex-col justify-between shadow-sm relative group">
                        <Heart size={18} className="text-[#EA4335]" fill="#EA4335" />
                        <p className="text-[13px] font-bold leading-tight">{m}</p>
                        <button onClick={() => handleSync('memories', m, 'remove')} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-200"><Trash2 size={16}/></button>
                    </div>
                ))}
            </div>
            <div className="flex gap-2 pt-4">
                <input id="m-in" className="flex-1 p-4 rounded-2xl border-0 shadow-sm font-bold" placeholder="Capture memory..." />
                <button onClick={() => { const el = document.getElementById('m-in'); if(el.value) {handleSync('memories', el.value); el.value='';} }} className="p-4 bg-[#EA4335] text-white rounded-2xl"><Plus/></button>
            </div>
          </div>
        )}
      </main>

      {activeTab === 'brain' && (
        <div className="p-4 bg-white border-t border-gray-50 pb-10 flex gap-3">
          <button onClick={startVoiceCapture} className={`p-4 rounded-full ${isListening ? 'bg-[#EA4335] text-white animate-pulse' : 'bg-gray-100 text-gray-400'}`}><Mic size={24} /></button>
          <div className="flex-1 relative">
            <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && executeAiQuery()} placeholder="Ask Rosie..." className="w-full p-4 bg-gray-100 rounded-full border-0 font-medium pr-12" />
            <button onClick={executeAiQuery} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#EA4335]"><Send size={20}/></button>
          </div>
        </div>
      )}

      <nav className="bg-white border-t border-gray-50 pb-8 pt-4 flex justify-around">
        {[ {id:'brain', icon:Mic}, {id:'hub', icon:ShoppingCart}, {id:'plans', icon:Calendar}, {id:'memories', icon:Camera} ].map(({id, icon:Icon}) => (
          <button key={id} onClick={() => setActiveTab(id)} className={`p-2 relative transition-all ${activeTab === id ? "text-[#EA4335] scale-110" : "text-gray-200"}`}>
            <Icon size={28} strokeWidth={activeTab === id ? 3 : 2} />
            {activeTab === id && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#EA4335] rounded-full" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
