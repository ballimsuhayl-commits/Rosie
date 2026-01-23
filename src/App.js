import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Plus, Trash2, Send, ShoppingCart, Calendar, Mic, MicOff, Camera, Book, 
  ArrowLeft, X, Grid, Radio, Scan, Navigation, Signal, Wifi, Activity,
  Heart, CheckCircle, Settings, MessageCircle, MapPin, ShieldCheck, Flame,
  PenLine
} from 'lucide-react';

// --- CONFIGURATION ---
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

// --- TOOLS (THE BRAIN'S HANDS) ---
const ROSIE_TOOLS = [
  { name: "manage_shopping", description: "Update grocery list.", parameters: { type: "object", properties: { item: {type:"string"}, action: {type:"string", enum:["add","remove"]}}, required: ["item","action"]}},
  { name: "manage_calendar", description: "Update schedule. CHECK CLASHES.", parameters: { type: "object", properties: { event: {type:"string"}, action: {type:"string", enum:["add","remove"]}}, required: ["event","action"]}},
  { name: "assign_task", description: "Assign task.", parameters: { type: "object", properties: { member: {type:"string"}, task: {type:"string"}}, required: ["member","task"]}},
  { name: "write_diary", description: "Log to diary/notes.", parameters: { type: "object", properties: { book: {type:"string"}, text: {type:"string"}}, required: ["book","text"]}},
  { name: "log_finance", description: "Log estimates.", parameters: { type: "object", properties: { amount: {type:"number"}, category: {type:"string"}}, required: ["amount","category"]}},
  { name: "save_memory", description: "Save memory.", parameters: { type: "object", properties: { description: {type:"string"}}, required: ["description"]}},
  { name: "broadcast_fm", description: "Start Radio.", parameters: { type: "object", properties: { topic: {type:"string"}}, required: ["topic"]}}
];

// --- OS UI COMPONENTS ---
const StatusBar = () => {
  const [time, setTime] = useState(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
  useEffect(() => setInterval(() => setTime(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })), 1000), []);
  return (
    <div className="flex justify-between items-center px-7 pt-3 pb-2 text-[#2D2D2D] font-bold text-[13px] z-50 select-none">
        <span className="tracking-wide">{time}</span>
        <div className="flex gap-1.5 items-center">
            <Signal size={14} fill="currentColor" />
            <Wifi size={14} />
            <div className="w-6 h-3 border-[1.5px] border-[#2D2D2D] rounded-[4px] relative ml-1"><div className="h-full w-[80%] bg-[#2D2D2D] rounded-[1px]"/></div>
        </div>
    </div>
  );
};

