import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, setDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Send, Mic, MicOff, Sparkles, MessageCircle, 
  Grid, MapPin, Radio, ArrowLeft, ChefHat, HeartHandshake, 
  Eye, EyeOff, ShieldCheck, Lightbulb, Search, Volume2
} from 'lucide-react';

// --- CONFIG ---
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

export default function App() {
  const [activeTab, setActiveTab] = useState('hub');
  const [isMicLocked, setIsMicLocked] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mascotMood, setMascotMood] = useState('NORMAL');
  const [familyData, setFamilyData] = useState({ chatHistory: [], shopping: [] });
  const [inputText, setInputText] = useState('');
  
  const recognitionRef = useRef(null);
  const synthRef = window.speechSynthesis;

  // --- 1. THE CONVERSATIONAL BRAIN ---
  const handleSend = useCallback(async (text) => {
    if (!text && !inputText) return;
    const msg = text || inputText;
    
    setInputText('');
    setIsThinking(true);
    setMascotMood('THINKING');
    synthRef.cancel(); // Stop talking to listen

    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: `You are Rosie, the Durban North Family Companion. 
        TONE: Playful, ultra-fast, and helpful. 
        STYLE: Use short sentences for voice. 
        RADIO MODE: If asked to research or read, compile a clear, interesting report.
        WAKE WORD: Your name is Rosie.`
      });

      const res = await model.generateContent(`Context: ${JSON.stringify(familyData)}. Prompt: ${msg}`);
      const reply = res.response.text();

      // Update Firebase
      updateDoc(doc(db, "families", "main_family"), {
        chatHistory: arrayUnion({ role: 'user', text: msg }, { role: 'model', text: reply })
      });

      setMascotMood('IDEA');
      setIsThinking(false);
      speak(reply);

    } catch (e) {
      setMascotMood('NORMAL');
      setIsThinking(false);
    }
  }, [inputText, familyData]); // eslint-disable-line

  // --- 2. HIGH-SPEED SPEECH ENGINE ---
  const speak = (text) => {
    setIsSpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1; // Slightly faster for natural feel
    utterance.pitch = 1.2; // Playful Rosie tone
    
    utterance.onend = () => {
      setIsSpeaking(false);
      setMascotMood('NORMAL');
      if (!isMicLocked) startWakeWordListener(); // Go back to listening
    };

    synthRef.speak(utterance);
  };

  // --- 3. WAKE WORD LISTENER (ROSIE...) ---
  const startWakeWordListener = useCallback(() => {
    if (isMicLocked || isSpeaking || !('webkitSpeechRecognition' in window)) return;
    
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-ZA';

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
      
      // Check for Wake Word or "Research" command
      if (transcript.includes("rosie")) {
        recognition.stop();
        setMascotMood('LISTENING');
        setIsListening(true);
        // Direct trigger after wake word
        const command = transcript.split("rosie")[1];
        if (command && command.length > 3) {
          handleSend(command);
        } else {
          // Just heard name, wait for full command
          setTimeout(() => startWakeWordListener(), 1000);
        }
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (!isMicLocked && !isSpeaking) recognition.start();
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isMicLocked, isSpeaking, handleSend]);

  useEffect(() => {
    signInAnonymously(auth).then(() => {
      onSnapshot(doc(db, "families", "main_family"), (docSnap) => {
        if (docSnap.exists()) setFamilyData(prev => ({ ...prev, ...docSnap.data() }));
      });
    });
    startWakeWordListener();
    return () => synthRef.cancel();
  }, [startWakeWordListener]); // eslint-disable-line

  // --- 4. PRECISION MASCOT ---
  const RosieMascot = () => (
    <div className="relative w-72 h-72 flex justify-center items-center cursor-pointer" onClick={() => handleSend("Rosie, tell me a news update")}>
      {/* Radio Wave Background (only when speaking/radio mode) */}
      {isSpeaking && (
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
          <circle className="radio-wave" cx="100" cy="100" r="40" />
          <circle className="radio-wave" cx="100" cy="100" r="40" />
          <circle className="radio-wave" cx="100" cy="100" r="40" />
        </svg>
      )}

      <svg viewBox="0 0 200 200" className={`w-full h-full animate-float transition-all duration-500`}>
        <path fill="#FF7F50" d="M100,20 C120,20 130,40 150,45 C170,50 185,70 180,95 C175,120 185,145 165,160 C145,175 125,165 100,180 C75,165 55,175 35,160 C15,145 25,120 20,95 C15,70 30,50 50,45 C70,40 80,20 100,20 Z" />
        <g transform="translate(75, 80)">
           <circle fill="white" cx="0" cy="0" r="13" />
           <circle fill="black" cx={isThinking ? "4" : "0"} cy="0" r="6" />
           <circle fill="white" cx="50" cy="0" r="13" />
           <circle fill="black" cx={isThinking ? "46" : "50"} cy="0" r="6" />
        </g>
        <path 
          d="M85,115 Q100,130 115,115" 
          fill="none" 
          stroke="black" 
          strokeWidth="3" 
          strokeLinecap="round" 
          className={isSpeaking ? "animate-talk" : ""}
        />
      </svg>
      
      {isThinking && <div className="absolute top-0 right-0 p-4 bg-white rounded-full shadow-lg animate-bounce"><Sparkles className="text-orange-500"/></div>}
      {mascotMood === 'IDEA' && <div className="absolute -top-10"><Lightbulb size={60} className="text-yellow-400 animate-pulse" fill="currentColor"/></div>}
    </div>
  );

  return (
    <div className={`min-h-screen ${isMicLocked ? 'bg-zinc-100' : 'bg-[#FFF8F0]'} flex flex-col transition-colors duration-1000`}>
      {/* PRIVACY BAR */}
      <div className="bg-zinc-900 px-6 py-2 flex justify-between items-center z-[60]">
         <button onClick={() => setIsMicLocked(!isMicLocked)} className={`flex items-center gap-2 text-[10px] font-black uppercase ${isMicLocked ? 'text-red-500' : 'text-green-500'}`}>
            {isMicLocked ? <MicOff size={14}/> : <Mic size={14}/>} {isMicLocked ? 'Privacy Mode' : 'Wake Word: Rosie'}
         </button>
         <ShieldCheck size={14} className="text-blue-500"/>
      </div>

      <main className="flex-1 flex flex-col items-center px-6 py-10 overflow-y-auto">
        {activeTab === 'hub' && (
          <div className="max-w-md w-full flex flex-col items-center gap-8">
            <RosieMascot />
            
            <div className="text-center space-y-2">
              <h1 className="text-4xl font-black text-gray-800">ROSIE RADIO</h1>
              <p className="text-xs font-bold text-orange-400 uppercase tracking-widest">Say "Rosie, research [topic]"</p>
            </div>

            <div className="grid grid-cols-1 gap-4 w-full">
              <button onClick={() => handleSend("Rosie, give me the daily briefing")} className="bg-white border-4 border-orange-200 p-6 rounded-[40px] shadow-xl flex items-center justify-between group active:scale-95 transition-all">
                <div className="flex items-center gap-4">
                  <div className="bg-orange-100 p-4 rounded-3xl text-orange-600"><Radio size={24}/></div>
                  <div className="text-left">
                    <h3 className="font-black italic">Morning Briefing</h3>
                    <p className="text-[10px] font-bold text-gray-400">RESEARCH & READ</p>
                  </div>
                </div>
                <Volume2 className="text-orange-300" />
              </button>

              <button onClick={() => setActiveTab('brain')} className="bg-white border-4 border-blue-100 p-6 rounded-[40px] shadow-xl flex items-center justify-between group active:scale-95 transition-all">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-100 p-4 rounded-3xl text-blue-600"><MessageCircle size={24}/></div>
                  <div className="text-left">
                    <h3 className="font-black italic">Chat Mode</h3>
                    <p className="text-[10px] font-bold text-gray-400">INSTANT RESPONSES</p>
                  </div>
                </div>
                <Zap className="text-blue-300" />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'brain' && (
          <div className="w-full max-w-2xl h-full flex flex-col">
            <button onClick={() => setActiveTab('hub')} className="mb-4 text-orange-500 font-black flex items-center gap-2"><ArrowLeft/> Back</button>
            <div className="flex-1 overflow-y-auto space-y-4 pb-24">
              {familyData.chatHistory?.slice(-10).map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-[30px] font-bold text-sm ${m.role === 'user' ? 'bg-orange-500 text-white' : 'bg-white border'}`}>{m.text}</div>
                </div>
              ))}
            </div>
            <div className="fixed bottom-32 left-6 right-6 flex items-center gap-2 bg-white p-2 rounded-full shadow-2xl border">
              <input value={inputText} onChange={e => setInputText(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} className="flex-1 px-6 outline-none font-bold" placeholder="Type or say 'Rosie'..." />
              <button onClick={() => handleSend()} className="bg-orange-500 text-white p-4 rounded-full"><Send size={20}/></button>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER NAV */}
      <nav className="fixed bottom-0 w-full p-6 z-50 flex justify-center">
        <div className="bg-white/95 backdrop-blur-xl border border-white/50 rounded-[55px] shadow-2xl p-2 flex justify-between items-center w-full max-w-sm">
          {[ 
            {id:'brain', icon:MessageCircle, label: 'CHAT'}, {id:'hub', icon:Radio, label: 'RADIO'}, 
            {id:'map', icon:MapPin, label: 'MAP'} 
          ].map(({id, icon:Icon, label}) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`flex flex-col items-center justify-center w-full py-3 rounded-[35px] transition-all ${activeTab === id ? 'bg-orange-50' : ''}`}>
              <Icon size={20} className={activeTab === id ? 'text-orange-500' : 'text-gray-300'} />
              <span className={`text-[8px] font-black mt-1 ${activeTab === id ? 'text-orange-500' : 'text-gray-300'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// Custom Zap icon for UI
const Zap = ({className}) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
);
