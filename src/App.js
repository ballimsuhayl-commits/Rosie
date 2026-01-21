import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, onSnapshot, serverTimestamp, 
  deleteDoc, doc, setDoc, updateDoc, query, orderBy 
} from 'firebase/firestore';
import { 
  Send, MessageCircle, Inbox, Grid, Settings, Plus, Trash2, Check, 
  Sparkles, QrCode, Loader2, Calendar, Radio, Mic, Wand2, 
  BarChart3, ShieldCheck, X, Volume2, Search, Info
} from 'lucide-react';

// ==========================================
// 1. ROSIE VISUAL ASSETS (CODE-DRAWN)
// ==========================================

const ConfettiPattern = () => (
  <div className="absolute inset-0 pointer-events-none opacity-30">
    <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <pattern id="rosie-confetti" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
        <circle cx="20" cy="20" r="3" fill="#8AB4F8" />
        <circle cx="80" cy="80" r="3" fill="#FF8C66" />
        <rect x="40" y="40" width="8" height="4" transform="rotate(45)" fill="#EA4335" opacity="0.4" />
        <path d="M 60 10 Q 70 20 60 30" stroke="#FDE293" strokeWidth="2" fill="none" />
      </pattern>
      <rect width="100%" height="100%" fill="url(#rosie-confetti)" />
    </svg>
  </div>
);

const RosieMascot = ({ state }) => (
  <svg viewBox="0 0 200 200" className={`w-48 h-48 mx-auto drop-shadow-xl transition-all duration-500 ${state === 'thinking' ? 'animate-pulse scale-90' : 'animate-bounce-slow'}`}>
    <path d="M100 30 C115 20, 130 20, 140 40 C155 35, 175 45, 170 70 C190 85, 190 110, 170 125 C175 150, 155 170, 130 160 C115 180, 85 180, 70 160 C45 170, 25 150, 30 125 C10 110, 10 85, 30 70 C25 45, 45 35, 60 40 C70 20, 85 20, 100 30 Z" fill="#FF6B4A" />
    <g transform="rotate(-5 100 100)">
      <circle cx="75" cy="95" r="14" fill="white" /><circle cx="75" cy="95" r={state === 'thinking' ? "4" : "7"} fill="black" />
      <circle cx="125" cy="95" r="14" fill="white" /><circle cx="125" cy="95" r={state === 'thinking' ? "4" : "7"} fill="black" />
    </g>
    {state === 'speaking' ? (
      <ellipse cx="100" cy="125" rx="10" ry="14" fill="black" className="animate-pulse" />
    ) : (
      <path d="M 90 120 Q 100 130 110 120" stroke="black" strokeWidth="3" strokeLinecap="round" fill="none" />
    )}
  </svg>
);

// ==========================================
// 2. MAIN PRODUCTION APP
// ==========================================