export default function App() {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState('brain'); // brain, feed, hub, log, settings
  const [isMicLocked, setIsMicLocked] = useState(false); // PRIVACY BUTTON
  const [isMicActive, setIsMicActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [inputText, setInputText] = useState("");
  const [familyData, setFamilyData] = useState({ shopping: [], plans: [], chatHistory: [], memberTasks: {}, diary_entries: [], memories: [], estimates: [] });
  const [openBook, setOpenBook] = useState(null); // For Diary UI
  
  const recognitionRef = useRef(null);
  const synthRef = window.speechSynthesis;
  const familyDataRef = useRef(familyData);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => { familyDataRef.current = familyData; }, [familyData]);

  // --- SYNC ---
  useEffect(() => {
    signInAnonymously(auth).then(() => {
      onSnapshot(doc(db, "families", "main_family"), (docSnap) => {
        if (docSnap.exists()) setFamilyData(prev => ({ ...prev, ...docSnap.data() }));
      });
    });
  }, []);

  // --- EXECUTION (MOTOR) ---
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
        feedback = `💰 Spent R${args.amount}.`;
      } else if (name === "save_memory") {
        await updateDoc(docRef, { memories: arrayUnion(args.description) });
        feedback = `❤️ Memory saved!`;
      } else if (name === "broadcast_fm") {
        feedback = `🎙️ Tuning into Rosie FM...`;
      }
      return feedback;
    } catch (e) { return "Execution failed."; }
  };

  const speak = (text) => {
    synthRef.cancel();
    setIsSpeaking(true);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-ZA'; 
    u.rate = 1.05;
    u.onend = () => setIsSpeaking(false);
    synthRef.speak(u);
  };

  // --- BRAIN (INTELLIGENCE) ---
  const handleAction = useCallback(async (transcript) => {
    if (!transcript) return;
    setIsThinking(true);
    
    // --- 3. NAVIGATION LINK ---
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
        tools: [{ functionDeclarations: ROSIE_TOOLS }],
        systemInstruction: `You are Rosie. 
        1. DIARIES: If user says "Note this" or "Dear Diary", use 'write_diary'.
        2. RADIO: If user says "News" or "Radio", use 'broadcast_fm'.
        3. ALWAYS check for calendar clashes.`
      });
      const result = await model.generateContent(`Context: ${JSON.stringify(familyDataRef.current)}. Command: ${transcript}`);
      const call = result.response.functionCalls()?.[0];

      if (call) {
        const feedback = await executeAction(call.name, call.args);
        if (call.name === "broadcast_fm") {
           const radioScript = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent(`Radio script about ${call.args.topic} with DJ Rosie and Zephyr.`);
           speak(radioScript.response.text());
        } else {
           speak(feedback);
        }
      } else {
        const reply = result.response.text();
        speak(reply);
        await updateDoc(doc(db, "families", "main_family"), { chatHistory: arrayUnion({ role: 'rosie', text: reply, ts: new Date().toLocaleTimeString() }) });
      }
    } catch (e) { speak("Neural flicker. Try again?"); }
    setIsThinking(false);
  }, []);

  // --- EARS (ALWAYS LISTENING LOOP) ---
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
      // --- 2. ROSIE ALWAYS LISTENING ---
      if (!isMicLocked && transcript.includes("rosie")) {
        const cmd = transcript.replace(/^(hey|okay|yo)?\s*rosie/, "").trim();
        if (cmd.length > 1) handleAction(cmd);
        else speak("I'm listening.");
      }
    };
    recognitionRef.current = recognition;
    if (!isMicLocked) { try { recognition.start(); } catch(e){} }
    const heartbeat = setInterval(() => {
      if (!isMicLocked && !isMicActive && !isSpeaking) { try { recognitionRef.current.start(); } catch(e){} }
    }, 2000);
    return () => { clearInterval(heartbeat); recognition.stop(); };
  }, [handleAction, isMicLocked, isMicActive, isSpeaking]);

  // --- VISION ---
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
      const res = await model.generateContent(["Analyze for family PA.", { inlineData: { data: img, mimeType: "image/jpeg" } }]);
      handleAction(`I see this: ${res.response.text()}`);
    } catch (e) { speak("Can't see clearly."); }
    setIsThinking(false);
  };

  const RosieMascot = () => (
    <div className={`relative w-64 h-64 transition-all duration-500 ${isThinking ? 'animate-pulse' : ''} ${isSpeaking ? 'scale-105' : ''}`}>
       <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl">
          <path fill="#FF7F50" d="M100,25 C115,15 135,20 145,35 C155,50 150,70 165,80 C180,90 190,110 180,130 C170,150 150,155 135,170 C120,185 100,195 80,185 C60,175 45,160 30,145 C15,130 10,110 20,90 C30,70 45,60 55,40 C65,20 85,15 100,25 Z" />
          <g transform="translate(85, 85)">
             <circle fill="white" cx="0" cy="0" r="14" /><circle fill="black" cx="4" cy="-3" r="7" />
             <circle fill="white" cx="40" cy="0" r="14" /><circle fill="black" cx="44" cy="-3" r="7" />
          </g>
          <path d="M95,120 Q105,135 115,120" fill="none" stroke="black" strokeWidth="4" strokeLinecap="round" className={isSpeaking ? "animate-bounce" : ""} />
       </svg>
    </div>
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4 select-none overflow-hidden">
      <div className="relative w-full max-w-[390px] h-[844px] bg-[#FFF8F0] rounded-[50px] shadow-2xl overflow-hidden border-[8px] border-[#1a1a1a] flex flex-col font-sans">
        <StatusBar />
        
        {/* HEADER: PRIVACY & LENS */}
        <div className="w-full px-7 py-4 flex justify-between items-center z-50">
          <button onClick={() => setIsMicLocked(!isMicLocked)} className="bg-zinc-900 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg active:scale-95 transition-transform">
             <div className={`w-2 h-2 rounded-full ${isMicLocked ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
             <span className="text-[10px] font-black text-white uppercase tracking-tighter">{isMicLocked ? 'PRIVACY' : 'ROSIE ACTIVE'}</span>
          </button>
          <button onClick={() => setIsCameraOpen(true)} className="p-2 bg-white rounded-full shadow-md text-[#EA4335]"><Scan size={20} /></button>
        </div>

        <main className="flex-1 w-full max-w-md flex flex-col items-center px-7 pt-4 pb-40 z-10 scrollbar-hide overflow-y-auto">
          {activeTab === 'brain' && (
            <div className="w-full flex flex-col items-center animate-in fade-in">
               <h1 className="text-5xl font-black text-[#f97316] italic mb-6 tracking-tighter">ROSIE.</h1>
               <RosieMascot />
               <p className="text-xl font-black text-gray-800 mt-6 tracking-tight">{isThinking ? "Thinking..." : isSpeaking ? "Speaking..." : "Hi Family!"}</p>
               <div className="w-full space-y-2 mt-8">
                  {familyData.chatHistory?.slice(-2).map((m, i) => (
                    <div key={i} className={`p-3 rounded-2xl text-xs font-bold ${m.role === 'user' ? 'bg-orange-100 ml-auto' : 'bg-white shadow-sm'}`}>{m.text}</div>
                  ))}
               </div>
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
                <div className="bg-white/80 p-5 rounded-[30px] shadow-sm">
                   <h3 className="font-black text-gray-400 text-xs uppercase mb-3">Shopping List</h3>
                   {familyData.shopping?.map((item, i) => (
                     <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100">
                        <span className="font-bold text-gray-700 text-sm">{item}</span>
                        <button onClick={() => executeAction('manage_shopping', {item, action: 'remove'})}><Trash2 size={14} className="text-red-400"/></button>
                     </div>
                   ))}
                </div>
             </div>
          )}

          {/* --- 1. DIARIES & NOTES TAB (RESTORED) --- */}
          {activeTab === 'log' && (
             <div className="w-full animate-in slide-in-from-right h-full">
                {!openBook ? (
                  <div className="grid grid-cols-2 gap-4">
                    {['My Journal', 'Meds Log', 'Staff Log'].map((book, i) => (
                      <button key={i} onClick={() => setOpenBook(book)} className="aspect-[3/4] bg-white rounded-r-2xl border-l-8 border-l-[#EA4335] shadow-sm p-4 flex flex-col justify-between hover:scale-105 transition-transform">
                        <span className="font-black text-xl text-[#2D2D2D] leading-none">{book.split(' ').join('\n')}</span>
                        <Book size={20} className="text-gray-300"/>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col h-full w-full">
                     <div className="flex items-center gap-3 mb-4">
                        <button onClick={() => setOpenBook(null)} className="p-2 bg-white rounded-full shadow-sm"><ArrowLeft size={20}/></button>
                        <h2 className="font-black text-xl">{openBook}</h2>
                     </div>
                     <div className="space-y-4 overflow-y-auto pb-20">
                        {familyData.diary_entries?.filter(e => e.book === openBook).map((e, i) => (
                          <div key={i} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50">
                             <p className="text-sm font-serif text-gray-700">{e.text}</p>
                             <span className="text-[9px] font-black text-gray-300 uppercase mt-2 block">{e.ts}</span>
                          </div>
                        ))}
                     </div>
                  </div>
                )}
             </div>
          )}

          {activeTab === 'feed' && (
             <div className="w-full animate-in slide-in-from-right">
                <button onClick={() => handleAction("Start Rosie FM")} className="w-full bg-[#EA4335] text-white p-6 rounded-[35px] flex items-center justify-center gap-2 shadow-lg hover:scale-105 transition-transform">
                   <Radio size={24} /> <span className="font-black">GO ON AIR</span>
                </button>
             </div>
          )}
          
          {activeTab === 'setup' && (
             <div className="w-full text-center p-10">
                <Settings size={40} className="text-gray-300 mx-auto mb-4"/>
                <h2 className="font-black text-gray-400">SETTINGS</h2>
                <p className="text-xs font-bold text-gray-300">v21.0 Omni-Restoration</p>
             </div>
          )}
        </main>

        {/* CAMERA & INPUT */}
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

        <div className="absolute bottom-28 w-full max-w-[390px] px-6 z-20">
          <div className="w-full bg-white rounded-[40px] p-2 shadow-xl border border-gray-100 flex items-center gap-2">
            <input value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAction(inputText)} placeholder="Ask Rosie..." className="flex-1 px-6 outline-none font-bold text-gray-600 bg-transparent" />
            <button onClick={() => handleAction(inputText)} className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white hover:scale-110 transition-transform"><Send size={20}/></button>
          </div>
        </div>

        <nav className="fixed bottom-0 w-full max-w-[390px] p-6 flex justify-center z-50 pointer-events-none">
          <div className="bg-white/95 backdrop-blur-2xl border border-white/50 rounded-[55px] shadow-[0_20px_60px_rgba(0,0,0,0.1)] p-2 flex justify-between items-center w-full pointer-events-auto">
            {[ 
              {id:'brain', icon:MessageCircle, label: 'BRAIN', color: 'text-rose-500'}, 
              {id:'feed', icon:Radio, label: 'FEED', color: 'text-yellow-500'}, 
              {id:'hub', icon:Grid, label: 'HUB', color: 'text-green-500'}, 
              {id:'log', icon:Book, label: 'LOG', color: 'text-blue-500'},
              {id:'setup', icon:Settings, label: 'SETUP', color: 'text-purple-500'} 
            ].map(({id, icon:Icon, label, color}) => (
              <button key={id} onClick={() => {setActiveTab(id); setOpenBook(null);}} className={`flex flex-col items-center justify-center w-full py-3 rounded-[35px] transition-all ${activeTab === id ? 'bg-gray-50 scale-105' : ''}`}>
                <Icon size={24} className={activeTab === id ? color : 'text-gray-300'} strokeWidth={2.5} />
                <span className={`text-[9px] font-black mt-1 ${activeTab === id ? color : 'text-gray-300'}`}>{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
