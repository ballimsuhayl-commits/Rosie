import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, setDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Send, Mic, MicOff, Sparkles, MessageCircle, 
  Grid, MapPin, Radio, ArrowLeft, ChefHat, 
  ShieldCheck, Lightbulb, Search, Volume2, Navigation, Zap
} from 'lucide-react';

// --- INFRA ---
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo",
  authDomain: "rosie-pa.firebaseapp.com",
  projectId: "rosie-pa",
  storageBucket: "rosie-pa.firebasestorage.app",
  messagingSenderId: "767772651557",
  appId: "1:767772651557:web:239816f833c5af7c20cfcc"
};

const app = !getApps().length ? initializeApp(FIREBASE_CONFIG) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const genAI = new GoogleGenerativeAI("AIzaSyCGqIAgtH4Y7oTMBo__VYQvVCdG_xR2kKo");

// Restore Full Data Structure for AI Context
const INITIAL_DATA = { 
  chatHistory: [], shopping: [], memberTasks: {}, diaries: [], 
  plans: [], memories: [], mealPlan: {}, userSettings: { religion: 'Islam' } 
};

export default function App() {
  const [activeTab, setActiveTab] = useState('hub');
  const [isMicLocked, setIsMicLocked] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [radioActive, setRadioActive] = useState(false);
  
  const [familyData, setFamilyData] = useState(INITIAL_DATA);
  const [inputText, setInputText] = useState('');
  
  // Refs for stability (prevents dependency loops)
  const recognitionRef = useRef(null);
  const synthRef = window.speechSynthesis;
  const familyDataRef = useRef(INITIAL_DATA); // Keeps fresh data without re-rendering listeners

  // Sync Ref with State
  useEffect(() => { familyDataRef.current = familyData; }, [familyData]);

  // --- 1. VOICE BRAIN ---
  const handleAction = useCallback(async (transcript) => {
    const msg = transcript.toLowerCase();
    
    // NAVIGATION
    if (msg.includes("navigate to") || msg.includes("directions to")) {
      const dest = msg.split(/navigate to|directions to/)[1].trim();
      speak(`Navigating to ${dest}.`);
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`, '_blank');
      return;
    }

    // RESEARCH / RADIO
    setIsThinking(true);
    if (msg.includes("research") || msg.includes("read")) setRadioActive(true);

    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: `You are Rosie. 
        1. SPEED: Concise, fast, helpful. 
        2. RADIO: If asked to research, be engaging like a news anchor. 
        3. WAKE WORD: Your name is Rosie.`
      });

      // Use Ref for data to avoid stale closures in the mic loop
      const res = await model.generateContent(`Context: ${JSON.stringify(familyDataRef.current)}. Prompt: ${transcript}`);
      const reply = res.response.text();

      updateDoc(doc(db, "families", "main_family"), {
        chatHistory: arrayUnion({ role: 'user', text: transcript }, { role: 'model', text: reply })
      });

      setIsThinking(false);
      speak(reply);
    } catch (e) {
      setIsThinking(false);
      speak("I couldn't process that. Try again?");
    }
  }, []);

  // --- 2. SPEECH ENGINE ---
  const speak = (text) => {
    synthRef.cancel();
    setIsSpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1; 
    utterance.pitch = 1.1;
    utterance.onend = () => {
      setIsSpeaking(false);
      setRadioActive(false);
      // Ensure mic restarts safely
      if (!isMicLocked && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch(e) {} 
      }
    };
    synthRef.speak(utterance);
  };

  // --- 3. WAKE-WORD LISTENER ---
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) return;
    
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false; // Changed to false for stability
    recognition.lang = 'en-ZA';

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
      
      if (transcript.includes("rosie")) {
        recognition.stop(); // Stop scanning to process command
        setIsListening(true);
        const command = transcript.split("rosie")[1]?.trim();
        
        if (command) {
          handleAction(command);
        } else {
          speak("I'm listening.");
        }
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart loop if not locked and not speaking
      if (!isMicLocked && !synthRef.speaking) {
         try { recognition.start(); } catch(e){}
      }
    };

    recognitionRef.current = recognition;
    if(!isMicLocked) recognition.start();

    return () => recognition.stop();
  }, [isMicLocked, handleAction]); // Clean dependency array

  // --- 4. DATA SYNC ---
  useEffect(() => {
    signInAnonymously(auth).then(() => {
      onSnapshot(doc(db, "families", "main_family"), (docSnap) => {
        if (docSnap.exists()) setFamilyData(prev => ({ ...prev, ...docSnap.data() }));
        else setDoc(doc(db, "families", "main_family"), INITIAL_DATA);
      });
    });
  }, []);

  // --- 5. UI COMPONENTS ---
  const RosieMascot = () => (
    <div className="relative w-72 h-72 flex justify-center items-center cursor-pointer" onClick={() => handleAction("Rosie, tell me a random fact")}>
      {(isSpeaking || radioActive) && (
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
          <circle className="signal-wave" cx="100" cy="100" r="45" />
          <circle className="signal-wave" cx="100" cy="100" r="45" />
          <circle className="signal-wave" cx="100" cy="100" r="45" />
        </svg>
      )}

      <svg viewBox="0 0 200 200" className={`w-full h-full animate-rosie-idle transition-all duration-700`}>
        <path fill="#FF7F50" d="M100,20 C120,20 130,40 150,45 C170,50 185,70 180,95 C175,120 185,145 165,160 C145,175 125,165 100,180 C75,165 55,175 35,160 C15,145 25,120 20,95 C15,70 30,50 50,45 C70,40 80,20 100,20 Z" />
        <g transform="translate(75, 80)">
           <circle fill="white" cx="0" cy="0" r="14" />
           <circle fill="black" cx={isThinking ? "5" : "0"} cy="0" r="7" />
           <circle fill="white" cx="50" cy="0" r="14" />
           <circle fill="black" cx={isThinking ? "45" : "50"} cy="0" r="7" />
        </g>
        <path 
          d="M85,115 Q100,130 115,115" 
          fill="none" 
          stroke="black" 
          strokeWidth="4" 
          strokeLinecap="round" 
          className={isSpeaking ? "mouth-talking" : ""}
        />
      </svg>

      {isThinking && <Sparkles className="absolute top-0 right-10 text-orange-400 animate-spin" size={48} />}
      {radioActive && <div className="absolute -top-6 bg-red-500 text-white px-4 py-1 rounded-full text-[10px] font-black animate-bounce">RADIO LIVE</div>}
    </div>
  );

  return (
    <div className={`min-h-screen ${isMicLocked ? 'bg-zinc-200' : 'bg-[#FFF8F0]'} flex flex-col transition-all duration-1000`}>
      <div className="bg-zinc-900 px-6 py-3 flex justify-between items-center z-[60] shadow-xl">
         <button onClick={() => setIsMicLocked(!isMicLocked)} className={`flex items-center gap-3 text-[11px] font-black uppercase tracking-tighter ${isMicLocked ? 'text-red-500' : 'text-green-500'}`}>
            {isMicLocked ? <MicOff size={16}/> : <Mic size={16}/>} {isMicLocked ? 'Privacy Locked' : 'Wake Word: Rosie'}
         </button>
         <div className="flex items-center gap-2">
            {isSpeaking && <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"/>}
            <ShieldCheck size={18} className="text-blue-500"/>
         </div>
      </div>

      <main className="flex-1 flex flex-col items-center px-6 py-6 overflow-y-auto">
        {activeTab === 'hub' && (
          <div className="max-w-md w-full flex flex-col items-center gap-8">
            <RosieMascot />
            
            <div className="text-center space-y-1">
              <h1 className="text-5xl font-black text-gray-800 tracking-tighter italic">ROSIE PRO</h1>
              <p className="text-xs font-black text-orange-500 uppercase tracking-widest">Conversational AI Engine</p>
            </div>

            <div className="grid grid-cols-1 gap-4 w-full">
              <button onClick={() => handleAction("Rosie, research and read out loud the news update")} className="bg-white border-b-8 border-orange-200 p-8 rounded-[45px] shadow-2xl flex items-center justify-between group active:translate-y-2 active:border-b-0 transition-all">
                <div className="flex items-center gap-5">
                  <div className="bg-orange-100 p-5 rounded-3xl text-orange-600 group-hover:rotate-12 transition-transform"><Radio size={28}/></div>
                  <div className="text-left">
                    <h3 className="text-xl font-black italic text-gray-800">Rosie Radio</h3>
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Topic Researcher</p>
                  </div>
                </div>
                <Search className="text-orange-200" size={24} />
              </button>

              <button onClick={() => handleAction("Rosie, navigate to Umhlanga Rocks")} className="bg-white border-b-8 border-blue-200 p-8 rounded-[45px] shadow-2xl flex items-center justify-between group active:translate-y-2 active:border-b-0 transition-all">
                <div className="flex items-center gap-5">
                  <div className="bg-blue-100 p-5 rounded-3xl text-blue-600 group-hover:-rotate-12 transition-transform"><MapPin size={28}/></div>
                  <div className="text-left">
                    <h3 className="text-xl font-black italic text-gray-800">Voice Navigation</h3>
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">GPS Command Center</p>
                  </div>
                </div>
                <Navigation className="text-blue-200" size={24} />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'brain' && (
          <div className="w-full max-w-2xl h-full flex flex-col bg-white rounded-[50px] p-6 shadow-2xl border-4 border-orange-50">
            <header className="flex justify-between items-center mb-6">
                <button onClick={() => setActiveTab('hub')} className="text-orange-500 font-black flex items-center gap-2 uppercase text-xs tracking-widest"><ArrowLeft size={16}/> Home</button>
                <div className="bg-orange-100 px-4 py-1 rounded-full text-[10px] font-black text-orange-600 uppercase tracking-widest">Chat Brain</div>
            </header>
            <div className="flex-1 overflow-y-auto space-y-6 pb-24 px-2 scroll-smooth">
              {familyData.chatHistory?.slice(-12).map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-5 rounded-[35px] font-bold text-sm leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-orange-500 text-white rounded-tr-none' : 'bg-gray-50 border text-gray-700 rounded-tl-none'}`}>{m.text}</div>
                </div>
              ))}
              {isThinking && <div className="flex justify-start"><div className="bg-gray-100 p-4 rounded-full animate-pulse text-[10px] font-black text-gray-400 uppercase tracking-widest">Rosie is thinking...</div></div>}
            </div>
            <div className="absolute bottom-36 left-12 right-12 flex items-center gap-3 bg-white p-3 rounded-full shadow-[0_15px_40px_rgba(0,0,0,0.1)] border-2 border-orange-50">
              <input value={inputText} onChange={e => setInputText(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleAction(inputText)} className="flex-1 px-6 outline-none font-bold text-gray-800" placeholder="Type or say 'Rosie'..." />
              <button onClick={() => handleAction(inputText)} className="bg-orange-500 text-white p-4 rounded-full hover:scale-105 transition-transform"><Send size={20}/></button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 w-full p-6 z-50 flex justify-center">
        <div className="bg-white/95 backdrop-blur-3xl border border-white/50 rounded-[60px] shadow-[0_15px_60px_rgba(0,0,0,0.2)] p-2 flex justify-between items-center w-full max-w-sm">
          {[ 
            {id:'brain', icon:Zap, label: 'CHAT'}, {id:'hub', icon:Radio, label: 'RADIO'}, 
            {id:'map', icon:MapPin, label: 'NAV'} 
          ].map(({id, icon:Icon, label}) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`flex flex-col items-center justify-center w-full py-4 rounded-[40px] transition-all duration-300 ${activeTab === id ? 'bg-orange-500 text-white -translate-y-4 shadow-xl' : 'text-gray-300'}`}>
              <Icon size={24} strokeWidth={2.5} />
              <span className={`text-[9px] font-black mt-1 tracking-widest ${activeTab === id ? 'text-white' : 'text-gray-300'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