export default function RosieApp() {
  const [activeTab, setActiveTab] = useState('BRAIN');
  const [user, setUser] = useState(null);
  const [sharedApiKey, setSharedApiKey] = useState("");
  const [firebaseConfig, setFirebaseConfig] = useState(JSON.parse(localStorage.getItem('rosie_fb') || '{}'));
  
  // Data State
  const [messages, setMessages] = useState([]);
  const [groceries, setGroceries] = useState([]);
  const [plans, setPlans] = useState([]);
  const [memories, setMemories] = useState([]);
  
  // UI State
  const [rosieState, setRosieState] = useState('default');
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const appId = "rosie-family-pa-v2026";
  const baseSegments = ['artifacts', appId, 'public', 'data'];
  const db = useMemo(() => firebaseConfig.apiKey ? getFirestore(initializeApp(firebaseConfig)) : null, [firebaseConfig]);

  // --- WIRING: LISTENERS ---
  useEffect(() => {
    if (!db) return;
    const auth = getAuth();
    signInAnonymously(auth);
    onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        onSnapshot(doc(db, ...baseSegments, 'settings', 'config'), (d) => {
          if (d.exists()) setSharedApiKey(d.data().gemini_key);
        });
        const qMessages = query(collection(db, ...baseSegments, 'messages'), orderBy('createdAt', 'desc'));
        onSnapshot(qMessages, (s) => setMessages(s.docs.map(d => ({id:d.id, ...d.data()})).reverse()));
        onSnapshot(collection(db, ...baseSegments, 'groceries'), (s) => setGroceries(s.docs.map(d => ({id:d.id, ...d.data()}))));
        onSnapshot(collection(db, ...baseSegments, 'plans'), (s) => setPlans(s.docs.map(d => ({id:d.id, ...d.data()}))));
        onSnapshot(collection(db, ...baseSegments, 'memories'), (s) => setMemories(s.docs.map(d => ({id:d.id, ...d.data()}))));
      }
    });
  }, [db]);

  // --- ACTION: DEEP DIVE PODCAST ---
  const handlePodcast = async () => {
    if (!sharedApiKey) return;
    setRosieState('thinking');
    const brief = `Notes: ${memories.map(m=>m.text).slice(0,3).join('. ')}. Plans: ${plans.map(p=>p.title).join(', ')}.`;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${sharedApiKey}`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          contents: [{ parts: [{ text: `You are Rosie the PA. Give a 20s upbeat family update: ${brief}` }] }],
          generationConfig: { response_modalities: ["AUDIO"] }
        })
      });
      const data = await res.json();
      const audio = new Audio("data:audio/wav;base64," + data.candidates[0].content.parts[0].inlineData.data);
      setRosieState('speaking');
      audio.onended = () => setRosieState('default');
      audio.play();
    } catch (e) { setRosieState('default'); }
  };

  // --- ACTION: SMART CHAT ---
  const handleAskRosie = async () => {
    if (!input.trim() || !sharedApiKey) return;
    const text = input; setInput(""); setIsProcessing(true); setRosieState('thinking');
    try {
      await addDoc(collection(db, ...baseSegments, 'messages'), { text, isBot: false, createdAt: serverTimestamp() });
      const prompt = `Context: ${memories.map(m=>m.text).join('. ')}. User: ${text}. (If learning something, end with MEMORY_SAVE: fact)`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${sharedApiKey}`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      let reply = data.candidates[0].content.parts[0].text;
      if (reply.includes('MEMORY_SAVE:')) {
        const fact = reply.split('MEMORY_SAVE:')[1].trim();
        await addDoc(collection(db, ...baseSegments, 'memories'), { text: fact, createdAt: serverTimestamp() });
        reply = reply.split('MEMORY_SAVE:')[0].trim();
      }
      await addDoc(collection(db, ...baseSegments, 'messages'), { text: reply, isBot: true, createdAt: serverTimestamp() });
    } catch (e) { console.error(e); } finally { setIsProcessing(false); setRosieState('default'); }
  };

  const deleteItem = async (coll, id) => await deleteDoc(doc(db, ...baseSegments, coll, id));

  if (!firebaseConfig.apiKey) return <AdminSetup onSave={(c, k) => { localStorage.setItem('rosie_fb', JSON.stringify(c)); setFirebaseConfig(c); /* logic to push k to firestore config doc manually or via console */ }} />;

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-200 font-fredoka p-4">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&display=swap'); body { font-family: 'Fredoka', sans-serif; }`}</style>
      
      <div className="relative w-full max-w-[390px] h-[844px] bg-[#FFF8F0] rounded-[40px] shadow-2xl overflow-hidden border-[8px] border-black flex flex-col">
        <ConfettiPattern />
        
        <main className="flex-1 flex flex-col overflow-hidden relative pt-12">
          
          {activeTab === 'BRAIN' && (
            <div className="flex-1 flex flex-col h-full px-6">
              <div className="flex flex-col items-center mb-6">
                <div className="flex gap-4 mb-2">
                  <button onClick={handlePodcast} className="p-3 bg-white rounded-full shadow-md text-[#EA4335] active:scale-95"><Radio size={24}/></button>
                  <h1 className="text-3xl font-black text-[#FF8C66] tracking-tighter transform -rotate-2">HI ROSIE</h1>
                </div>
                <RosieMascot state={rosieState} />
                <div className="mt-2 bg-orange-100 px-3 py-1 rounded-full text-[9px] font-black text-[#FF8C66] uppercase">Ultimate PA Mode Active</div>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-4 pb-32 scrollbar-hide">
                {messages.length === 0 && <p className="text-center text-gray-400 font-bold opacity-50 mt-10 italic">"Waiting for soccer to finish? Ask me for a summary!"</p>}
                {messages.map(m => (
                  <div key={m.id} className={`flex group ${m.isBot ? 'justify-start' : 'justify-end'}`}>
                    <div className={`p-4 rounded-[26px] text-sm font-bold shadow-sm relative transition-all ${m.isBot ? 'bg-white text-gray-800' : 'bg-[#EA4335] text-white hover:-translate-y-0.5'}`}>
                      {m.text}
                      {!m.isBot && <button onClick={() => deleteItem('messages', m.id)} className="absolute -left-8 top-4 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400"><Trash2 size={14}/></button>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="absolute bottom-24 left-6 right-6">
                <div className="bg-white rounded-full p-2 pl-6 flex items-center shadow-xl border border-orange-50">
                  <input className="flex-1 outline-none text-sm font-bold bg-transparent" placeholder="Ask Rosie anything..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAskRosie()} />
                  <button onClick={handleAskRosie} className="bg-[#EA4335] p-3 rounded-full text-white shadow-lg">
                    {isProcessing ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'HUB' && (
            <div className="flex-1 px-8 pt-6 flex flex-col">
              <h2 className="text-3xl font-black text-gray-800 mb-6 uppercase tracking-tighter">Family Hub</h2>
              <div className="bg-[#FDE293] p-4 rounded-3xl mb-6 shadow-sm border border-yellow-200 flex items-center gap-3">
                <BarChart3 className="text-yellow-700" size={20} />
                <p className="text-[10px] font-bold text-yellow-900 leading-tight">Rosie says: You have {groceries.length} items to pick up before home time!</p>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pb-24 scrollbar-hide">
                {groceries.map(g => (
                  <div key={g.id} className="bg-white p-4 rounded-3xl shadow-sm flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-lg bg-green-50 flex items-center justify-center"><Check size={14} className="text-green-400" strokeWidth={4}/></div>
                      <span className="font-bold text-gray-700 text-sm">{g.item}</span>
                    </div>
                    <button onClick={() => deleteItem('groceries', g.id)} className="opacity-0 group-hover:opacity-100 text-gray-200 hover:text-red-400"><Trash2 size={16}/></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'CALENDAR' && (
             <div className="flex-1 px-8 pt-6 flex flex-col">
                <h2 className="text-3xl font-black text-gray-800 mb-6 uppercase tracking-tighter">Plans</h2>
                <div className="space-y-3 flex-1 overflow-y-auto pb-24 scrollbar-hide">
                  {plans.map(p => (
                    <div key={p.id} className="bg-white p-5 rounded-3xl shadow-sm border-l-8 border-[#8AB4F8] flex justify-between items-center group">
                      <div>
                        <p className="font-bold text-gray-800 text-sm uppercase tracking-tight">{p.title}</p>
                        <p className="text-[10px] text-gray-400 font-black">{p.time || 'All Day'}</p>
                      </div>
                      <button onClick={() => deleteItem('plans', p.id)} className="opacity-0 group-hover:opacity-100 text-gray-200 hover:text-red-400"><Trash2 size={18}/></button>
                    </div>
                  ))}
                </div>
             </div>
          )}

        </main>

        <nav className="px-6 pb-8 z-30 w-full bg-white/80 backdrop-blur-md pt-4">
          <div className="bg-white rounded-[35px] shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2 flex justify-between items-center border border-orange-50">
            {['BRAIN', 'CALENDAR', 'FEED', 'HUB', 'SETUP'].map((t) => (
              <button key={t} onClick={() => setActiveTab(t)} className={`flex flex-col items-center justify-center w-14 py-2 rounded-[25px] transition-all duration-200 ${activeTab === t ? 'bg-orange-50 text-[#EA4335]' : 'text-gray-300'}`}>
                {t === 'BRAIN' ? <MessageCircle size={24}/> : t === 'CALENDAR' ? <Calendar size={24}/> : t === 'FEED' ? <Inbox size={24}/> : t === 'HUB' ? <Grid size={24}/> : <Settings size={24}/>}
                {activeTab === t && <span className="text-[9px] font-black uppercase mt-1">{t}</span>}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

function AdminSetup({ onSave }) {
  const [key, setKey] = useState("");
  const [json, setJson] = useState("");
  return (
    <div className="h-screen bg-[#EA4335] flex items-center justify-center p-10">
      <div className="bg-white p-8 rounded-[40px] w-full max-w-md shadow-2xl">
        <ShieldCheck size={48} className="text-[#EA4335] mb-4" />
        <h2 className="text-2xl font-black tracking-tight">System Initialization</h2>
        <p className="text-sm font-bold text-gray-400 mb-8">Establish secure family credentials.</p>
        <input type="password" placeholder="Gemini API Key" value={key} onChange={e=>setKey(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl mb-4 font-bold outline-none border-2 border-transparent focus:border-red-100 transition-all" />
        <textarea placeholder="Firebase Config JSON" value={json} onChange={e=>setJson(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl h-32 mb-6 font-mono text-xs outline-none border-2 border-transparent focus:border-red-100 transition-all" />
        <button onClick={() => onSave(JSON.parse(json), key)} className="w-full py-5 bg-[#EA4335] text-white rounded-3xl font-black shadow-lg hover:bg-red-600 transition-colors active:scale-95">WIRE SYSTEM</button>
      </div>
    </div>
  );
}
