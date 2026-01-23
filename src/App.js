import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, setDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, Mic, MicOff, Sparkles, Book, ArrowLeft, MessageCircle, 
  Grid, Moon, Sun, MapPin, ShoppingCart, 
  CheckCircle, Search, Star, Utensils, ShieldAlert, 
  Calendar, Camera, Scan, Eye, EyeOff, HeartHandshake, Map as MapUI, X,
  Pill, PenLine, Flame, ChefHat, Receipt, ShieldCheck, Zap, Radio, Volume2, UserCheck, Heart
} from 'lucide-react';

// --- 1. CONFIGURATION ---
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo",
  authDomain: "rosie-pa.firebaseapp.com",
  projectId: "rosie-pa",
  storageBucket: "rosie-pa.firebasestorage.app",
  messagingSenderId: "767772651557",
  appId: "1:767772651557:web:239816f833c5af7c20cfcc"
};

// Singleton Init
const app = !getApps().length ? initializeApp(FIREBASE_CONFIG) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const genAI = new GoogleGenerativeAI("AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo");

// --- 2. STATIC ASSETS ---
const FAMILY = {
  "Nasima": { role: "Mum (The Boss)", color: "bg-rose-100 text-rose-600", shape: "40% 60% 70% 30% / 40% 50% 60% 50%", icon: "👸" },
  "Suhayl": { role: "Dad", color: "bg-blue-100 text-blue-600", shape: "60% 40% 30% 70% / 60% 30% 70% 40%", icon: "🧔" },
  "Lisa": { role: "Maintenance", color: "bg-orange-100 text-orange-600", shape: "30% 70% 70% 30% / 30% 30% 70% 70%", icon: "🛠️" },
  "Jabu": { role: "Helper", color: "bg-teal-100 text-teal-600", shape: "50% 20% 50% 80% / 20% 60% 50% 70%", icon: "🧹" }
};

const INITIAL_DATA = { 
  chatHistory: [], shopping: [], memberTasks: {}, diaries: [], 
  plans: [], memories: [], mealPlan: {}, userSettings: { religion: 'Islam' } 
};

