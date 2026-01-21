import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Plus, Trash2, Radio, Send, ShoppingCart, Calendar, Book, Mic } from 'lucide-react';

const APP_ID = "rosie-family-pa-v2026";

export default function App() {
  const [config, setConfig] = useState(() => JSON.parse(localStorage.getItem('rosie_config')) || null);
  const [activeTab, setActiveTab] = useState('brain');
  const [data, setData] = useState({ messages: [], groceries: [], plans: [], memories: [] });
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!config?.firebase) return;
    try {
      const app = initializeApp(config.firebase);
      const db = getFirestore(app);
      return onSnapshot(doc(db, "artifacts", APP_ID, "public", "data"), (snap) => {
        if (snap.exists()) setData(snap.data());
      });
    } catch (e) { console.error("Firebase Init Error", e); }
  }, [config]);

  const syncData = async (field, value, action = 'add') => {
    if (!config?.firebase) return;
    const db = getFirestore(initializeApp(config.firebase));
    const docRef = doc(db, "artifacts", APP_ID, "public", "data");
    await updateDoc(docRef, { [field]: action === 'add' ? arrayUnion(value) : arrayRemove(value) });
  };

  const handleChat = async () => {
    if (!inputText || !config?.gemini) return;
    const userMsg = { role: 'user', text: inputText, time: new Date().toLocaleTimeString() };
    await syncData('messages', userMsg);
    setInputText("");
    setIsGenerating(true);
    try {
      const genAI = new GoogleGenerativeAI(config.gemini);
      const result = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent(inputText);
      await syncData('messages', { role: 'rosie', text: result.response.text(), time: new Date().toLocaleTimeString() });
    } catch (err) { console.error(err); }
    setIsGenerating(false);
  };

  if (!config) return (
    <div className="p-8 bg-[#EA4335] min-h-screen text-white font-sans">
      <h1 className="text-3xl font-bold mb-4">INITIALIZE ROSIE</h1>
      <form onSubmit={(e) => {
        e.preventDefault();
        const cfg = { gemini: e.target.gemini.value, firebase: JSON.parse(e.target.firebase.value) };
        localStorage.setItem('rosie_config', JSON.stringify(cfg));
        setConfig(cfg);
      }} className="space-y-4">
        <input name="gemini" placeholder="Gemini API Key" className="w-full p-4 rounded-xl text-black" required />
        <textarea name="firebase" placeholder="Firebase Config JSON" className="w-full p-4 rounded-xl text-black h-40" required />
        <button className="w-full p-4 bg-black rounded-xl font-bold">WIRE SYSTEM</button>
      </form>
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-[#FFF8F0] min-h-screen flex flex-col font-sans">
      <header className="p-6 flex justify-between items-center">
        <h1 className="text-2xl font-black">HI ROSIE</h1>
        <button className="p-3 bg-white rounded-full shadow-md text-[#EA4335]"><Radio size={24} /></button>
      </header>

      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'brain' && (
          <div className="space-y-4">
            {data.messages?.map((m, i) => (
              <div key={i} className={`p-4 rounded-2xl relative group ${m.role === 'user' ? 'bg-[#EA4335] text-white ml-auto' : 'bg-white shadow-sm'}`}>
                {m.text}
                <button onClick={() => syncData('messages', m, 'remove')} className="absolute -left-8 top-2 opacity-0 group-hover:opacity-100 text-gray-400"><Trash2 size={14}/></button>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'hub' && (
          <div className="space-y-4">
            {data.groceries?.map((item, i) => (
              <div key={i} className="flex justify-between p-4 bg-white rounded-xl shadow-sm group">
                {item}
                <button onClick={() => syncData('groceries', item, 'remove')} className="text-[#EA4335] opacity-0 group-hover:opacity-100"><Trash2 size={18}/></button>
              </div>
            ))}
            <div className="flex gap-2">
              <input id="g-in" className="flex-1 p-3 rounded-xl border-none shadow-inner" placeholder="Add..." />
              <button onClick={() => { syncData('groceries', document.getElementById('g-in').value); document.getElementById('g-in').value=''; }} className="p-3 bg-[#EA4335] text-white rounded-xl"><Plus/></button>
            </div>
          </div>
        )}
      </main>

      <nav className="p-6 bg-white border-t flex justify-around">
        <button onClick={() => setActiveTab('brain')} className={activeTab === 'brain' ? "text-[#EA4335]" : "text-gray-300"}><Mic size={28}/></button>
        <button onClick={() => setActiveTab('hub')} className={activeTab === 'hub' ? "text-[#EA4335]" : "text-gray-300"}><ShoppingCart size={28}/></button>
        <button onClick={() => setActiveTab('plans')} className={activeTab === 'plans' ? "text-[#EA4335]" : "text-gray-300"}><Calendar size={28}/></button>
      </nav>
      
      {activeTab === 'brain' && (
        <div className="p-4 bg-white flex gap-2">
          <input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Chat..." className="flex-1 p-3 bg-gray-100 rounded-full border-none" />
          <button onClick={handleChat} className="p-3 bg-[#EA4335] text-white rounded-full"><Send size={20}/></button>
        </div>
      )}
    </div>
  );
}
