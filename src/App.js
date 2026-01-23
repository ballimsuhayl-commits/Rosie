import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, setDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, Mic, MicOff, Sparkles, Heart, Book, ArrowLeft, MessageCircle, 
  Grid, Radio, Moon, Sun, MapPin, Home, ShoppingCart, 
  CheckCircle, Search, Star, Utensils, ShieldAlert, Volume2, 
  Calendar, Camera, Scan, Clock, UserCheck, Eye, EyeOff, HeartHandshake, Map as MapUI, X,
  Pill, PenLine, Flame, ChefHat, Receipt, ShieldCheck
} from 'lucide-react';

// --- PRODUCTION CONFIGURATION ---
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo",
  authDomain: "rosie-pa.firebaseapp.com",
  projectId: "rosie-pa",
  storageBucket: "rosie-pa.firebasestorage.app",
  messagingSenderId: "767772651557",
  appId: "1:767772651557:web:239816f833c5af7c20cfcc"
};

// --- SINGLETON INITIALIZATION ---
const app = !getApps().length ? initializeApp(FIREBASE_CONFIG) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const genAI = new GoogleGenerativeAI("AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo");

// --- STATIC CONSTANTS (PERFORMANCE OPTIMIZATION) ---
const FAMILY = {
  "Nasima": { role: "Mum (The Boss)", color: "bg-rose-100 text-rose-600", shape: "40% 60% 70% 30% / 40% 50% 60% 50%", icon: "👸" },
  "Suhayl": { role: "Dad", color: "bg-blue-100 text-blue-600", shape: "60% 40% 30% 70% / 60% 30% 70% 40%", icon: "🧔" },
  "Lisa": { role: "Maintenance", color: "bg-orange-100 text-orange-600", shape: "30% 70% 70% 30% / 30% 30% 70% 70%", icon: "🛠️" },
  "Jabu": { role: "Helper", color: "bg-teal-100 text-teal-600", shape: "50% 20% 50% 80% / 20% 60% 50% 70%", icon: "🧹" }
};

