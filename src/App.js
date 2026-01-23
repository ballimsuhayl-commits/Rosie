import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, setDoc } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, ShoppingCart, Calendar, Mic, MicOff, Camera, Book, 
  ArrowLeft, X, Grid, Radio, Scan, Navigation, Signal, Wifi, Activity,
  Heart, CheckCircle, Settings, MessageCircle, MapPin, ShieldCheck
} from 'lucide-react';

// --- CONFIGURATION (LOCKED) ---
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

// --- TOOL SCHEMAS (LOCKED) ---
const ROSIE_TOOLS = [
  { name: "manage_shopping", description: "Update grocery list.", parameters: { type: "object", properties: { item: {type:"string"}, action: {type:"string", enum:["add","remove"]}}, required: ["item","action"]}},
  { name: "manage_calendar", description: "Update family schedule.", parameters: { type: "object", properties: { event: {type:"string"}, action: {type:"string", enum:["add","remove"]}}, required: ["event","action"]}},
  { name: "assign_task", description: "Assign task to member.", parameters: { type: "object", properties: { member: {type:"string"}, task: {type:"string"}}, required: ["member","task"]}},
  { name: "write_diary", description: "Log to specific diary book.", parameters: { type: "object", properties: { book: {type:"string"}, text: {type:"string"}}, required: ["book","text"]}},
  { name: "log_finance", description: "Log price estimates/spending.", parameters: { type: "object", properties: { amount: {type:"number"}, category: {type:"string"}}, required: ["amount","category"]}},
  { name: "save_memory", description: "Save a family memory.", parameters: { type: "object", properties: { description: {type:"string"}}, required: ["description"]}}
];

