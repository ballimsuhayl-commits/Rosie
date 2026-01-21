import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Plus, Trash2, Radio, Send, ShoppingCart, Calendar, Book, Settings, Mic } from 'lucide-react';

// --- CONFIGURATION ---
const APP_ID = "rosie-family-pa-v2026"; // Must match your Firestore Document ID

const RosieApp = () => {
  const [config, setConfig] = useState(JSON.parse(localStorage.getItem('rosie_config')) || null);
  const [activeTab, setActiveTab] = useState('brain');
  const [data, setData] = useState({ messages: [], groceries: [], plans: [], memories: [] });
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Initialize Firebase and Listeners
  useEffect(() => {
    if (!config?.firebase) return;
    const app = initializeApp(config.firebase);
    const db = getFirestore(app);
    
    // Live "Wiring" to the Family Brain
    const unsub = onSnapshot(doc(db, "artifacts", APP_ID, "public", "data"), (doc) => {
      if (doc.exists()) setData(doc.data());
    });
    return () => unsub();
  }, [config]);

  // --- ACTIONS ---
  const handleSaveConfig = (e) => {
    e.preventDefault();
    const newConfig = {
      gemini: e.target.gemini.value,
      firebase: JSON.parse(e.target.firebase.value)
    };
    localStorage.setItem('rosie_config', JSON.stringify(newConfig));
    setConfig(newConfig);
  };

  const syncData = async (field, value, action = 'add') => {
    if (!config) return;
    const app = initializeApp(config.firebase);
    const db = getFirestore(app);
    const docRef = doc(db, "artifacts", APP_ID, "public", "data");
    
    await updateDoc(docRef, {
      [field]: action === 'add' ? arrayUnion(value) : arrayRemove(value)
    });
  };

  const handleChat = async () => {
    if (!inputText || isGenerating) return;
    const userMsg = { role: 'user', text: inputText, time: new Date().toLocaleTimeString() };
    await syncData('messages', userMsg);
    setInputText("");
    setIsGenerating(true);

    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `You are Rosie, a helpful and upbeat family PA. Context: ${JSON.stringify(data)}. User says: ${inputText}`;
      const result = await model.generateContent(prompt);
      const rosieMsg = { role: 'rosie', text: result.response.text(), time: new Date().toLocaleTimeString() };
      await syncData('messages', rosieMsg);
    } catch (err) { console.error(err); }
    setIsGenerating(false);
  };

  // --- UI COMPONENTS ---
  if (!config) return (
    <div className="p-8 bg-[#EA4335] min-h-screen text-white font-sans">
      <h1 className="text-3xl font-bold mb-4">SYSTEM INITIALIZATION</h1>
      <form onSubmit={handleSaveConfig} className="space-y-4">
        <input name="gemini" placeholder="Gemini API Key" className="w-full p-4 rounded-xl text-black" required />
        <textarea name="firebase" placeholder="Firebase Config JSON" className="w-full p-4 rounded-xl text-black h-40" required />
        <button className="w-full p-4 bg-black rounded-xl font-bold">WIRE SYSTEM</button>
      </form>
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-[#FFF8F0] min-h-screen flex flex-col font-sans text-[#202124]">
      {/* Header */}
      <header className="p-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight">HI ROSIE</h1>
          <p className="text-xs font-bold text-[#EA4335] uppercase">Family Hub Live</p>
        </div>
        <button onClick={() => alert("Generating Family Briefing...")} className="p-3 bg-white rounded-full shadow-md text-[#EA4335]">
          <Radio size={24} />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'brain' && (
          <div className="space-y-4">
            {data.messages?.map((m, i) => (
              <div key={i} className={`p-4 rounded-[24px] max-w-[85%] shadow-sm relative group ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto' : 'bg-white text-black'}`}>
                <p>{m.text}</p>
                <button onClick={() => syncData('messages', m, 'remove')} className="absolute -left-10 top-2 opacity-0 group-hover:opacity-100 text-gray-400">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'hub' && (
          <div className="space-y-6">
            <section>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2"><ShoppingCart size={20}/> Groceries</h2>
              {data.groceries?.map((item, i) => (
                <div key={i} className="flex justify-between items-center p-4 bg-white rounded-2xl mb-2 shadow-sm group">
                  <span>{item}</span>
                  <button onClick={() => syncData('groceries', item, 'remove')} className="opacity-0 group-hover:opacity-100 text-[#EA4335]">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input id="g-in" className="flex-1 p-3 rounded-xl border-none shadow-inner" placeholder="Add item..." />
                <button onClick={() => { syncData('groceries', document.getElementById('g-in').value); document.getElementById('g-in').value=''; }} className="p-3 bg-[#EA4335] text-white rounded-xl"><Plus/></button>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Input Bar & Nav */}
      {activeTab === 'brain' && (
        <div className="p-4 bg-white border-t flex gap-2">
          <input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Ask Rosie..." className="flex-1 p-3 bg-gray-100 rounded-full border-none" />
          <button onClick={handleChat} className="p-3 bg-[#EA4335] text-white rounded-full"><Send size={20}/></button>
        </div>
      )}

      <nav className="p-6 bg-white border-t flex justify-around items-center">
        <button onClick={() => setActiveTab('brain')} className={activeTab === 'brain' ? "text-[#EA4335]" : "text-gray-400"}><Mic size={28}/></button>
        <button onClick={() => setActiveTab('hub')} className={activeTab === 'hub' ? "text-[#EA4335]" : "text-gray-400"}><ShoppingCart size={28}/></button>
        <button onClick={() => setActiveTab('plans')} className={activeTab === 'plans' ? "text-[#EA4335]" : "text-gray-400"}><Calendar size={28}/></button>
        <button onClick={() => setActiveTab('notebook')} className={activeTab === 'notebook' ? "text-[#EA4335]" : "text-gray-400"}><Book size={28}/></button>
      </nav>
    </div>
  );
};

export default RosieApp;