export default function App() {
  // --- UI STATE ---
  const [mode, setMode] = useState('HOME'); 
  const [activeTab, setActiveTab] = useState('hub');
  const [kitchenMode, setKitchenMode] = useState(null); // 'SHOPPING' or 'MEALS'
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // --- SECURITY STATE ---
  const [isMicLocked, setIsMicLocked] = useState(false);
  const [isCamLocked, setIsCamLocked] = useState(false);
  
  // --- HARDWARE STATE ---
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isLensOpen, setIsLensOpen] = useState(false);
  
  // --- DATA STATE ---
  const [familyData, setFamilyData] = useState({ 
    chatHistory: [], shopping: [], memberTasks: {}, diaries: [], 
    plans: [], memories: [], mealPlan: {}, userSettings: { religion: 'Islam' }, dailyMessage: "" 
  });
  
  // --- INPUT STATE ---
  const [inputText, setInputText] = useState('');
  const [newItem, setNewItem] = useState('');
  const [mascotMood, setMascotMood] = useState('NORMAL');
  const [openDiary, setOpenDiary] = useState(null);
  
  // --- REFS ---
  const videoRef = useRef(null);
  const longPressTimer = useRef(null);
  const clickCount = useRef(0);

  // --- 1. SYNC ENGINE (REAL-TIME) ---
  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    
    // Anonymous auth ensures we can read/write without complex login screens for the family
    signInAnonymously(auth).then(() => {
      onSnapshot(doc(db, "families", "main_family"), (doc) => {
        if (doc.exists()) setFamilyData(prev => ({ ...prev, ...doc.data() }));
        else setDoc(doc(db, "families", "main_family"), familyData); // Auto-create if missing
      });
    });
    
    return () => { window.removeEventListener('online', handleStatus); window.removeEventListener('offline', handleStatus); };
  }, []); // Empty dependency array = runs once on mount

  // --- 2. THE AI BRAIN (GEMINI 1.5) ---
  const handleSend = useCallback(async (text) => {
    const msg = text || inputText;
    if (!msg) return;
    
    setInputText('');
    setIsThinking(true);
    setMascotMood('THINKING');

    try {
      // Contextual System Instruction based on current View
      const contextPrompt = activeTab === 'hub' && kitchenMode 
        ? "KITCHEN OS MODE. Focus on recipes, ingredients, and Durban North grocery prices." 
        : "GENERAL PA MODE. Focus on family logistics, diary logging, and medical recall.";

      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: `You are Rosie, Durban North Family PA. Boss: Nasima. 
        CONTEXT: ${contextPrompt}
        RETAIL: Woolworths, Checkers Virginia, PnP Hyper. Currency: ZAR (R).
        LOGIC: If user adds an item, confirm it. If user asks for a meal plan, generate it.`
      });

      const res = await model.generateContent(`System Data: ${JSON.stringify(familyData)}. Request: ${msg}`);
      const reply = res.response.text();
      
      // Update Chat History
      await updateDoc(doc(db, "families", "main_family"), {
        chatHistory: arrayUnion({ role: 'user', text: msg }, { role: 'model', text: reply })
      });
      
      // Speak Response
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply));

    } catch (error) {
      console.error("AI Error:", error);
      window.speechSynthesis.speak(new SpeechSynthesisUtterance("I'm having trouble connecting to the matrix."));
    } finally {
      setIsThinking(false);
      setMascotMood('NORMAL');
    }
  }, [inputText, familyData, activeTab, kitchenMode]);

  // --- 3. HARDWARE CONTROL (VOICE) ---
  const startListening = useCallback(() => {
    if (isMicLocked || !('webkitSpeechRecognition' in window)) return;
    
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false; // Short commands only to save battery/privacy
    recognition.interimResults = false;
    
    recognition.onstart = () => { setIsListening(true); setMascotMood('LISTENING'); };
    recognition.onresult = (e) => handleSend(e.results[e.results.length - 1][0].transcript);
    recognition.onend = () => { setIsListening(false); setMascotMood('NORMAL'); };
    recognition.onerror = () => { setIsListening(false); setMascotMood('NORMAL'); };
    
    recognition.start();
  }, [handleSend, isMicLocked]);

  // --- 4. HARDWARE CONTROL (VISION) ---
  const toggleLens = async () => {
    if (isCamLocked) return;
    
    if (!isLensOpen) {
      setIsLensOpen(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Camera Error", err);
        setIsLensOpen(false);
      }
    } else {
      // Kill the stream to ensure privacy
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      }
      setIsLensOpen(false);
    }
  };

  // --- 5. DATA ACTIONS ---
  const addItem = async () => {
    if(!newItem) return;
    await updateDoc(doc(db, "families", "main_family"), { shopping: arrayUnion(newItem) });
    setNewItem('');
  };

  const removeItem = async (item) => {
    const newList = familyData.shopping.filter(i => i !== item);
    await updateDoc(doc(db, "families", "main_family"), { shopping: newList });
  };

  const handleMealGen = (prompt) => {
    handleSend(`Generate a 7-day meal plan based on: ${prompt}. Return a list.`);
  };

  // --- 6. RENDER COMPONENTS ---
  const RosieMascot = () => (
    <div 
      onMouseDown={() => { longPressTimer.current = setTimeout(() => { setMascotMood('SOS'); handleSend("EMERGENCY SOS TRIGGERED"); }, 1500); }} 
      onMouseUp={() => clearTimeout(longPressTimer.current)} 
      onClick={() => { clickCount.current++; setTimeout(() => { if(clickCount.current === 1) startListening(); clickCount.current = 0; }, 300); }}
      className={`relative w-36 h-36 flex items-center justify-center transition-all duration-700 shadow-2xl cursor-pointer 
        ${isMicLocked ? 'bg-zinc-800' : (mascotMood === 'SOS' ? 'bg-red-600 animate-bounce' : 'bg-red-500')}
      `}
      style={{ borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' }} // Organic Shape
    >
      <div className="flex gap-4">
        {isMicLocked ? <MicOff className="text-zinc-500" size={32} /> : (
          mascotMood === 'NORMAL' ? <><div className="w-6 h-8 bg-white rounded-full"/><div className="w-6 h-8 bg-white rounded-full"/></> :
          mascotMood === 'LISTENING' ? <Mic className="text-white animate-pulse" size={48} /> :
          mascotMood === 'THINKING' ? <Sparkles className="text-white animate-spin" size={48} /> :
          <ShieldAlert className="text-white animate-pulse" size={48} />
        )}
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen flex flex-col ${mode === 'BEDTIME' ? 'bg-black text-white' : 'bg-[#FFF8F0]'}`}>
      
      {/* SECURITY STATUS BAR */}
      <div className="bg-zinc-900 px-6 py-2 flex justify-between items-center z-[60] border-b border-zinc-800">
         <div className="flex items-center gap-4">
            <button onClick={() => setIsMicLocked(!isMicLocked)} className={`flex items-center gap-2 text-[10px] font-black uppercase ${isMicLocked ? 'text-red-500' : 'text-green-500'}`}>
               {isMicLocked ? <MicOff size={14}/> : <Mic size={14}/>} {isMicLocked ? 'Mic Off' : 'Active'}
            </button>
            <button onClick={() => setIsCamLocked(!isCamLocked)} className={`flex items-center gap-2 text-[10px] font-black uppercase ${isCamLocked ? 'text-red-500' : 'text-green-500'}`}>
               {isCamLocked ? <EyeOff size={14}/> : <Eye size={14}/>} {isCamLocked ? 'Lens Off' : 'Active'}
            </button>
         </div>
         <div className="flex items-center gap-1">
            <ShieldCheck size={12} className="text-blue-500"/>
            <span className="text-[8px] font-black text-white uppercase tracking-tighter">Secured</span>
         </div>
      </div>

      {/* HEADER */}
      <header className="px-6 py-4 flex justify-between items-center sticky top-0 z-50 backdrop-blur-xl border-b bg-white/80">
        <h1 className="text-2xl font-black italic text-red-500 tracking-tighter">ROSIE</h1>
        <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
          <button onClick={() => setMode('HOME')} className={`p-2 rounded-lg ${mode === 'HOME' ? 'bg-white shadow-sm' : ''}`}><Sun size={18}/></button>
          <button onClick={() => setMode('BEDTIME')} className={`p-2 rounded-lg ${mode === 'BEDTIME' ? 'bg-zinc-800 text-blue-400' : ''}`}><Moon size={18}/></button>
        </div>
      </header>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 w-full px-6 py-4 pb-48 overflow-x-hidden">
        
        {/* === HUB VIEW === */}
        {activeTab === 'hub' && !kitchenMode && (
          <div className="max-w-5xl mx-auto space-y-10 flex flex-col items-center animate-in fade-in duration-500">
            <RosieMascot />
            
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* KitchenOS Card */}
              <div onClick={() => setKitchenMode('SHOPPING')} className="bg-gradient-to-br from-orange-400 to-red-500 rounded-[45px] p-8 text-white shadow-xl relative overflow-hidden cursor-pointer active:scale-95 transition-transform">
                <ChefHat className="absolute -right-5 -bottom-5 text-white opacity-20" size={120} />
                <h3 className="text-2xl font-black italic mb-2">Kitchen OS</h3>
                <p className="text-xs font-bold opacity-80 uppercase tracking-widest">Meal Plans & Prices</p>
                <div className="flex gap-2 mt-4">
                   <div className="bg-white/20 p-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-1"><ShoppingCart size={12}/> {familyData.shopping?.length || 0} Items</div>
                   <div className="bg-white/20 p-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-1"><Flame size={12}/> Viral</div>
                </div>
              </div>

              {/* Logs Card */}
              <div onClick={() => setActiveTab('diaries')} className="bg-white rounded-[45px] p-8 border-2 border-red-50 text-center shadow-sm cursor-pointer hover:border-red-200 transition-colors">
                <HeartHandshake className="mx-auto text-red-500 mb-2" size={32} />
                <h3 className="text-lg font-black italic">Log Vault</h3>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Medical & Thoughts</p>
              </div>
            </div>

            {/* Family Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
              {Object.keys(FAMILY).map(name => (
                <div key={name} className="bg-white rounded-[35px] p-4 shadow-sm border border-gray-50 flex flex-col items-center justify-center gap-2">
                  <div className={`w-12 h-12 flex items-center justify-center text-2xl shadow-inner ${FAMILY[name].color}`} style={{ borderRadius: FAMILY[name].shape }}>
                    {FAMILY[name].icon}
                  </div>
                  <h3 className="text-xs font-black italic text-gray-700">{name}</h3>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === KITCHEN OS VIEW === */}
        {kitchenMode && (
          <div className="max-w-4xl mx-auto space-y-4 animate-in slide-in-from-right duration-300">
             <div className="flex justify-between items-center">
                <button onClick={() => setKitchenMode(null)} className="flex items-center gap-2 text-red-500 font-black text-xs uppercase"><ArrowLeft size={16}/> Home</button>
                <div className="flex gap-2">
                   <button onClick={() => setKitchenMode('SHOPPING')} className={`px-4 py-2 rounded-full text-xs font-black uppercase ${kitchenMode === 'SHOPPING' ? 'bg-red-500 text-white' : 'bg-white text-gray-400'}`}>List</button>
                   <button onClick={() => setKitchenMode('MEALS')} className={`px-4 py-2 rounded-full text-xs font-black uppercase ${kitchenMode === 'MEALS' ? 'bg-red-500 text-white' : 'bg-white text-gray-400'}`}>Plan</button>
                </div>
             </div>

             {kitchenMode === 'SHOPPING' ? (
               <div className="bg-white p-6 rounded-[40px] shadow-sm border">
                  <h2 className="text-2xl font-black italic mb-4">Shopping List</h2>
                  <div className="flex gap-2 mb-4">
                     <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Add item..." className="flex-1 bg-gray-50 p-4 rounded-2xl outline-none font-bold text-sm"/>
                     <button onClick={addItem} className="bg-black text-white p-4 rounded-2xl"><Plus size={20}/></button>
                  </div>
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                     {familyData.shopping?.map((item, i) => (
                        <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-2xl font-bold text-gray-700">
                           {item} <button onClick={() => removeItem(item)}><Trash2 size={16} className="text-gray-300 hover:text-red-500"/></button>
                        </div>
                     ))}
                     {familyData.shopping?.length === 0 && <p className="text-center text-gray-300 font-bold py-10">List is empty.</p>}
                  </div>
                  <button onClick={() => handleSend("Compare prices for my list at Woolies vs Checkers.")} className="w-full mt-4 bg-green-100 text-green-700 py-3 rounded-2xl text-xs font-black uppercase flex items-center justify-center gap-2"><Receipt size={14}/> Compare Prices</button>
               </div>
             ) : (
               <div className="bg-white p-6 rounded-[40px] shadow-sm border">
                  <h2 className="text-2xl font-black italic mb-4">Meal Plan</h2>
                  <button onClick={() => handleMealGen("Kids favorites & Viral Trends")} className="w-full bg-orange-100 text-orange-600 py-3 rounded-2xl text-xs font-black uppercase flex items-center justify-center gap-2 mb-4"><Sparkles size={14}/> Auto-Generate Week</button>
                  <div className="space-y-2">
                     {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                        <div key={day} className="flex items-center gap-4 p-3 border-b border-gray-100 last:border-0">
                           <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center font-black text-[10px] text-gray-400">{day}</div>
                           <p className="flex-1 font-bold text-gray-600 text-sm truncate">{familyData.mealPlan?.[day] || "Not planned"}</p>
                        </div>
                     ))}
                  </div>
               </div>
             )}
          </div>
        )}

        {/* === LOGS VIEW === */}
        {activeTab === 'diaries' && !openDiary && (
          <div className="max-w-4xl mx-auto space-y-6">
            <h2 className="text-3xl font-black italic tracking-tighter">Secure Logs</h2>
            <div className="grid grid-cols-2 gap-4">
              {['Medication Log', 'Personal Thoughts', 'Staff Log', 'Family Memories'].map(book => (
                <div key={book} onClick={() => setOpenDiary({title: book})} className="bg-white aspect-square rounded-[35px] p-6 shadow-sm border flex flex-col justify-end cursor-pointer active:scale-95 transition-transform">
                  <Book className="text-red-500 mb-2" size={28} />
                  <h3 className="font-black text-sm text-gray-800">{book}</h3>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === LOG ENTRY VIEW === */}
        {openDiary && (
          <div className="max-w-2xl mx-auto space-y-4">
            <button onClick={() => setOpenDiary(null)} className="flex items-center gap-2 text-red-500 font-black text-xs uppercase"><ArrowLeft size={16}/> Back</button>
            <div className="bg-white rounded-[40px] p-8 shadow-xl min-h-[50vh] border relative">
              <div className="flex justify-between items-center border-b pb-4 mb-4">
                 <h2 className="text-xl font-black italic">{openDiary.title}</h2>
                 {openDiary.title === 'Medication Log' && <Pill className="text-blue-500" />}
              </div>
              <p className="text-sm font-bold text-gray-400 text-center py-10">
                 {openDiary.title === 'Medication Log' ? "Rosie will confirm dosage & time." : "Encrypted thought stream."}
              </p>
              <div className="absolute bottom-6 left-6 right-6 flex gap-2">
                <input className="flex-1 bg-gray-50 p-4 rounded-3xl outline-none font-bold text-sm" placeholder="Log entry..." />
                <button onClick={() => handleSend(`Log to ${openDiary.title}`)} className="bg-red-500 text-white p-4 rounded-3xl"><PenLine size={20}/></button>
              </div>
            </div>
          </div>
        )}

        {/* === CHAT VIEW === */}
        {activeTab === 'brain' && (
          <div className="max-w-2xl mx-auto flex flex-col h-[70vh]">
            <div className="flex-1 overflow-y-auto space-y-4 pb-20">
              {familyData.chatHistory.slice(-10).map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-5 rounded-[30px] font-bold text-sm leading-relaxed ${m.role === 'user' ? 'bg-red-500 text-white shadow-md' : 'bg-white border text-gray-700'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isThinking && <div className="text-xs font-black text-red-500 uppercase px-4 animate-pulse">Processing...</div>}
            </div>
            
            <div className="bg-white p-2 rounded-[40px] shadow-2xl flex items-center border border-gray-100 mb-20">
              <input value={inputText} onChange={e => setInputText(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} className="flex-1 px-6 bg-transparent outline-none font-black text-gray-800 text-sm" placeholder="Message Rosie..." />
              <button onClick={() => handleSend()} className="bg-red-500 text-white p-4 rounded-full shadow-lg"><Send size={20}/></button>
            </div>
          </div>
        )}

        {/* === MAP VIEW === */}
        {activeTab === 'map' && (
          <div className="h-[60vh] bg-gray-100 rounded-[50px] border-[8px] border-white shadow-xl flex items-center justify-center relative overflow-hidden">
             <MapUI className="text-gray-300 absolute opacity-20" size={150} />
             <div className="bg-white/80 backdrop-blur-md p-6 rounded-[30px] border shadow-lg flex items-center gap-4 z-10">
                <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center text-white font-black">DN</div>
                <div>
                   <p className="text-[10px] font-black uppercase text-gray-400">Location Status</p>
                   <p className="font-bold text-gray-800">Suhayl: 5 min away</p>
                </div>
                <div className="w-3 h-3 bg-green-500 rounded-full animate-ping ml-2" />
             </div>
          </div>
        )}
      </main>

      {/* PRIVACY SHROUD (CAMERA) */}
      {isLensOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center">
          {isCamLocked ? (
            <div className="text-center space-y-4 animate-in zoom-in duration-300">
               <ShieldCheck size={80} className="text-red-500 mx-auto" />
               <h2 className="text-2xl font-black text-white italic">PRIVACY LOCK ACTIVE</h2>
               <p className="text-gray-400 font-bold text-sm">Camera hardware is physically disconnected.</p>
               <button onClick={() => setIsLensOpen(false)} className="mt-8 bg-white/10 px-8 py-3 rounded-full text-white font-black text-xs uppercase hover:bg-white/20">Close Lens</button>
            </div>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover opacity-80" />
              <div className="absolute bottom-20 left-0 w-full text-center">
                 <p className="text-white font-black italic text-xl animate-pulse">SCANNING...</p>
              </div>
              <button onClick={toggleLens} className="absolute top-10 right-6 bg-black/50 p-4 rounded-full text-white backdrop-blur-md"><X size={24}/></button>
            </>
          )}
        </div>
      )}

      {/* FOOTER NAVIGATION */}
      <nav className="fixed bottom-0 w-full p-6 z-50 flex justify-center">
        <div className="bg-white/95 backdrop-blur-xl border border-white/50 rounded-[55px] shadow-[0_10px_40px_rgba(0,0,0,0.1)] p-2 flex justify-between items-center w-full max-w-sm">
          {[ 
            {id:'brain', icon:MessageCircle, label: 'Chat'}, {id:'hub', icon:Grid, label: 'Hub'}, {id:'map', icon:MapPin, label: 'Map'}, 
            {id:'plans', icon:Calendar, label: 'Plan'}, {id:'memories', icon:Camera, label: 'Pics'}, {id:'diaries', icon:Book, label: 'Log'} 
          ].map(({id, icon:Icon, label}) => (
            <button key={id} onClick={() => {setActiveTab(id); setKitchenMode(null); setOpenDiary(null);}} className={`flex flex-col items-center justify-center w-full py-3 rounded-[35px] transition-all duration-300 ${activeTab === id ? 'bg-red-50 -translate-y-4 shadow-xl' : 'active:scale-95'}`}>
              <Icon size={20} className={activeTab === id ? 'text-red-500' : 'text-gray-300'} strokeWidth={2.5} />
              <span className={`text-[8px] font-black uppercase mt-1 tracking-tighter ${activeTab === id ? 'text-red-500' : 'text-gray-300'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