export default function App() {
  // --- 3. STATE ---
  const [mode, setMode] = useState('HOME'); 
  const [activeTab, setActiveTab] = useState('hub');
  const [kitchenMode, setKitchenMode] = useState(null);
  
  // Hardware Security
  const [isMicLocked, setIsMicLocked] = useState(false);
  const [isCamLocked, setIsCamLocked] = useState(false);
  
  // Activity
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isLensOpen, setIsLensOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Data
  const [familyData, setFamilyData] = useState(INITIAL_DATA);
  
  // Input
  const [inputText, setInputText] = useState('');
  const [newItem, setNewItem] = useState('');
  const [mascotMood, setMascotMood] = useState('NORMAL');
  const [openDiary, setOpenDiary] = useState(null);
  
  // Refs
  const videoRef = useRef(null);
  const recognitionRef = useRef(null);
  const longPressTimer = useRef(null);
  const clickCount = useRef(0);

  // --- 4. REAL-TIME SYNC ---
  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);

    signInAnonymously(auth).then(() => {
      onSnapshot(doc(db, "families", "main_family"), (docSnap) => {
        if (docSnap.exists()) {
          setFamilyData(prev => ({ ...prev, ...docSnap.data() }));
        } else {
          setDoc(doc(db, "families", "main_family"), INITIAL_DATA);
        }
      });
    }).catch(e => console.error("Auth:", e));

    return () => { 
      window.removeEventListener('online', handleStatus); 
      window.removeEventListener('offline', handleStatus); 
    };
  }, []);

  // --- 5. HYPER-ALERT AI BRAIN ---
  const handleSend = useCallback(async (text) => {
    const msg = text || inputText;
    if (!msg) return;
    
    setInputText('');
    setIsThinking(true);
    setMascotMood('THINKING');
    
    // ⚡ PRE-EMPTION
    window.speechSynthesis.cancel();

    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: `You are Rosie, Durban North Family PA. Boss: Nasima.
        1. KITCHEN: Compare Woolies/Checkers/PnP prices. Suggest viral meals.
        2. LOGS: Track meds & thoughts.
        3. VOICE: Responses must be short, punchy, and conversational.`
      });

      const res = await model.generateContent(`Data: ${JSON.stringify(familyData)}. Input: ${msg}`);
      const reply = res.response.text();
      
      updateDoc(doc(db, "families", "main_family"), {
        chatHistory: arrayUnion({ role: 'user', text: msg }, { role: 'model', text: reply })
      });
      
      // ⚡ INSTANT FEEDBACK
      const utterance = new SpeechSynthesisUtterance(reply);
      utterance.onend = () => { 
        if(!isMicLocked) startListening(); 
      };
      window.speechSynthesis.speak(utterance);

    } catch (err) {
      console.error(err);
      setMascotMood('SOS');
    } finally {
      setIsThinking(false);
      setMascotMood('NORMAL');
    }
  }, [inputText, familyData, isMicLocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const startListening = useCallback(() => {
    if (isMicLocked || !('webkitSpeechRecognition' in window)) return;
    
    if (recognitionRef.current) recognitionRef.current.stop();

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-ZA'; 
    recognition.onstart = () => { setIsListening(true); setMascotMood('LISTENING'); };
    recognition.onresult = (e) => handleSend(e.results[e.results.length - 1][0].transcript);
    recognition.onend = () => { setIsListening(false); setMascotMood('NORMAL'); };
    recognition.onerror = () => { setIsListening(false); setMascotMood('NORMAL'); };

    recognitionRef.current = recognition;
    recognition.start();
  }, [handleSend, isMicLocked]);

  const toggleLens = async () => {
    if (isCamLocked) return;
    if (!isLensOpen) {
      setIsLensOpen(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch(e) { setIsLensOpen(false); }
    } else {
      if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      setIsLensOpen(false);
    }
  };

  const addItem = async () => {
    if(!newItem) return;
    await updateDoc(doc(db, "families", "main_family"), { shopping: arrayUnion(newItem) });
    setNewItem('');
  };

  const removeItem = async (item) => {
    const newList = familyData.shopping.filter(i => i !== item);
    await updateDoc(doc(db, "families", "main_family"), { shopping: newList });
  };

  // --- 6. RENDER ---
  const RosieMascot = () => (
    <div 
      onMouseDown={() => { longPressTimer.current = setTimeout(() => { setMascotMood('SOS'); handleSend("SOS triggered."); }, 1500); }} 
      onMouseUp={() => clearTimeout(longPressTimer.current)} 
      onClick={() => { clickCount.current++; setTimeout(() => { if(clickCount.current === 1) startListening(); clickCount.current = 0; }, 300); }}
      className={`relative w-40 h-40 flex items-center justify-center transition-all duration-500 shadow-2xl cursor-pointer ${isMicLocked ? 'bg-zinc-800' : (mascotMood === 'SOS' ? 'bg-red-600 animate-bounce' : 'bg-red-500')}`}
      style={{ borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' }}
    >
      <div className="flex gap-4">
        {isMicLocked ? <MicOff className="text-zinc-500" size={32} /> : (
          mascotMood === 'NORMAL' ? <><div className="w-8 h-10 bg-white rounded-full animate-pulse"/><div className="w-8 h-10 bg-white rounded-full animate-pulse"/></> :
          mascotMood === 'LISTENING' ? <Mic className="text-white animate-pulse" size={60} /> :
          <Sparkles className="text-white animate-spin" size={60} />
        )}
      </div>
      {isListening && <div className="absolute inset-0 rounded-full border-8 border-white animate-ping opacity-10" />}
    </div>
  );

  return (
    <div className={`min-h-screen flex flex-col ${mode === 'BEDTIME' ? 'bg-black text-white' : 'bg-[#FFF8F0]'}`}>
      
      {/* SECURITY BAR */}
      <div className="bg-zinc-900 px-6 py-2 flex justify-between items-center z-[60]">
         <div className="flex gap-4">
            <button onClick={() => setIsMicLocked(!isMicLocked)} className={`flex items-center gap-2 text-[10px] font-black uppercase ${isMicLocked ? 'text-red-500' : 'text-green-500'}`}>
               {isMicLocked ? <MicOff size={14}/> : <Mic size={14}/>} {isMicLocked ? 'Privacy' : 'Mic Live'}
            </button>
            <button onClick={() => setIsCamLocked(!isCamLocked)} className={`flex items-center gap-2 text-[10px] font-black uppercase ${isCamLocked ? 'text-red-500' : 'text-green-500'}`}>
               {isCamLocked ? <EyeOff size={14}/> : <Eye size={14}/>} {isCamLocked ? 'Lens Locked' : 'Lens Live'}
            </button>
         </div>
         <div className="flex items-center gap-2">
           <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
           <ShieldCheck size={14} className="text-blue-500"/>
         </div>
      </div>

      <header className="px-6 py-4 flex justify-between items-center sticky top-0 z-50 backdrop-blur-2xl border-b bg-white/90">
        <h1 className="text-2xl font-black italic text-red-500 tracking-tighter">ROSIE</h1>
        <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
          <button onClick={() => setMode('HOME')} className={`p-2 rounded-lg ${mode === 'HOME' ? 'bg-white shadow-sm' : ''}`}><Sun size={18}/></button>
          <button onClick={() => setMode('DRIVING')} className={`p-2 rounded-lg ${mode === 'DRIVING' ? 'bg-white shadow-sm' : 'text-gray-400'}`}><Radio size={18}/></button>
          <button onClick={() => setMode('BEDTIME')} className={`p-2 rounded-lg ${mode === 'BEDTIME' ? 'bg-zinc-800 text-blue-400' : ''}`}><Moon size={18}/></button>
        </div>
      </header>

      <main className="flex-1 w-full px-6 py-6 pb-48 overflow-x-hidden">
        
        {/* === HUB === */}
        {activeTab === 'hub' && !kitchenMode && (
          <div className="max-w-5xl mx-auto space-y-10 flex flex-col items-center">
            <RosieMascot />
            
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Kitchen Card */}
              <div onClick={() => setKitchenMode('SHOPPING')} className="bg-gradient-to-br from-orange-400 to-red-500 rounded-[45px] p-8 text-white shadow-xl relative overflow-hidden cursor-pointer active:scale-95 transition-transform">
                <ChefHat className="absolute -right-5 -bottom-5 text-white opacity-20" size={120} />
                <h3 className="text-2xl font-black italic mb-2">Kitchen OS</h3>
                <p className="text-xs font-bold opacity-80 uppercase tracking-widest">Pricing • Meals • Viral</p>
                <div className="flex gap-2 mt-4">
                   <div className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1"><ShoppingCart size={12}/> {familyData.shopping?.length || 0}</div>
                   <div className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1"><Zap size={10}/> Smart</div>
                   <div className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1"><Search size={10}/> Scout</div>
                </div>
              </div>

              {/* Logs Card */}
              <div onClick={() => setActiveTab('diaries')} className="bg-white rounded-[45px] p-8 border-2 border-red-50 text-center shadow-sm cursor-pointer hover:border-red-200 transition-colors">
                <HeartHandshake className="mx-auto text-red-500 mb-2" size={32} />
                <h3 className="text-lg font-black italic">Log Vault</h3>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Medical & Thoughts</p>
                <div className="mt-2 flex justify-center gap-2">
                   <Heart size={14} className="text-pink-400"/>
                   <ShieldAlert size={14} className="text-blue-400"/>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
              {Object.keys(FAMILY).map(name => (
                <div key={name} className="bg-white rounded-[35px] p-4 shadow-sm border border-gray-50 flex flex-col items-center justify-center gap-2">
                  <div className={`w-12 h-12 flex items-center justify-center text-2xl shadow-inner ${FAMILY[name].color}`} style={{ borderRadius: FAMILY[name].shape }}>{FAMILY[name].icon}</div>
                  <h3 className="text-[10px] font-black italic text-gray-700">{name}</h3>
                  <div className="flex gap-1 text-[8px] uppercase font-black text-gray-400">
                    <CheckCircle size={10} className="text-green-500"/> Ready
                  </div>
                </div>
              ))}
            </div>
            
            <button onClick={() => handleSend("Broadcast message to family")} className="w-full bg-gray-100 p-4 rounded-full flex items-center justify-center gap-2 font-black text-gray-500 text-xs uppercase">
               <Volume2 size={16}/> Broadcast Announcement
            </button>
          </div>
        )}

        {/* === KITCHEN OS === */}
        {kitchenMode && (
          <div className="max-w-4xl mx-auto space-y-4">
             <button onClick={() => setKitchenMode(null)} className="flex items-center gap-2 text-red-500 font-black text-xs uppercase"><ArrowLeft size={16}/> Home</button>
             <div className="bg-white p-6 rounded-[40px] shadow-sm border">
                <div className="flex justify-between items-center mb-4">
                   <h2 className="text-2xl font-black italic">{kitchenMode === 'SHOPPING' ? 'Shopping List' : 'Meal Plan'}</h2>
                   <div className="flex gap-1 bg-gray-50 p-1 rounded-xl">
                      <button onClick={() => setKitchenMode('SHOPPING')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${kitchenMode === 'SHOPPING' ? 'bg-red-500 text-white' : 'text-gray-400'}`}>List</button>
                      <button onClick={() => setKitchenMode('MEALS')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${kitchenMode === 'MEALS' ? 'bg-red-500 text-white' : 'text-gray-400'}`}>Meals</button>
                   </div>
                </div>
                {kitchenMode === 'SHOPPING' ? (
                   <>
                      <div className="flex gap-2 mb-4">
                         <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Add item..." className="flex-1 bg-gray-50 p-4 rounded-2xl outline-none font-bold text-sm"/>
                         <button onClick={addItem} className="bg-black text-white p-4 rounded-2xl"><Plus size={20}/></button>
                      </div>
                      <div className="space-y-2">
                         {familyData.shopping?.map((item, i) => (
                            <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-2xl font-bold text-gray-700">
                               {item} <button onClick={() => removeItem(item)}><Trash2 size={16} className="text-gray-300 hover:text-red-500"/></button>
                            </div>
                         ))}
                      </div>
                      <button onClick={() => handleSend("Analyze basket prices")} className="w-full mt-4 bg-green-100 text-green-700 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-2"><Receipt size={14}/> Compare Prices</button>
                   </>
                ) : (
                   <div className="space-y-2">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                         <div key={day} className="flex items-center gap-4 p-4 border-b border-gray-50 last:border-0">
                            <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center font-black text-[10px] text-red-500">{day}</div>
                            <div className="flex-1 flex items-center gap-2">
                               <Utensils size={12} className="text-gray-300"/>
                               <p className="font-bold text-gray-600 text-sm truncate">{familyData.mealPlan?.[day] || "Plan needed"}</p>
                            </div>
                            <Star size={12} className="text-yellow-400"/>
                         </div>
                      ))}
                      <button onClick={() => handleSend("Generate viral meal plan")} className="w-full mt-6 bg-black text-white py-4 rounded-3xl font-black uppercase text-xs flex items-center justify-center gap-2"><Flame size={14}/> Auto-Gen</button>
                   </div>
                )}
             </div>
          </div>
        )}

        {/* === LOGS === */}
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

        {openDiary && (
          <div className="max-w-2xl mx-auto space-y-4">
            <button onClick={() => setOpenDiary(null)} className="flex items-center gap-2 text-red-500 font-black text-xs uppercase"><ArrowLeft size={16}/> Back</button>
            <div className="bg-white rounded-[40px] p-8 shadow-xl min-h-[50vh] border relative">
              <div className="flex justify-between items-center border-b pb-4 mb-4">
                 <h2 className="text-xl font-black italic">{openDiary.title}</h2>
                 <Pill className="text-blue-500" />
              </div>
              <div className="absolute bottom-6 left-6 right-6 flex gap-2">
                <input className="flex-1 bg-gray-50 p-4 rounded-3xl outline-none font-bold text-sm" placeholder="Log entry..." />
                <button onClick={() => handleSend(`Log to ${openDiary.title}`)} className="bg-red-500 text-white p-4 rounded-3xl"><PenLine size={20}/></button>
              </div>
            </div>
          </div>
        )}

        {/* === CHAT === */}
        {activeTab === 'brain' && (
          <div className="max-w-2xl mx-auto flex flex-col h-[70vh]">
            <div className="flex-1 overflow-y-auto space-y-4 pb-20 scroll-smooth">
              {familyData.chatHistory.slice(-8).map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-5 rounded-[30px] font-bold text-sm leading-relaxed ${m.role === 'user' ? 'bg-red-500 text-white shadow-md' : 'bg-white border text-gray-700'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Visual Feedback for Thinking State */}
            {isThinking && (
              <div className="absolute bottom-24 left-0 w-full flex justify-center">
                 <div className="bg-white/80 backdrop-blur-md px-4 py-2 rounded-full shadow-sm border border-red-100 flex items-center gap-2">
                    <Sparkles size={12} className="text-red-500 animate-spin"/>
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Rosie is processing...</span>
                 </div>
              </div>
            )}

            <div className="bg-white p-2 rounded-[40px] shadow-2xl flex items-center border border-gray-100 mb-20">
              <input 
                value={inputText} 
                onChange={e => setInputText(e.target.value)} 
                onKeyPress={e => e.key === 'Enter' && handleSend()} 
                className="flex-1 px-6 bg-transparent outline-none font-black text-gray-800 text-sm" 
                placeholder={isThinking ? "Thinking..." : "Message Rosie..."}
                disabled={isThinking}
              />
              <button 
                onClick={() => handleSend()} 
                disabled={isThinking}
                className={`p-4 rounded-full shadow-lg transition-all ${isThinking ? 'bg-gray-300 cursor-wait' : 'bg-red-500 text-white'}`}
              >
                <Send size={20}/>
              </button>
            </div>
          </div>
        )}

        {/* === MAP === */}
        {activeTab === 'map' && (
           <div className="max-w-5xl mx-auto h-[65vh] bg-gray-100 rounded-[50px] border-[8px] border-white shadow-2xl relative overflow-hidden flex items-center justify-center">
              <MapUI className="text-gray-300 absolute opacity-20" size={200} />
              <div className="bg-white/80 backdrop-blur-md p-6 rounded-[30px] border shadow-lg flex items-center gap-4 z-10">
                 <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center text-white font-black">DN</div>
                 <div>
                    <p className="text-[10px] font-black uppercase text-gray-400">Dad Status</p>
                    <div className="flex items-center gap-1 font-bold text-gray-800"><UserCheck size={14}/> On Site</div>
                 </div>
              </div>
           </div>
        )}
      </main>

      {/* LENS OVERLAY */}
      {isLensOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center">
          {isCamLocked ? (
            <div className="text-center space-y-4 animate-in zoom-in duration-300">
               <ShieldCheck size={80} className="text-red-500 mx-auto" />
               <h2 className="text-2xl font-black text-white italic">PRIVACY LOCK ACTIVE</h2>
               <button onClick={() => setIsLensOpen(false)} className="mt-8 bg-white/10 px-8 py-3 rounded-full text-white font-black text-xs uppercase">Close</button>
            </div>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-white/30 w-64 h-64 rounded-[40px] flex items-center justify-center">
                 <Scan size={64} className="text-white/50 animate-pulse"/>
              </div>
              <button onClick={toggleLens} className="absolute top-10 right-6 bg-black/50 p-4 rounded-full text-white"><X size={24}/></button>
            </>
          )}
        </div>
      )}

      {/* FOOTER NAV */}
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