export default function App() {
  // --- STATE (UI & DATA) ---
  const [activeTab, setActiveTab] = useState('brain');
  const [isMicLocked, setIsMicLocked] = useState(false); // Privacy Switch
  const [isMicActive, setIsMicActive] = useState(false); // Engine Status
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const [inputText, setInputText] = useState("");
  const [familyData, setFamilyData] = useState({ shopping: [], plans: [], chatHistory: [], memberTasks: {}, diary_entries: [], memories: [], estimates: [] });
  
  // --- REFS ---
  const recognitionRef = useRef(null);
  const synthRef = window.speechSynthesis;
  const familyDataRef = useRef(familyData);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => { familyDataRef.current = familyData; }, [familyData]);

  // --- NODE: DATA SYNC ---
  useEffect(() => {
    signInAnonymously(auth).then(() => {
      onSnapshot(doc(db, "families", "main_family"), (docSnap) => {
        if (docSnap.exists()) setFamilyData(prev => ({ ...prev, ...docSnap.data() }));
      });
    });
  }, []);

  // --- NODE: MOTOR EXECUTION ---
  const executeAction = async (name, args) => {
    const docRef = doc(db, "families", "main_family");
    let feedback = "";
    try {
      if (name === "manage_shopping") {
        await updateDoc(docRef, { shopping: args.action === 'add' ? arrayUnion(args.item) : arrayRemove(args.item) });
        feedback = `🛒 ${args.item} ${args.action}ed.`;
      } else if (name === "manage_calendar") {
        await updateDoc(docRef, { plans: args.action === 'add' ? arrayUnion(args.event) : arrayRemove(args.event) });
        feedback = `📅 Calendar: ${args.event}.`;
      } else if (name === "assign_task") {
        const field = `memberTasks.${args.member}`;
        await updateDoc(docRef, { [field]: arrayUnion(args.task) });
        feedback = `✅ Task for ${args.member}: ${args.task}.`;
      } else if (name === "write_diary") {
        await updateDoc(docRef, { diary_entries: arrayUnion({ book: args.book, text: args.text, ts: new Date().toLocaleString() }) });
        feedback = `📖 Logged to ${args.book}.`;
      } else if (name === "log_finance") {
        await updateDoc(docRef, { estimates: arrayUnion({ amount: args.amount, category: args.category, ts: new Date().toLocaleDateString() }) });
        feedback = `💰 Spent R${args.amount} on ${args.category}.`;
      } else if (name === "save_memory") {
        await updateDoc(docRef, { memories: arrayUnion(args.description) });
        feedback = `❤️ Memory saved!`;
      }
      setIsCelebrating(true);
      setTimeout(() => setIsCelebrating(false), 2000);
      return feedback;
    } catch (e) { return "Execution failed."; }
  };

  const speak = (text) => {
    synthRef.cancel();
    setIsSpeaking(true);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-ZA';
    u.onend = () => setIsSpeaking(false);
    synthRef.speak(u);
  };

  // --- NODE: BRAIN ---
  const handleAction = useCallback(async (transcript) => {
    if (!transcript) return;
    setIsThinking(true);
    
    // Quick Nav
    if (transcript.toLowerCase().includes("navigate to")) {
      const dest = transcript.split("navigate to")[1];
      speak(`Opening maps for ${dest}.`);
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
      setIsThinking(false);
      return;
    }

    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        tools: [{ functionDeclarations: ROSIE_TOOLS }] 
      });
      const result = await model.generateContent(`Context: ${JSON.stringify(familyDataRef.current)}. Command: ${transcript}`);
      const call = result.response.functionCalls()?.[0];

      if (call) {
        const feedback = await executeAction(call.name, call.args);
        speak(feedback);
      } else {
        const reply = result.response.text();
        speak(reply);
        await updateDoc(doc(db, "families", "main_family"), { chatHistory: arrayUnion({ role: 'rosie', text: reply, ts: new Date().toLocaleTimeString() }) });
      }
    } catch (e) { speak("Neural flicker. Try again?"); }
    setIsThinking(false);
  }, []);

  // --- NODE: IRONCLAD VOICE EAR ---
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) return;
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-ZA';

    recognition.onstart = () => setIsMicActive(true);
    recognition.onend = () => setIsMicActive(false);

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
      if (!isMicLocked && transcript.includes("rosie")) {
        const cmd = transcript.replace(/^(hey|okay|yo)?\s*rosie/, "").trim();
        if (cmd.length > 1) handleAction(cmd);
        else speak("Listening...");
      }
    };

    recognitionRef.current = recognition;
    if (!isMicLocked) { try { recognition.start(); } catch(e){} }

    const heartbeat = setInterval(() => {
      if (!isMicLocked && !isMicActive && !isSpeaking) {
        try { recognitionRef.current.start(); } catch(e){}
      }
    }, 2000);

    return () => { clearInterval(heartbeat); recognition.stop(); };
  }, [handleAction, isMicLocked, isMicActive, isSpeaking]);

  // --- VISION NODE ---
  const captureAndAnalyze = async () => {
    const ctx = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const img = canvasRef.current.toDataURL('image/jpeg', 0.8).split(',')[1];
    setIsCameraOpen(false);
    setIsThinking(true);
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const res = await model.generateContent(["Analyze for family PA. If receipt, total it. If item, name it.", { inlineData: { data: img, mimeType: "image/jpeg" } }]);
      handleAction(`I see this: ${res.response.text()}`);
    } catch (e) { speak("Can't see clearly."); }
    setIsThinking(false);
  };

  // --- UI COMPONENTS ---
  const RosieMascot = () => (
    <div className={`relative w-64 h-64 transition-all duration-500 ${isThinking ? 'animate-pulse' : ''} ${isCelebrating ? 'animate-bounce' : ''}`}>
       <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl">
          <path fill="#FF7F50" d="M100,25 C115,15 135,20 145,35 C155,50 150,70 165,80 C180,90 190,110 180,130 C170,150 150,155 135,170 C120,185 100,195 80,185 C60,175 45,160 30,145 C15,130 10,110 20,90 C30,70 45,60 55,40 C65,20 85,15 100,25 Z" />
          <g transform="translate(85, 85)">
             <circle fill="white" cx="0" cy="0" r="14" /><circle fill="black" cx="4" cy="-3" r="7" />
             <circle fill="white" cx="40" cy="0" r="14" /><circle fill="black" cx="44" cy="-3" r="7" />
          </g>
          <path d="M95,120 Q105,135 115,120" fill="none" stroke="black" strokeWidth="4" strokeLinecap="round" />
       </svg>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FFF8F0] flex flex-col items-center relative overflow-hidden font-sans">
      <style>{`.font-sans { font-family: 'Fredoka', sans-serif; } .scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
      
      {/* HUD HEADER */}
      <div className="w-full px-6 py-4 flex justify-between items-center z-50">
        <button onClick={() => setIsMicLocked(!isMicLocked)} className="bg-zinc-900 px-4 py-1 rounded-full flex items-center gap-2 shadow-lg">
           <div className={`w-2 h-2 rounded-full ${isMicLocked ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
           <span className="text-[10px] font-black text-white uppercase">{isMicLocked ? 'PRIVACY' : 'EARS ON'}</span>
        </button>
        <div className="flex gap-4">
           <Scan className="text-[#EA4335]" onClick={() => setIsCameraOpen(true)} size={20} />
           <ShieldCheck className="text-blue-500" size={20} />
        </div>
      </div>

      <main className="flex-1 w-full max-w-md flex flex-col items-center px-6 pt-10 pb-40 z-10 scrollbar-hide">
        {activeTab === 'brain' && (
          <div className="w-full flex flex-col items-center animate-in fade-in">
             <h1 className="text-5xl font-black text-[#f97316] italic mb-6">ROSIE.</h1>
             <RosieMascot />
             <p className="text-xl font-black text-gray-800 mt-6">{isThinking ? "Thinking..." : isSpeaking ? "Speaking..." : "Ask me anything!"}</p>
          </div>
        )}

        {activeTab === 'hub' && (
           <div className="w-full space-y-4 animate-in slide-in-from-right">
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-white p-6 rounded-[35px] shadow-sm flex flex-col items-center gap-2">
                    <ShoppingCart className="text-orange-500" size={32}/>
                    <span className="font-black text-[10px] uppercase">{familyData.shopping.length} Items</span>
                 </div>
                 <div className="bg-white p-6 rounded-[35px] shadow-sm flex flex-col items-center gap-2">
                    <Calendar className="text-blue-500" size={32}/>
                    <span className="font-black text-[10px] uppercase">{familyData.plans.length} Events</span>
                 </div>
              </div>
           </div>
        )}
      </main>

      {/* CAMERA OVERLAY */}
      {isCameraOpen && (
         <div className="absolute inset-0 z-[100] bg-black flex flex-col">
            <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" onLoadedMetadata={() => videoRef.current.play()} />
            <div className="p-10 flex justify-center gap-6 bg-black">
               <button onClick={() => setIsCameraOpen(false)} className="p-4 bg-white/20 rounded-full text-white"><X/></button>
               <button onClick={captureAndAnalyze} className="w-20 h-20 bg-white rounded-full flex items-center justify-center"><div className="w-16 h-16 bg-[#EA4335] rounded-full"/></button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
         </div>
      )}

      {/* INPUT BOX */}
      <div className="absolute bottom-28 w-full max-w-md px-6 z-20">
        <div className="w-full bg-white rounded-[40px] p-2 shadow-xl border border-gray-100 flex items-center gap-2">
          <input value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAction(inputText)} placeholder="Ask Rosie..." className="flex-1 px-6 outline-none font-bold text-gray-600" />
          <button onClick={() => handleAction(inputText)} className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white"><Send size={20}/></button>
        </div>
      </div>

      {/* NAV BAR */}
      <nav className="fixed bottom-0 w-full p-6 flex justify-center z-50">
        <div className="bg-white/95 backdrop-blur-2xl border border-white/50 rounded-[55px] shadow-lg p-2 flex justify-between items-center w-full max-w-sm">
          {[ {id:'brain', icon:MessageCircle}, {id:'feed', icon:Radio}, {id:'hub', icon:Grid}, {id:'setup', icon:Settings} ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex flex-col items-center justify-center w-full py-3 rounded-[35px] ${activeTab === t.id ? 'bg-orange-50' : ''}`}>
              <t.icon size={24} className={activeTab === t.id ? 'text-[#f97316]' : 'text-gray-300'} />
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
