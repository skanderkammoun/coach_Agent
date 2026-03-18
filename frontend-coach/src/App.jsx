// // le code le plus juste pour l'Agent Accompagnant (Vision + STT + TTS)

// import React, { useState, useRef, useEffect } from 'react';
// import ReactMarkdown from 'react-markdown';
// import remarkGfm from 'remark-gfm';

// export default function App() {
//   const [messages, setMessages] = useState([
//     { role: 'assistant', content: 'Bonjour ! Je suis ton Subul Cloud Coach. Envoie-moi tes questions ou des captures d\'écran de tes erreurs Azure, on va régler ça ensemble !', agent: 'Coach' }
//   ]);
//   const [inputMessage, setInputMessage] = useState('');
//   const [isLoading, setIsLoading] = useState(false);
  
//   // 📸 NOUVEAU : État et référence pour l'image
//   const [selectedImage, setSelectedImage] = useState(null);
//   const fileInputRef = useRef(null);

//   // Audio states (STT)
//   const [liveTranscript, setLiveTranscript] = useState("");
//   const [isRecording, setIsRecording] = useState(false);
//   const mediaRecorderRef = useRef(null);
//   const sttSocketRef = useRef(null); 

//   // Moteur Audio Temps Réel (TTS)
//   const ttsSocketRef = useRef(null);
//   const audioContextRef = useRef(null);
//   const nextPlayTimeRef = useRef(0);
//   const messagesEndRef = useRef(null);
  
//   // Contrôleur pour tuer la requête serveur
//   const abortControllerRef = useRef(null);

//   // Identifiants uniques pour la mémoire Cloud
//   const [userId] = useState(() => {
//     let savedId = localStorage.getItem('subul_user_id');
//     if (!savedId) {
//       savedId = 'user_' + Math.random().toString(36).substr(2, 9);
//       localStorage.setItem('subul_user_id', savedId);
//     }
//     return savedId;
//   });

//   const [sessionId] = useState(() => {
//     return 'session_' + Math.random().toString(36).substr(2, 9);
//   });

//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//   }, [messages, liveTranscript, selectedImage]);

//   const cleanTextForTTS = (text) => {
//     if (!text) return "";
//     return text.replace(/[*#_~>|`\-]/g, '').trim();
//   };

//   const initAudioContext = () => {
//     if (!audioContextRef.current) {
//       audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
//     }
//     if (audioContextRef.current.state === 'suspended') {
//       audioContextRef.current.resume();
//     }
//   };

//   const interruptAssistant = () => {
//     if (abortControllerRef.current) {
//       abortControllerRef.current.abort(); 
//       abortControllerRef.current = null;
//     }
//     if (ttsSocketRef.current) {
//       ttsSocketRef.current.close(); 
//       ttsSocketRef.current = null;
//     }
//     if (audioContextRef.current) {
//       audioContextRef.current.close(); 
//       audioContextRef.current = null;
//     }
//     setIsLoading(false);
//   };

//   const playAudioChunk = (arrayBuffer) => {
//     const audioContext = audioContextRef.current;
//     if (!audioContext) return;

//     const int16Array = new Int16Array(arrayBuffer);
//     const float32Array = new Float32Array(int16Array.length);
//     for (let i = 0; i < int16Array.length; i++) {
//       float32Array[i] = int16Array[i] / 32768.0; 
//     }

//     const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
//     audioBuffer.getChannelData(0).set(float32Array);

//     const source = audioContext.createBufferSource();
//     source.buffer = audioBuffer;
//     source.connect(audioContext.destination);

//     const currentTime = audioContext.currentTime;
//     if (nextPlayTimeRef.current < currentTime) {
//       nextPlayTimeRef.current = currentTime;
//     }

//     source.start(nextPlayTimeRef.current);
//     nextPlayTimeRef.current += audioBuffer.duration;
//   };

//   // 📸 NOUVEAU : Gérer la sélection d'une image
//   const handleImageUpload = (e) => {
//     const file = e.target.files[0];
//     if (file) {
//       const reader = new FileReader();
//       reader.onloadend = () => {
//         // On sépare le préfixe "data:image/jpeg;base64," des données pures
//         const base64Data = reader.result.split(',')[1];
//         setSelectedImage({
//           preview: reader.result, // Pour afficher l'image dans le chat
//           base64: base64Data       // Pour envoyer à l'API Python
//         });
//       };
//       reader.readAsDataURL(file);
//     }
//     // Réinitialise l'input pour pouvoir resélectionner le même fichier si besoin
//     e.target.value = null; 
//   };

//   // --- 🧠 ENVOI MESSAGE & STREAMING HYBRIDE ---
//   const sendMessage = async (rawMessage, isAudio = false) => {
//     const hasText = rawMessage && rawMessage.trim();
//     // 🛡️ MODIFICATION : On autorise l'envoi si on a du texte OU une image
//     if (!hasText && !selectedImage) return;

//     interruptAssistant();

//     // On sauvegarde l'image pour l'afficher dans la bulle utilisateur
//     const imageToSend = selectedImage;
    
//     setMessages(prev => [...prev, { 
//       role: 'user', 
//       content: rawMessage || "[Image envoyée]", 
//       image: imageToSend ? imageToSend.preview : null 
//     }]);
    
//     setInputMessage('');
//     setSelectedImage(null); // On vide l'aperçu de l'image après l'envoi
//     setIsLoading(true);

//     initAudioContext();
//     nextPlayTimeRef.current = audioContextRef.current.currentTime;
    
//     abortControllerRef.current = new AbortController();

//     try {
//       const response = await fetch('http://localhost:8000/api/chat', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ 
//           message: rawMessage || "", 
//           is_audio: isAudio,
//           user_id: userId,
//           session_id: sessionId,
//           base64_image: imageToSend ? imageToSend.base64 : null // 📸 Injection de l'image
//         }),
//         signal: abortControllerRef.current.signal
//       });

//       if (!response.ok) throw new Error("Erreur serveur");

//       const reader = response.body.getReader();
//       const decoder = new TextDecoder("utf-8");
//       let fullResponse = "";
//       let jsonBuffer = "";
      
//       setIsLoading(false);
//       setMessages(prev => [...prev, { role: 'assistant', content: '', agent: 'Analyse...' }]);

//       while (true) {
//         const { done, value } = await reader.read();
//         if (done) break;
        
//         jsonBuffer += decoder.decode(value, { stream: true });
//         let boundary = jsonBuffer.indexOf('\n');
        
//         while (boundary !== -1) {
//           const line = jsonBuffer.slice(0, boundary);
//           jsonBuffer = jsonBuffer.slice(boundary + 1);
//           boundary = jsonBuffer.indexOf('\n');
          
//           if (line.trim()) {
//             try {
//               const data = JSON.parse(line);
//               const chunk = data.chunk;
//               const detectedLang = data.lang || "fr"; 
//               fullResponse += chunk;
              
//               setMessages(prev => {
//                 const newMessages = [...prev];
//                 newMessages[newMessages.length - 1] = { role: 'assistant', content: fullResponse, agent: "Coach" };
//                 return newMessages;
//               });

//               if (isAudio && data.status === "streaming") {
//                 const cleanSentence = cleanTextForTTS(chunk);
                
//                 if (cleanSentence.trim()) {
//                     if (!ttsSocketRef.current) {
//                         const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
//                         const modelName = detectedLang === "fr" ? "aura-2-agathe-fr" : "aura-2-arcas-en";
                        
//                         ttsSocketRef.current = new WebSocket(`wss://api.deepgram.com/v1/speak?model=${modelName}&encoding=linear16&sample_rate=24000`, ['token', apiKey]);
//                         ttsSocketRef.current.binaryType = 'arraybuffer';

//                         ttsSocketRef.current.onmessage = (event) => {
//                           if (typeof event.data !== 'string') {
//                             playAudioChunk(event.data);
//                           }
//                         };
//                     }

//                     if (ttsSocketRef.current.readyState === WebSocket.OPEN) {
//                         ttsSocketRef.current.send(JSON.stringify({ type: 'Speak', text: cleanSentence }));
//                     } else if (ttsSocketRef.current.readyState === WebSocket.CONNECTING) {
//                         ttsSocketRef.current.addEventListener('open', () => {
//                             ttsSocketRef.current.send(JSON.stringify({ type: 'Speak', text: cleanSentence }));
//                         }, { once: true });
//                     }
//                 }
//               }
//             } catch (err) {}
//           }
//         }
//       }

//       if (isAudio) {
//         const sendFlush = () => {
//             if (ttsSocketRef.current && ttsSocketRef.current.readyState === 1) {
//                 ttsSocketRef.current.send(JSON.stringify({ type: 'Flush' }));
//             } else if (ttsSocketRef.current && ttsSocketRef.current.readyState === 0) {
//                 setTimeout(sendFlush, 50); 
//             }
//         };
//         sendFlush();
//       }

//     } catch (e) {
//       if (e.name === 'AbortError') {
//         console.log("IA interrompue par l'utilisateur.");
//       } else {
//         setMessages(prev => [...prev, { role: 'assistant', content: "❌ Impossible de contacter le serveur.", agent: 'Système' }]);
//         setIsLoading(false);
//       }
//     }
//   };

//   const startRecording = async () => {
//     interruptAssistant();
    
//     setLiveTranscript("");
//     if (audioContextRef.current) {
//         nextPlayTimeRef.current = audioContextRef.current.currentTime;
//     }

//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//       const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY; 
      
//       const socket = new WebSocket(
//         `wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true&endpointing=100`, 
//         ['token', apiKey]
//       );
//       sttSocketRef.current = socket;

//       socket.onopen = () => {
//         setIsRecording(true);
//         const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
//         mediaRecorderRef.current = mediaRecorder;

//         mediaRecorder.ondataavailable = (event) => {
//           if (event.data.size > 0 && socket.readyState === 1) {
//             socket.send(event.data);
//           }
//         };
//         mediaRecorder.start(250);
//       };

//       let finalTranscriptAccumulator = "";

//       socket.onmessage = (message) => {
//         const received = JSON.parse(message.data);
//         if (received.type === "Results" && received.channel) {
//             const transcript = received.channel.alternatives[0].transcript;
//             if (transcript && received.is_final) {
//               finalTranscriptAccumulator += transcript + " ";
//               setLiveTranscript(finalTranscriptAccumulator);
//             } else if (transcript) {
//               setLiveTranscript(finalTranscriptAccumulator + transcript);
//             }
//         }
//       };

//       socket.onclose = () => {
//         setIsRecording(false);
//         if (finalTranscriptAccumulator.trim() !== "") {
//           sendMessage(finalTranscriptAccumulator, true);
//         }
//         setLiveTranscript("");
//       };

//     } catch (err) { 
//       console.error(err);
//       alert("Micro inaccessible."); 
//     }
//   };

//   const stopRecording = () => {
//     if (mediaRecorderRef.current && isRecording) {
//       mediaRecorderRef.current.stop();
//       mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
//       setIsRecording(false);
//       if (sttSocketRef.current && sttSocketRef.current.readyState === 1) {
//           sttSocketRef.current.send(JSON.stringify({ type: 'CloseStream' }));
//       }
//     }
//   };

//   const handleKeyPress = (e) => {
//     if (e.key === 'Enter' && !e.shiftKey) {
//       e.preventDefault();
//       sendMessage(inputMessage, false);
//     }
//   };

//   return (
//     <div className="bg-[#f6f6f8] text-slate-900 h-screen flex flex-col font-sans">
//       <header className="h-16 border-b border-slate-200 flex items-center justify-center px-6 bg-white shrink-0 shadow-sm">
//         <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">☁️ Subul Cloud Coach</h1>
//       </header>

//       <main className="flex-1 overflow-y-auto px-4 py-6 md:px-20 lg:px-40">
//         {messages.map((msg, idx) => (
//           <div key={idx} className={`flex flex-col gap-1 mb-6 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
//             {msg.role === 'assistant' && <span className="text-xs font-bold text-slate-400 ml-2 uppercase tracking-wide">🤖 {msg.agent}</span>}
            
//             <div className={`p-4 rounded-2xl max-w-[85%] ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm shadow-md' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm shadow-sm'}`}>
              
//               {/* 📸 Affichage de l'image si elle existe dans le message utilisateur */}
//               {msg.image && (
//                 <img src={msg.image} alt="Capture d'écran" className="max-w-xs md:max-w-md rounded-lg mb-2 border border-blue-400/30" />
//               )}

//               {msg.role === 'user' ? (
//                 <div>{msg.content}</div>
//               ) : (
//                 <div className="prose prose-sm max-w-none text-slate-800">
//                   <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
//                 </div>
//               )}
//             </div>
//           </div>
//         ))}
        
//         {isRecording && liveTranscript && (
//           <div className="flex flex-col items-end mb-6">
//             <div className="p-4 rounded-2xl max-w-[85%] bg-blue-400 text-white rounded-br-sm shadow-md italic opacity-90">
//               {liveTranscript} <span className="animate-pulse">...</span>
//             </div>
//           </div>
//         )}
        
//         {isLoading && !isRecording && <div className="text-sm text-slate-400 animate-pulse ml-2 font-medium">Le Coach analyse...</div>}
//         <div ref={messagesEndRef} />
//       </main>

//       <footer className="p-4 bg-white border-t border-slate-200 shrink-0 flex flex-col items-center">
        
//         {/* 📸 APERÇU DE L'IMAGE SÉLECTIONNÉE AVANT ENVOI */}
//         {selectedImage && (
//           <div className="max-w-4xl w-full mb-2 flex items-center gap-2">
//             <div className="relative inline-block">
//               <img src={selectedImage.preview} alt="Aperçu" className="h-16 w-auto rounded-lg border border-slate-300 shadow-sm" />
//               <button 
//                 onClick={() => setSelectedImage(null)}
//                 className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
//               >
//                 ✕
//               </button>
//             </div>
//           </div>
//         )}

//         <div className="max-w-4xl w-full flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-2 transition-all focus-within:ring-2 focus-within:ring-blue-100">
          
//           {/* 📸 BOUTON UPLOAD IMAGE */}
//           <input 
//             type="file" 
//             accept="image/*" 
//             ref={fileInputRef} 
//             onChange={handleImageUpload} 
//             className="hidden" 
//           />
//           <button
//             onClick={() => fileInputRef.current.click()}
//             className="flex items-center justify-center w-12 h-12 rounded-xl text-slate-500 hover:bg-slate-200 transition-all"
//             title="Joindre une capture d'écran"
//           >
//             📎
//           </button>

//           <button
//             onMouseDown={startRecording} onMouseUp={stopRecording} onMouseLeave={stopRecording}
//             className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all ${isRecording ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
//           >
//             🎙️
//           </button>
          
//           <textarea
//             className="flex-1 bg-transparent border-none resize-none py-3 outline-none font-medium text-slate-700"
//             placeholder="Posez une question ou joignez une capture d'écran..."
//             rows="1" value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} onKeyDown={handleKeyPress}
//           />
          
//           <button
//             onClick={() => sendMessage(inputMessage, false)}
//             disabled={(!inputMessage.trim() && !selectedImage) || isLoading || isRecording}
//             className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 transition-all"
//           >
//             ➤
//           </button>
//         </div>
//       </footer>
//     </div>
//   );
// }



////////////////////////////////////////////////////////////////////////////////////////

// import React, { useState, useRef, useEffect } from 'react';
// import ReactMarkdown from 'react-markdown';
// import remarkGfm from 'remark-gfm';
// import Cartesia from '@cartesia/cartesia-js'; // 👈 Le retour du SDK Cartesia !


// const WORKER_CODE = `
//   class AudioProcessor extends AudioWorkletProcessor {
//     constructor() {
//       super();
//       this.buffer = new Int16Array(4096);
//       this.bufferIndex = 0;
//     }
//     process(inputs) {
//       const input = inputs[0];
//       if (input && input.length > 0 && input[0]) {
//         const float32Array = input[0];
//         for (let i = 0; i < float32Array.length; i++) {
//           let s = Math.max(-1, Math.min(1, float32Array[i]));
//           this.buffer[this.bufferIndex++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
//           if (this.bufferIndex >= this.buffer.length) {
//             const sendBuffer = new Int16Array(this.buffer);
//             this.port.postMessage(sendBuffer.buffer);
//             this.bufferIndex = 0;
//           }
//         }
//       }
//       return true;
//     }
//   }
//   registerProcessor('audio-processor', AudioProcessor);
// `;

// export default function App() {
//   const [messages, setMessages] = useState([
//     { role: 'assistant', content: 'Bonjour ! Je suis ton Subul Cloud Coach. Prêt pour le streaming par chunks !', agent: 'Coach' }
//   ]);
//   const [inputMessage, setInputMessage] = useState('');
//   const [isLoading, setIsLoading] = useState(false);
//   const [selectedImage, setSelectedImage] = useState(null);
//   const fileInputRef = useRef(null);
//   const [liveTranscript, setLiveTranscript] = useState("");
//   const [isRecording, setIsRecording] = useState(false);
  
//   const sttSocketRef = useRef(null); 
//   const playbackContextRef = useRef(null); 
//   const recordingContextRef = useRef(null); 
  
//   const nextPlayTimeRef = useRef(0);
//   const messagesEndRef = useRef(null);
//   const audioWorkletNodeRef = useRef(null);
//   const workletLoadedRef = useRef(false);
  
//   // 👈 Réintégration du client Cartesia
//   const cartesiaClientRef = useRef(null); 

//   useEffect(() => {
//     cartesiaClientRef.current = new Cartesia({ apiKey: import.meta.env.VITE_CARTESIA_API_KEY });
//     playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
//   }, []);

//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//   }, [messages, liveTranscript]);

//   // 🔊 LECTEUR AUDIO RAPIDE (Jouer les chunks de Float32)
//   const playAudioChunk = (arrayBuffer) => {
//     const ctx = playbackContextRef.current;
//     if (!ctx) return;
//     const float32Array = new Float32Array(arrayBuffer);
//     const audioBuffer = ctx.createBuffer(1, float32Array.length, 44100);
//     audioBuffer.getChannelData(0).set(float32Array);
    
//     const source = ctx.createBufferSource();
//     source.buffer = audioBuffer;
//     source.connect(ctx.destination);
    
//     const now = ctx.currentTime;
//     if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now;
//     source.start(nextPlayTimeRef.current);
//     nextPlayTimeRef.current += audioBuffer.duration;
//   };

//   const handleImageUpload = (e) => {
//     const file = e.target.files[0];
//     if (file) {
//       const reader = new FileReader();
//       reader.onloadend = () => setSelectedImage({ preview: reader.result, base64: reader.result.split(',')[1] });
//       reader.readAsDataURL(file);
//     }
//   };

//   // --- 🧠 ENVOI MESSAGE & TTS (Logique de chunks originelle) ---
//   // --- 🧠 ENVOI MESSAGE & TTS TEMPS RÉEL (WEBSOCKET NATIF, 100% SÉCURISÉ) ---
//   const sendMessage = async (rawMessage, isAudio = true) => { 
//     // J'ai mis isAudio = true par défaut pour que tu entendes la voix même en tapant du texte !
    
//     if (!rawMessage?.trim() && !selectedImage) return;
//     setIsLoading(true);

//     const currentImage = selectedImage; 
//     setMessages(prev => [
//       ...prev, 
//       { role: 'user', content: rawMessage || "Analyse de cette capture d'écran...", image: currentImage ? currentImage.preview : null }
//     ]);
//     setInputMessage(''); 
//     setSelectedImage(null);

//     try {
//       if (isAudio && playbackContextRef.current.state === 'suspended') {
//         await playbackContextRef.current.resume();
//       }

//       // 🚀 1. WEBSOCKET NATIF POUR CARTESIA (Fini les bugs de SDK !)
//       let ttsWs = null;
//       let ttsQueue = [];
//       let contextId = "ctx-" + Date.now();

//       if (isAudio) {
//         ttsWs = new WebSocket(`wss://api.cartesia.ai/tts/websocket?api_key=${import.meta.env.VITE_CARTESIA_API_KEY}&cartesia_version=2024-06-10`);
        
//         ttsWs.onopen = () => {
//           // On envoie les morceaux de texte qui patientaient
//           while(ttsQueue.length > 0) {
//             ttsWs.send(JSON.stringify(ttsQueue.shift()));
//           }
//         };

//         ttsWs.onmessage = (e) => {
//           const msg = JSON.parse(e.data);
//           if (msg.type === "chunk" && msg.data) {
//             const binaryStr = atob(msg.data);
//             const bytes = new Uint8Array(binaryStr.length);
//             for (let i = 0; i < binaryStr.length; i++) {
//                 bytes[i] = binaryStr.charCodeAt(i);
//             }
//             playAudioChunk(bytes.buffer); // Le son sort ici !
//           } else if (msg.error) {
//             console.error("❌ Erreur Cartesia WS:", msg.error);
//           }
//         };
        
//         ttsWs.onerror = (err) => console.error("❌ TTS WS Error:", err);
//       }

//       const response = await fetch('http://localhost:8000/api/chat', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ message: rawMessage || "", is_audio: isAudio, base64_image: currentImage ? currentImage.base64 : null })
//       });

//       const reader = response.body.getReader();
//       const decoder = new TextDecoder();
//       let fullResponse = "";
      
//       setMessages(prev => [...prev, { role: 'assistant', content: '', agent: 'Coach' }]);

//       while (true) {
//         const { done, value } = await reader.read();
        
//         if (done) {
//           // 🛑 FIN DU TEXTE : On prévient Cartesia pour clore la voix proprement
//           if (isAudio && ttsWs) {
//             const endPayload = { context_id: contextId, transcript: "", continue: false };
//             if (ttsWs.readyState === WebSocket.OPEN) {
//               ttsWs.send(JSON.stringify(endPayload));
//             } else {
//               ttsQueue.push(endPayload);
//             }
//             // On ferme le tunnel au bout de 3 secondes pour laisser la fin de l'audio arriver
//             setTimeout(() => { if (ttsWs.readyState === WebSocket.OPEN) ttsWs.close(); }, 3000);
//           }
//           break;
//         }
        
//         const chunk = decoder.decode(value);
//         const lines = chunk.split('\n');
        
//         for (const line of lines) {
//           if (!line.trim()) continue;
//           try {
//             const data = JSON.parse(line);
            
//             if (data.status === "streaming" && data.chunk) {
//               fullResponse += data.chunk;
//               const lang = data.lang || 'fr';
              
//               // Affichage du texte
//               setMessages(prev => {
//                 const newMsgs = [...prev];
//                 newMsgs[newMsgs.length - 1].content = fullResponse;
//                 return newMsgs;
//               });

//               // 🚀 ON POUSSE LES MORCEAUX DANS LE TUNNEL NATIF CARTESIA
//               if (isAudio && ttsWs) {
//                 const cleanText = data.chunk.replace(/[*#_~>|\-`]/g, '');
//                 if (cleanText.trim()) {
//                   const voiceId = lang === 'en' ? "6ccbfb76-1fc6-48f7-b71d-91ac6298247b" : "f786b574-daa5-4673-aa0c-cbe3e8534c02";
//                   const payload = {
//                       context_id: contextId,
//                       model_id: "sonic-3",
//                       voice: { mode: "id", id: voiceId },
//                       transcript: cleanText,
//                       output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: 44100 },
//                       language: lang,
//                       continue: true
//                   };
                  
//                   if (ttsWs.readyState === WebSocket.OPEN) {
//                       ttsWs.send(JSON.stringify(payload));
//                   } else {
//                       ttsQueue.push(payload); // On met en attente si le WebSocket s'ouvre encore
//                   }
//                 }
//               }
//             }
//           } catch(e) {
//              console.error("Erreur de parsing de l'IA:", e, line);
//           } 
//         }
//       }
//     } catch (e) { 
//       console.error("Erreur serveur:", e);
//       setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erreur de connexion.', agent: 'Système' }]);
//     } finally {
//       setIsLoading(false);
//     }
//   };
//   // --- 🎙️ MICROPHONE (Cartesia Ink Whisper STT) ---
//   const startRecording = async () => {
//     if (!recordingContextRef.current) {
//       recordingContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
//     }
//     const recCtx = recordingContextRef.current;
//     if (recCtx.state === 'suspended') await recCtx.resume();
    
//     setLiveTranscript("");
    
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
//       if (!workletLoadedRef.current) {
//         const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
//         const url = URL.createObjectURL(blob);
//         await recCtx.audioWorklet.addModule(url);
//         workletLoadedRef.current = true;
//       }
      
//       const source = recCtx.createMediaStreamSource(stream);
//       const recorder = new AudioWorkletNode(recCtx, 'audio-processor');
//       audioWorkletNodeRef.current = recorder;
      
//       const wsUrl = `wss://api.cartesia.ai/stt/websocket?api_key=${import.meta.env.VITE_CARTESIA_API_KEY}&cartesia_version=2024-11-13&model=ink-whisper&sample_rate=16000&encoding=pcm_s16le&min_volume=0.05&max_silence_duration_secs=2.0`;
      
//       const ws = new WebSocket(wsUrl);
//       sttSocketRef.current = ws;

//       ws.onopen = () => {
//         setIsRecording(true);
//         source.connect(recorder);
//         recorder.connect(recCtx.destination); 
        
//         recorder.port.onmessage = (e) => {
//           if (ws.readyState === 1) ws.send(e.data);
//         };
//       };

//       ws.onerror = (e) => {
//         console.error("❌ Erreur WebSocket :", e);
//         setIsRecording(false);
//       };

//       let currentUtterance = "";
//       ws.onmessage = (e) => {
//         try {
//           const d = JSON.parse(e.data);
//           if (d.type === "transcript") {
//              if (d.is_final) {
//                currentUtterance += d.text + " ";
//                setLiveTranscript(currentUtterance);
//              } else {
//                setLiveTranscript(currentUtterance + d.text);
//              }
//           }
//         } catch (err) {}
//       };

//       ws.onclose = () => { 
//         setIsRecording(false); 
//         if (currentUtterance.trim()) sendMessage(currentUtterance, true); 
//         stream.getTracks().forEach(track => track.stop());
//         recorder.disconnect();
//         source.disconnect();
//       };
//     } catch (err) { 
//       console.error("❌ Erreur accès micro:", err);
//     }
//   };

//   const stopRecording = () => {
//     if (sttSocketRef.current?.readyState === 1) {
//       sttSocketRef.current.send("done");
//     }
//     if (audioWorkletNodeRef.current) {
//       audioWorkletNodeRef.current.disconnect();
//     }
//     setIsRecording(false);
//   };

//   const toggleRecording = () => {
//     if (isRecording) {
//       stopRecording();
//     } else {
//       startRecording();
//     }
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f8fafc', fontFamily: 'sans-serif' }}>
//       <header style={{ height: '60px', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' }}>
//         <h1 style={{ color: '#4f46e5', fontWeight: 'bold' }}>☁️ Subul Cloud Coach</h1>
//       </header>

//       <main style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
//         <div style={{ maxWidth: '800px', margin: '0 auto' }}>
//           {messages.map((msg, i) => (
//             <div key={i} style={{ marginBottom: '15px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
//               <div style={{ display: 'inline-block', padding: '12px 18px', borderRadius: '15px', backgroundColor: msg.role === 'user' ? '#4f46e5' : 'white', color: msg.role === 'user' ? 'white' : '#1e293b', border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0', maxWidth: '85%', textAlign: 'left', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
//                 {msg.image && <img src={msg.image} style={{ width: '100%', borderRadius: '10px', marginBottom: '8px', border: '1px solid #e2e8f0' }} alt="Capture" />}
//                 <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
//               </div>
//             </div>
//           ))}
//           {isRecording && <div style={{ textAlign: 'right', color: '#4f46e5', fontWeight: 'bold', fontStyle: 'italic' }}>{liveTranscript}...🎙️</div>}
//           {isLoading && !isRecording && <div style={{ textAlign: 'left', color: '#94a3b8', fontSize: '0.9em' }}>Le Coach réfléchit...</div>}
//           <div ref={messagesEndRef} />
//         </div>
//       </main>

//       <footer style={{ padding: '20px', backgroundColor: 'white', borderTop: '1px solid #ddd' }}>
//         <div style={{ display: 'flex', gap: '10px', maxWidth: '800px', margin: '0 auto', backgroundColor: '#f1f5f9', padding: '10px', borderRadius: '15px', alignItems: 'center' }}>
//           <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
//           <button onClick={() => fileInputRef.current.click()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px' }}>📎</button>
          
//           {selectedImage && (
//             <div style={{ position: 'relative' }}>
//               <img src={selectedImage.preview} style={{ height: '40px', borderRadius: '5px', border: '1px solid #cbd5e1' }} />
//               <button onClick={() => setSelectedImage(null)} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '10px', cursor: 'pointer' }}>✕</button>
//             </div>
//           )}

//           <button onClick={toggleRecording} style={{ background: isRecording ? '#ef4444' : '#e2e8f0', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '10px', borderRadius: '50%', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}>
//             {isRecording ? '⏹️' : '🎙️'}
//           </button>
          
//           <textarea style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', resize: 'none', fontSize: '15px', padding: '10px 0' }} placeholder="Décris ton problème Azure ou dicte-le..." rows="1" value={inputMessage} onChange={e => setInputMessage(e.target.value)} />
          
//           <button onClick={() => sendMessage(inputMessage, false)} disabled={isLoading} style={{ backgroundColor: isLoading ? '#94a3b8' : '#4f46e5', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: isLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
//             ➤
//           </button>
//         </div>
//       </footer>
//     </div>
//   );
// }


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////la version la plus agreable et laplus juste
// import React, { useState, useRef, useEffect } from 'react';
// import ReactMarkdown from 'react-markdown';
// import remarkGfm from 'remark-gfm';
// import Cartesia from '@cartesia/cartesia-js'; 

// const WORKER_CODE = `
//   class AudioProcessor extends AudioWorkletProcessor {
//     constructor() {
//       super();
//       this.buffer = new Int16Array(4096);
//       this.bufferIndex = 0;
//     }
//     process(inputs) {
//       const input = inputs[0];
//       if (input && input.length > 0 && input[0]) {
//         const float32Array = input[0];
//         for (let i = 0; i < float32Array.length; i++) {
//           let s = Math.max(-1, Math.min(1, float32Array[i]));
//           this.buffer[this.bufferIndex++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
//           if (this.bufferIndex >= this.buffer.length) {
//             const sendBuffer = new Int16Array(this.buffer);
//             this.port.postMessage(sendBuffer.buffer);
//             this.bufferIndex = 0;
//           }
//         }
//       }
//       return true;
//     }
//   }
//   registerProcessor('audio-processor', AudioProcessor);
// `;

// export default function App() {
//   const [messages, setMessages] = useState([
//     { role: 'assistant', content: 'Bonjour ! Je suis ton Subul Cloud Coach. Choisis ta langue avec le drapeau en bas !', agent: 'Coach' }
//   ]);
//   const [inputMessage, setInputMessage] = useState('');
//   const [isLoading, setIsLoading] = useState(false);
//   const [selectedImage, setSelectedImage] = useState(null);
//   const fileInputRef = useRef(null);
//   const [liveTranscript, setLiveTranscript] = useState("");
//   const [isRecording, setIsRecording] = useState(false);
  
//   // 🌍 ÉTAT POUR LA LANGUE DU MICROPHONE (Français par défaut)
//   const [sttLanguage, setSttLanguage] = useState('fr');
  
//   const sttSocketRef = useRef(null); 
//   const playbackContextRef = useRef(null); 
//   const recordingContextRef = useRef(null); 
  
//   const nextPlayTimeRef = useRef(0);
//   const messagesEndRef = useRef(null);
//   const audioWorkletNodeRef = useRef(null);
//   const workletLoadedRef = useRef(false);
  
//   const cartesiaClientRef = useRef(null); 

//   useEffect(() => {
//     cartesiaClientRef.current = new Cartesia({ apiKey: import.meta.env.VITE_CARTESIA_API_KEY });
//     playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
//   }, []);

//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//   }, [messages, liveTranscript]);

//   const playAudioChunk = (arrayBuffer) => {
//     const ctx = playbackContextRef.current;
//     if (!ctx) return;
//     const float32Array = new Float32Array(arrayBuffer);
//     const audioBuffer = ctx.createBuffer(1, float32Array.length, 44100);
//     audioBuffer.getChannelData(0).set(float32Array);
    
//     const source = ctx.createBufferSource();
//     source.buffer = audioBuffer;
//     source.connect(ctx.destination);
    
//     const now = ctx.currentTime;
//     if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now;
//     source.start(nextPlayTimeRef.current);
//     nextPlayTimeRef.current += audioBuffer.duration;
//   };

//   const handleImageUpload = (e) => {
//     const file = e.target.files[0];
//     if (file) {
//       const reader = new FileReader();
//       reader.onloadend = () => setSelectedImage({ preview: reader.result, base64: reader.result.split(',')[1] });
//       reader.readAsDataURL(file);
//     }
//   };

//   const sendMessage = async (rawMessage, isAudio = true) => { 
//     if (!rawMessage?.trim() && !selectedImage) return;
//     setIsLoading(true);

//     const currentImage = selectedImage; 
//     setMessages(prev => [
//       ...prev, 
//       { role: 'user', content: rawMessage || "Analyse de cette capture d'écran...", image: currentImage ? currentImage.preview : null }
//     ]);
//     setInputMessage(''); 
//     setSelectedImage(null);

//     try {
//       if (isAudio && playbackContextRef.current.state === 'suspended') {
//         await playbackContextRef.current.resume();
//       }

//       let ttsWs = null;
//       let ttsQueue = [];
//       let contextId = "ctx-" + Date.now();
//       let currentLang = 'fr'; 

//       if (isAudio) {
//         ttsWs = new WebSocket(`wss://api.cartesia.ai/tts/websocket?api_key=${import.meta.env.VITE_CARTESIA_API_KEY}&cartesia_version=2024-06-10`);
        
//         ttsWs.onopen = () => {
//           while(ttsQueue.length > 0) {
//             ttsWs.send(JSON.stringify(ttsQueue.shift()));
//           }
//         };

//         ttsWs.onmessage = (e) => {
//           const msg = JSON.parse(e.data);
//           if (msg.type === "chunk" && msg.data) {
//             const binaryStr = atob(msg.data);
//             const bytes = new Uint8Array(binaryStr.length);
//             for (let i = 0; i < binaryStr.length; i++) {
//                 bytes[i] = binaryStr.charCodeAt(i);
//             }
//             playAudioChunk(bytes.buffer);
//           } else if (msg.error) {
//             console.error("❌ Erreur Cartesia WS:", msg.error);
//           }
//         };
        
//         ttsWs.onerror = (err) => console.error("❌ TTS WS Error:", err);
//       }

//       const response = await fetch('http://localhost:8000/api/chat', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ message: rawMessage || "", is_audio: isAudio, base64_image: currentImage ? currentImage.base64 : null })
//       });

//       const reader = response.body.getReader();
//       const decoder = new TextDecoder();
//       let fullResponse = "";
      
//       setMessages(prev => [...prev, { role: 'assistant', content: '', agent: 'Coach' }]);

//       while (true) {
//         const { done, value } = await reader.read();
        
//         if (done) {
//           if (isAudio && ttsWs) {
//             const voiceId = currentLang === 'en' ? "6ccbfb76-1fc6-48f7-b71d-91ac6298247b" : "f786b574-daa5-4673-aa0c-cbe3e8534c02";
//             const endPayload = { 
//                 context_id: contextId, 
//                 model_id: "sonic-3",
//                 voice: { mode: "id", id: voiceId },
//                 transcript: " ", 
//                 output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: 44100 },
//                 language: currentLang,
//                 continue: false 
//             };

//             if (ttsWs.readyState === WebSocket.OPEN) {
//               ttsWs.send(JSON.stringify(endPayload));
//             } else {
//               ttsQueue.push(endPayload);
//             }
//             setTimeout(() => { if (ttsWs.readyState === WebSocket.OPEN) ttsWs.close(); }, 3000);
//           }
//           break;
//         }
        
//         const chunk = decoder.decode(value);
//         const lines = chunk.split('\n');
        
//         for (const line of lines) {
//           if (!line.trim()) continue;
//           try {
//             const data = JSON.parse(line);
            
//             if (data.status === "streaming" && data.chunk) {
//               fullResponse += data.chunk;
//               const lang = data.lang || 'fr';
              
//               setMessages(prev => {
//                 const newMsgs = [...prev];
//                 newMsgs[newMsgs.length - 1].content = fullResponse;
//                 return newMsgs;
//               });

//               if (isAudio && ttsWs) {
//                 const cleanText = data.chunk.replace(/[*#_~>|\-`]/g, '');
//                 if (cleanText.trim()) {
//                   currentLang = lang; 
//                   const voiceId = currentLang === 'en' ? "6ccbfb76-1fc6-48f7-b71d-91ac6298247b" : "f786b574-daa5-4673-aa0c-cbe3e8534c02";
                  
//                   const payload = {
//                       context_id: contextId,
//                       model_id: "sonic-3",
//                       voice: { mode: "id", id: voiceId },
//                       transcript: cleanText,
//                       output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: 44100 },
//                       language: currentLang,
//                       continue: true
//                   };
                  
//                   if (ttsWs.readyState === WebSocket.OPEN) {
//                       ttsWs.send(JSON.stringify(payload));
//                   } else {
//                       ttsQueue.push(payload); 
//                   }
//                 }
//               }
//             }
//           } catch(e) {
//              console.error("Erreur de parsing de l'IA:", e, line);
//           } 
//         }
//       }
//     } catch (e) { 
//       console.error("Erreur serveur:", e);
//       setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erreur de connexion.', agent: 'Système' }]);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const startRecording = async () => {
//     if (!recordingContextRef.current) {
//       recordingContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
//     }
//     const recCtx = recordingContextRef.current;
//     if (recCtx.state === 'suspended') await recCtx.resume();
    
//     setLiveTranscript("");
    
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
//       if (!workletLoadedRef.current) {
//         const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
//         const url = URL.createObjectURL(blob);
//         await recCtx.audioWorklet.addModule(url);
//         workletLoadedRef.current = true;
//       }
      
//       const source = recCtx.createMediaStreamSource(stream);
//       const recorder = new AudioWorkletNode(recCtx, 'audio-processor');
//       audioWorkletNodeRef.current = recorder;
      
//       // 🚀 INJECTION DYNAMIQUE DE LA LANGUE SÉLECTIONNÉE (sttLanguage)
//       const wsUrl = `wss://api.cartesia.ai/stt/websocket?api_key=${import.meta.env.VITE_CARTESIA_API_KEY}&cartesia_version=2024-11-13&model=ink-whisper&language=${sttLanguage}&sample_rate=16000&encoding=pcm_s16le&min_volume=0.05&max_silence_duration_secs=2.0`;
      
//       const ws = new WebSocket(wsUrl);
//       sttSocketRef.current = ws;

//       ws.onopen = () => {
//         setIsRecording(true);
//         source.connect(recorder);
//         recorder.connect(recCtx.destination); 
        
//         recorder.port.onmessage = (e) => {
//           if (ws.readyState === 1) ws.send(e.data);
//         };
//       };

//       ws.onerror = (e) => {
//         console.error("❌ Erreur WebSocket :", e);
//         setIsRecording(false);
//       };

//       let currentUtterance = "";
//       ws.onmessage = (e) => {
//         try {
//           const d = JSON.parse(e.data);
//           if (d.type === "transcript") {
//              if (d.is_final) {
//                currentUtterance += d.text + " ";
//                setLiveTranscript(currentUtterance);
//              } else {
//                setLiveTranscript(currentUtterance + d.text);
//              }
//           }
//         } catch (err) {}
//       };

//       ws.onclose = () => { 
//         setIsRecording(false); 
//         if (currentUtterance.trim()) sendMessage(currentUtterance, true); 
//         stream.getTracks().forEach(track => track.stop());
//         recorder.disconnect();
//         source.disconnect();
//       };
//     } catch (err) { 
//       console.error("❌ Erreur accès micro:", err);
//     }
//   };

//   const stopRecording = () => {
//     if (sttSocketRef.current?.readyState === 1) {
//       sttSocketRef.current.send("done");
//     }
//     if (audioWorkletNodeRef.current) {
//       audioWorkletNodeRef.current.disconnect();
//     }
//     setIsRecording(false);
//   };

//   const toggleRecording = () => {
//     if (isRecording) {
//       stopRecording();
//     } else {
//       startRecording();
//     }
//   };

//   // Fonction pour switcher de langue
//   const toggleLanguage = () => {
//     if (isRecording) return; // On empêche de changer pendant l'enregistrement
//     setSttLanguage(prev => prev === 'fr' ? 'en' : 'fr');
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f8fafc', fontFamily: 'sans-serif' }}>
//       <header style={{ height: '60px', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' }}>
//         <h1 style={{ color: '#4f46e5', fontWeight: 'bold' }}>☁️ Subul Cloud Coach</h1>
//       </header>

//       <main style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
//         <div style={{ maxWidth: '800px', margin: '0 auto' }}>
//           {messages.map((msg, i) => (
//             <div key={i} style={{ marginBottom: '15px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
//               <div style={{ display: 'inline-block', padding: '12px 18px', borderRadius: '15px', backgroundColor: msg.role === 'user' ? '#4f46e5' : 'white', color: msg.role === 'user' ? 'white' : '#1e293b', border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0', maxWidth: '85%', textAlign: 'left', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
//                 {msg.image && <img src={msg.image} style={{ width: '100%', borderRadius: '10px', marginBottom: '8px', border: '1px solid #e2e8f0' }} alt="Capture" />}
//                 <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
//               </div>
//             </div>
//           ))}
//           {isRecording && <div style={{ textAlign: 'right', color: '#4f46e5', fontWeight: 'bold', fontStyle: 'italic' }}>{liveTranscript}...🎙️</div>}
//           {isLoading && !isRecording && <div style={{ textAlign: 'left', color: '#94a3b8', fontSize: '0.9em' }}>Le Coach réfléchit...</div>}
//           <div ref={messagesEndRef} />
//         </div>
//       </main>

//       <footer style={{ padding: '20px', backgroundColor: 'white', borderTop: '1px solid #ddd' }}>
//         <div style={{ display: 'flex', gap: '10px', maxWidth: '800px', margin: '0 auto', backgroundColor: '#f1f5f9', padding: '10px', borderRadius: '15px', alignItems: 'center' }}>
//           <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
          
//           {/* 🌍 BOUTON DRAPEAU : Switch de langue rapide */}
//           <button 
//             onClick={toggleLanguage} 
//             disabled={isRecording}
//             style={{ background: 'none', border: 'none', cursor: isRecording ? 'not-allowed' : 'pointer', fontSize: '22px', opacity: isRecording ? 0.5 : 1 }}
//             title="Changer la langue d'écoute"
//           >
//             {sttLanguage === 'fr' ? '🇫🇷' : '🇺🇸'}
//           </button>

//           <button onClick={() => fileInputRef.current.click()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px' }}>📎</button>
          
//           {selectedImage && (
//             <div style={{ position: 'relative' }}>
//               <img src={selectedImage.preview} style={{ height: '40px', borderRadius: '5px', border: '1px solid #cbd5e1' }} />
//               <button onClick={() => setSelectedImage(null)} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '10px', cursor: 'pointer' }}>✕</button>
//             </div>
//           )}

//           <button onClick={toggleRecording} style={{ background: isRecording ? '#ef4444' : '#e2e8f0', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '10px', borderRadius: '50%', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}>
//             {isRecording ? '⏹️' : '🎙️'}
//           </button>
          
//           <textarea style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', resize: 'none', fontSize: '15px', padding: '10px 0' }} placeholder={`Décris ton problème (${sttLanguage === 'fr' ? 'FR' : 'EN'})...`} rows="1" value={inputMessage} onChange={e => setInputMessage(e.target.value)} />
          
//           <button onClick={() => sendMessage(inputMessage, false)} disabled={isLoading} style={{ backgroundColor: isLoading ? '#94a3b8' : '#4f46e5', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: isLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
//             ➤
//           </button>
//         </div>
//       </footer>
//     </div>
//   );
// }
// import React, { useState, useRef, useEffect } from 'react';
// import ReactMarkdown from 'react-markdown';
// import remarkGfm from 'remark-gfm';

// export default function App() {
//   const [messages, setMessages] = useState([
//     { role: 'assistant', content: 'Bonjour ! Je suis ton Subul Cloud Coach. Propulsé par **Deepgram** (Oreilles) et **Cartesia** (Voix) !', agent: 'Coach' }
//   ]);
//   const [inputMessage, setInputMessage] = useState('');
//   const [isLoading, setIsLoading] = useState(false);
//   const [selectedImage, setSelectedImage] = useState(null);
//   const fileInputRef = useRef(null);
  
//   const [liveTranscript, setLiveTranscript] = useState("");
//   const [isRecording, setIsRecording] = useState(false);
  
//   // Refs pour STT (Deepgram) et TTS (Cartesia)
//   const sttSocketRef = useRef(null); 
//   const mediaRecorderRef = useRef(null); 
//   const playbackContextRef = useRef(null); 
//   const nextPlayTimeRef = useRef(0);
//   const messagesEndRef = useRef(null);

//   useEffect(() => {
//     playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
//   }, []);

//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//   }, [messages, liveTranscript]);

//   // 🔊 LECTEUR AUDIO (Cartesia TTS)
//   const playAudioChunk = (arrayBuffer) => {
//     const ctx = playbackContextRef.current;
//     if (!ctx) return;
//     const float32Array = new Float32Array(arrayBuffer);
//     const audioBuffer = ctx.createBuffer(1, float32Array.length, 44100);
//     audioBuffer.getChannelData(0).set(float32Array);
    
//     const source = ctx.createBufferSource();
//     source.buffer = audioBuffer;
//     source.connect(ctx.destination);
    
//     const now = ctx.currentTime;
//     if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now;
//     source.start(nextPlayTimeRef.current);
//     nextPlayTimeRef.current += audioBuffer.duration;
//   };

//   const handleImageUpload = (e) => {
//     const file = e.target.files[0];
//     if (file) {
//       const reader = new FileReader();
//       reader.onloadend = () => setSelectedImage({ preview: reader.result, base64: reader.result.split(',')[1] });
//       reader.readAsDataURL(file);
//     }
//     e.target.value = null; // Reset pour pouvoir re-sélectionner
//   };

//   // 🧠 ENVOI MESSAGE & CARTESIA TTS
//   const sendMessage = async (rawMessage, isAudio = true) => { 
//     if (!rawMessage?.trim() && !selectedImage) return;
//     setIsLoading(true);

//     const currentImage = selectedImage; 
//     setMessages(prev => [
//       ...prev, 
//       { role: 'user', content: rawMessage || "Analyse de cette capture d'écran...", image: currentImage ? currentImage.preview : null }
//     ]);
//     setInputMessage(''); 
//     setSelectedImage(null);

//     try {
//       if (isAudio && playbackContextRef.current.state === 'suspended') {
//         await playbackContextRef.current.resume();
//       }

//       let ttsWs = null;
//       let ttsQueue = [];
//       let contextId = "ctx-" + Date.now();
//       let currentLang = 'fr'; 

//       // Ouverture WebSocket Cartesia TTS
//       if (isAudio) {
//         ttsWs = new WebSocket(`wss://api.cartesia.ai/tts/websocket?api_key=${import.meta.env.VITE_CARTESIA_API_KEY}&cartesia_version=2024-06-10`);
        
//         ttsWs.onopen = () => {
//           while(ttsQueue.length > 0) {
//             ttsWs.send(JSON.stringify(ttsQueue.shift()));
//           }
//         };

//         ttsWs.onmessage = (e) => {
//           const msg = JSON.parse(e.data);
//           if (msg.type === "chunk" && msg.data) {
//             const binaryStr = atob(msg.data);
//             const bytes = new Uint8Array(binaryStr.length);
//             for (let i = 0; i < binaryStr.length; i++) {
//                 bytes[i] = binaryStr.charCodeAt(i);
//             }
//             playAudioChunk(bytes.buffer);
//           }
//         };
//       }

//       const response = await fetch('http://localhost:8000/api/chat', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ message: rawMessage || "", is_audio: isAudio, base64_image: currentImage ? currentImage.base64 : null })
//       });

//       const reader = response.body.getReader();
//       const decoder = new TextDecoder();
//       let fullResponse = "";
      
//       setMessages(prev => [...prev, { role: 'assistant', content: '', agent: 'Coach' }]);

//       while (true) {
//         const { done, value } = await reader.read();
        
//         if (done) {
//           if (isAudio && ttsWs) {
//             const voiceId = currentLang === 'en' ? "6ccbfb76-1fc6-48f7-b71d-91ac6298247b" : "f786b574-daa5-4673-aa0c-cbe3e8534c02";
//             const endPayload = { 
//                 context_id: contextId, 
//                 model_id: "sonic-3",
//                 voice: { mode: "id", id: voiceId },
//                 transcript: " ", 
//                 output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: 44100 },
//                 language: currentLang,
//                 continue: false 
//             };

//             if (ttsWs.readyState === WebSocket.OPEN) {
//               ttsWs.send(JSON.stringify(endPayload));
//             } else {
//               ttsQueue.push(endPayload);
//             }
//             setTimeout(() => { if (ttsWs.readyState === WebSocket.OPEN) ttsWs.close(); }, 3000);
//           }
//           break;
//         }
        
//         const chunk = decoder.decode(value);
//         const lines = chunk.split('\n');
        
//         for (const line of lines) {
//           if (!line.trim()) continue;
//           try {
//             const data = JSON.parse(line);
            
//             if (data.status === "streaming" && data.chunk) {
//               fullResponse += data.chunk;
//               const lang = data.lang || 'fr';
              
//               setMessages(prev => {
//                 const newMsgs = [...prev];
//                 newMsgs[newMsgs.length - 1].content = fullResponse;
//                 return newMsgs;
//               });

//               if (isAudio && ttsWs) {
//                 const cleanText = data.chunk.replace(/[*#_~>|\-`]/g, '');
//                 if (cleanText.trim()) {
//                   currentLang = lang; 
//                   const voiceId = currentLang === 'en' ? "6ccbfb76-1fc6-48f7-b71d-91ac6298247b" : "f786b574-daa5-4673-aa0c-cbe3e8534c02";
                  
//                   const payload = {
//                       context_id: contextId,
//                       model_id: "sonic-3",
//                       voice: { mode: "id", id: voiceId },
//                       transcript: cleanText,
//                       output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: 44100 },
//                       language: currentLang,
//                       continue: true
//                   };
                  
//                   if (ttsWs.readyState === WebSocket.OPEN) {
//                       ttsWs.send(JSON.stringify(payload));
//                   } else {
//                       ttsQueue.push(payload); 
//                   }
//                 }
//               }
//             }
//           } catch(e) {} 
//         }
//       }
//     } catch (e) { 
//       console.error("Erreur serveur:", e);
//       setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erreur de connexion.', agent: 'Système' }]);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   // 🎙️ DEEPGRAM STT : LE MICROPHONE BILINGUE
//   const startRecording = async () => {
//     setLiveTranscript("");
    
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//       const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY; 
      
//       if (!apiKey) {
//         alert("Clé API Deepgram manquante dans le .env !");
//         return;
//       }
      
//       // model=nova-3 & language=multi : Deepgram écoute tout en FR et EN !
//       const socket = new WebSocket(
//         `wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true&endpointing=100`, 
//         ['token', apiKey]
//       );
//       sttSocketRef.current = socket;

//       socket.onopen = () => {
//         setIsRecording(true);
//         // Deepgram adore le format webm envoyé directement !
//         const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
//         mediaRecorderRef.current = mediaRecorder;

//         mediaRecorder.ondataavailable = (event) => {
//           if (event.data.size > 0 && socket.readyState === 1) {
//             socket.send(event.data);
//           }
//         };
//         mediaRecorder.start(250);
//       };

//       let finalTranscriptAccumulator = "";

//       socket.onmessage = (message) => {
//         try {
//             const received = JSON.parse(message.data);
//             if (received.type === "Results" && received.channel) {
//                 const transcript = received.channel.alternatives[0].transcript;
//                 if (transcript && received.is_final) {
//                   finalTranscriptAccumulator += transcript + " ";
//                   setLiveTranscript(finalTranscriptAccumulator);
//                 } else if (transcript) {
//                   setLiveTranscript(finalTranscriptAccumulator + transcript);
//                 }
//             }
//         } catch(e) {}
//       };

//       socket.onclose = () => {
//         setIsRecording(false);
//         if (finalTranscriptAccumulator.trim() !== "") {
//           sendMessage(finalTranscriptAccumulator, true);
//         }
//         stream.getTracks().forEach(track => track.stop());
//       };

//     } catch (err) { 
//       console.error(err);
//       alert("Micro inaccessible."); 
//     }
//   };

//   const stopRecording = () => {
//     if (mediaRecorderRef.current && isRecording) {
//       mediaRecorderRef.current.stop();
//       mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
//       setIsRecording(false);
      
//       if (sttSocketRef.current && sttSocketRef.current.readyState === 1) {
//           sttSocketRef.current.send(JSON.stringify({ type: 'CloseStream' }));
//       }
//     }
//   };

//   const toggleRecording = () => {
//     if (isRecording) {
//       stopRecording();
//     } else {
//       startRecording();
//     }
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f8fafc', fontFamily: 'sans-serif' }}>
//       <header style={{ height: '60px', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' }}>
//         <h1 style={{ color: '#4f46e5', fontWeight: 'bold' }}>☁️ Subul Cloud Coach</h1>
//       </header>

//       <main style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
//         <div style={{ maxWidth: '800px', margin: '0 auto' }}>
//           {messages.map((msg, i) => (
//             <div key={i} style={{ marginBottom: '15px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
//               <div style={{ display: 'inline-block', padding: '12px 18px', borderRadius: '15px', backgroundColor: msg.role === 'user' ? '#4f46e5' : 'white', color: msg.role === 'user' ? 'white' : '#1e293b', border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0', maxWidth: '85%', textAlign: 'left', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
//                 {msg.image && <img src={msg.image} style={{ width: '100%', borderRadius: '10px', marginBottom: '8px', border: '1px solid #e2e8f0' }} alt="Capture" />}
//                 <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
//               </div>
//             </div>
//           ))}
//           {isRecording && <div style={{ textAlign: 'right', color: '#4f46e5', fontWeight: 'bold', fontStyle: 'italic' }}>{liveTranscript}...🎙️</div>}
//           {isLoading && !isRecording && <div style={{ textAlign: 'left', color: '#94a3b8', fontSize: '0.9em' }}>Le Coach réfléchit...</div>}
//           <div ref={messagesEndRef} />
//         </div>
//       </main>

//       <footer style={{ padding: '20px', backgroundColor: 'white', borderTop: '1px solid #ddd' }}>
//         <div style={{ display: 'flex', gap: '10px', maxWidth: '800px', margin: '0 auto', backgroundColor: '#f1f5f9', padding: '10px', borderRadius: '15px', alignItems: 'center' }}>
//           <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
//           <button onClick={() => fileInputRef.current.click()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px' }}>📎</button>
          
//           {selectedImage && (
//             <div style={{ position: 'relative' }}>
//               <img src={selectedImage.preview} style={{ height: '40px', borderRadius: '5px', border: '1px solid #cbd5e1' }} />
//               <button onClick={() => setSelectedImage(null)} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '10px', cursor: 'pointer' }}>✕</button>
//             </div>
//           )}

//           <button onClick={toggleRecording} style={{ background: isRecording ? '#ef4444' : '#e2e8f0', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '10px', borderRadius: '50%', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}>
//             {isRecording ? '⏹️' : '🎙️'}
//           </button>
          
//           <textarea style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', resize: 'none', fontSize: '15px', padding: '10px 0' }} placeholder="Deepgram t'écoute en Français et en Anglais..." rows="1" value={inputMessage} onChange={e => setInputMessage(e.target.value)} />
          
//           <button onClick={() => sendMessage(inputMessage, false)} disabled={isLoading} style={{ backgroundColor: isLoading ? '#94a3b8' : '#4f46e5', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: isLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
//             ➤
//           </button>
//         </div>
//       </footer>
//     </div>
//   );
// }



// import React, { useState, useRef, useEffect } from 'react';
// import ReactMarkdown from 'react-markdown';
// import remarkGfm from 'remark-gfm';

// export default function App() {
//   const [messages, setMessages] = useState([
//     { role: 'assistant', content: 'Bonjour ! Je suis ton Subul Cloud Coach. Propulsé par **Deepgram** (Oreilles) et **Cartesia** (Voix) !', agent: 'Coach' }
//   ]);
//   const [inputMessage, setInputMessage] = useState('');
//   const [isLoading, setIsLoading] = useState(false);
//   const [selectedImage, setSelectedImage] = useState(null);
//   const fileInputRef = useRef(null);
  
//   const [liveTranscript, setLiveTranscript] = useState("");
//   const [isRecording, setIsRecording] = useState(false);

//   // =======================================================
//   // 🛡️ NOUVEAU : GESTION DES IDENTIFIANTS ET DU QUOTA
//   // =======================================================
//   const [userId] = useState(() => {
//     let savedId = localStorage.getItem('subul_user_id');
//     if (!savedId) {
//       savedId = 'user_' + Math.random().toString(36).substr(2, 9);
//       localStorage.setItem('subul_user_id', savedId);
//     }
//     return savedId;
//   });
  
//   const [sessionId] = useState(() => 'session_' + Math.random().toString(36).substr(2, 9));
  
//   const [voiceCredits, setVoiceCredits] = useState(76); // Quota par défaut au lancement

//   // 💰 Récupération du solde depuis le Backend au chargement de la page
//   useEffect(() => {
//     const fetchQuota = async () => {
//       try {
//         const response = await fetch(`http://localhost:8000/api/quota/${userId}`);
//         const data = await response.json();
//         setVoiceCredits(data.remaining_credits);
//       } catch (err) {
//         console.error("Erreur de récupération du quota:", err);
//       }
//     };
//     fetchQuota();
//   }, [userId]);
//   // =======================================================

//   // Refs pour STT (Deepgram) et TTS (Cartesia)
//   const sttSocketRef = useRef(null); 
//   const mediaRecorderRef = useRef(null); 
//   const playbackContextRef = useRef(null); 
//   const nextPlayTimeRef = useRef(0);
//   const messagesEndRef = useRef(null);

//   useEffect(() => {
//     playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
//   }, []);

//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//   }, [messages, liveTranscript]);

//   // 🔊 LECTEUR AUDIO (Cartesia TTS)
//   const playAudioChunk = (arrayBuffer) => {
//     const ctx = playbackContextRef.current;
//     if (!ctx) return;
//     const float32Array = new Float32Array(arrayBuffer);
//     const audioBuffer = ctx.createBuffer(1, float32Array.length, 44100);
//     audioBuffer.getChannelData(0).set(float32Array);
    
//     const source = ctx.createBufferSource();
//     source.buffer = audioBuffer;
//     source.connect(ctx.destination);
    
//     const now = ctx.currentTime;
//     if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now;
//     source.start(nextPlayTimeRef.current);
//     nextPlayTimeRef.current += audioBuffer.duration;
//   };

//   const handleImageUpload = (e) => {
//     const file = e.target.files[0];
//     if (file) {
//       const reader = new FileReader();
//       reader.onloadend = () => setSelectedImage({ preview: reader.result, base64: reader.result.split(',')[1] });
//       reader.readAsDataURL(file);
//     }
//     e.target.value = null; 
//   };

//   // 🧠 ENVOI MESSAGE & CARTESIA TTS
//   const sendMessage = async (rawMessage, isAudio = true) => { 
//     if (!rawMessage?.trim() && !selectedImage) return;
//     setIsLoading(true);

//     const currentImage = selectedImage; 
//     setMessages(prev => [
//       ...prev, 
//       { role: 'user', content: rawMessage || "Analyse de cette capture d'écran...", image: currentImage ? currentImage.preview : null }
//     ]);
//     setInputMessage(''); 
//     setSelectedImage(null);

//     try {
//       if (isAudio && playbackContextRef.current.state === 'suspended') {
//         await playbackContextRef.current.resume();
//       }

//       let ttsWs = null;
//       let ttsQueue = [];
//       let contextId = "ctx-" + Date.now();
//       let currentLang = 'fr'; 

//       if (isAudio) {
//         ttsWs = new WebSocket(`wss://api.cartesia.ai/tts/websocket?api_key=${import.meta.env.VITE_CARTESIA_API_KEY}&cartesia_version=2024-06-10`);
        
//         ttsWs.onopen = () => {
//           while(ttsQueue.length > 0) {
//             ttsWs.send(JSON.stringify(ttsQueue.shift()));
//           }
//         };

//         ttsWs.onmessage = (e) => {
//           const msg = JSON.parse(e.data);
//           if (msg.type === "chunk" && msg.data) {
//             const binaryStr = atob(msg.data);
//             const bytes = new Uint8Array(binaryStr.length);
//             for (let i = 0; i < binaryStr.length; i++) {
//                 bytes[i] = binaryStr.charCodeAt(i);
//             }
//             playAudioChunk(bytes.buffer);
//           } else if (msg.type === "done") {
//              if (ttsWs.readyState === WebSocket.OPEN) {
//                 ttsWs.close(); // Fermeture propre quand Cartesia a fini !
//              }
//           }
//         };
//       }

//       const response = await fetch('http://localhost:8000/api/chat', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         // 🛡️ NOUVEAU : Envoi de l'ID utilisateur pour la facturation côté serveur
//         body: JSON.stringify({ 
//             message: rawMessage || "", 
//             is_audio: isAudio, 
//             base64_image: currentImage ? currentImage.base64 : null,
//             user_id: userId,
//             session_id: sessionId
//         })
//       });

//       const reader = response.body.getReader();
//       const decoder = new TextDecoder();
//       let fullResponse = "";
      
//       setMessages(prev => [...prev, { role: 'assistant', content: '', agent: 'Coach' }]);

//       while (true) {
//         const { done, value } = await reader.read();
        
//         if (done) {
//           if (isAudio && ttsWs) {
//             const voiceId = currentLang === 'en' ? "6ccbfb76-1fc6-48f7-b71d-91ac6298247b" : "f786b574-daa5-4673-aa0c-cbe3e8534c02";
//             const endPayload = { 
//                 context_id: contextId, 
//                 model_id: "sonic-3",
//                 voice: { mode: "id", id: voiceId },
//                 transcript: " ", 
//                 output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: 44100 },
//                 language: currentLang,
//                 continue: false 
//             };

//             if (ttsWs.readyState === WebSocket.OPEN) {
//               ttsWs.send(JSON.stringify(endPayload));
//             } else {
//               ttsQueue.push(endPayload);
//             }
//           }
//           break;
//         }
        
//         const chunk = decoder.decode(value);
//         const lines = chunk.split('\n');
        
//         for (const line of lines) {
//           if (!line.trim()) continue;
//           try {
//             const data = JSON.parse(line);
            
//             if (data.status === "streaming" && data.chunk) {
//               fullResponse += data.chunk;
//               const lang = data.lang || 'fr';
              
//               setMessages(prev => {
//                 const newMsgs = [...prev];
//                 newMsgs[newMsgs.length - 1].content = fullResponse;
//                 return newMsgs;
//               });

//               if (isAudio && ttsWs) {
//                 // Nettoyage regex corrigé pour éviter de bloquer Cartesia !
//                 const cleanText = data.chunk.replace(/[*#_~>|\-`"']/g, '');
//                 if (cleanText !== "") {
//                   currentLang = lang; 
//                   const voiceId = currentLang === 'en' ? "6ccbfb76-1fc6-48f7-b71d-91ac6298247b" : "f786b574-daa5-4673-aa0c-cbe3e8534c02";
                  
//                   const payload = {
//                       context_id: contextId,
//                       model_id: "sonic-3",
//                       voice: { mode: "id", id: voiceId },
//                       transcript: cleanText,
//                       output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: 44100 },
//                       language: currentLang,
//                       continue: true
//                   };
                  
//                   if (ttsWs.readyState === WebSocket.OPEN) {
//                       ttsWs.send(JSON.stringify(payload));
//                   } else {
//                       ttsQueue.push(payload); 
//                   }
//                 }
//               }
//             }
//           } catch(e) {} 
//         }
//       }
//     } catch (e) { 
//       console.error("Erreur serveur:", e);
//       setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erreur de connexion.', agent: 'Système' }]);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   // 🎙️ DEEPGRAM STT : LE MICROPHONE BILINGUE
//   const startRecording = async () => {
//     // 🛡️ NOUVEAU : Blocage de sécurité si le quota est épuisé
//     if (voiceCredits <= 0) return;

//     setVoiceCredits(prev => prev - 1); // Décrémente l'affichage pour l'UX
//     setLiveTranscript("");
    
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//       const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY; 
      
//       if (!apiKey) {
//         alert("Clé API Deepgram manquante dans le .env !");
//         return;
//       }
      
//       const socket = new WebSocket(
//         `wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true&endpointing=100`, 
//         ['token', apiKey]
//       );
//       sttSocketRef.current = socket;

//       socket.onopen = () => {
//         setIsRecording(true);
//         const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
//         mediaRecorderRef.current = mediaRecorder;

//         mediaRecorder.ondataavailable = (event) => {
//           if (event.data.size > 0 && socket.readyState === 1) {
//             socket.send(event.data);
//           }
//         };
//         mediaRecorder.start(250);
//       };

//       let finalTranscriptAccumulator = "";

//       socket.onmessage = (message) => {
//         try {
//             const received = JSON.parse(message.data);
//             if (received.type === "Results" && received.channel) {
//                 const transcript = received.channel.alternatives[0].transcript;
//                 if (transcript && received.is_final) {
//                   finalTranscriptAccumulator += transcript + " ";
//                   setLiveTranscript(finalTranscriptAccumulator);
//                 } else if (transcript) {
//                   setLiveTranscript(finalTranscriptAccumulator + transcript);
//                 }
//             }
//         } catch(e) {}
//       };

//       socket.onclose = () => {
//         setIsRecording(false);
//         if (finalTranscriptAccumulator.trim() !== "") {
//           sendMessage(finalTranscriptAccumulator, true);
//         }
//         stream.getTracks().forEach(track => track.stop());
//       };

//     } catch (err) { 
//       console.error(err);
//       alert("Micro inaccessible."); 
//     }
//   };

//   const stopRecording = () => {
//     if (mediaRecorderRef.current && isRecording) {
//       mediaRecorderRef.current.stop();
//       mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
//       setIsRecording(false);
      
//       if (sttSocketRef.current && sttSocketRef.current.readyState === 1) {
//           sttSocketRef.current.send(JSON.stringify({ type: 'CloseStream' }));
//       }
//     }
//   };

//   const toggleRecording = () => {
//     // 🛡️ Si 0 crédit, on ne permet même pas le toggle !
//     if (voiceCredits <= 0) return; 

//     if (isRecording) {
//       stopRecording();
//     } else {
//       startRecording();
//     }
//   };

//   return (
//     <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f8fafc', fontFamily: 'sans-serif' }}>
//       <header style={{ height: '60px', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' }}>
//         <h1 style={{ color: '#4f46e5', fontWeight: 'bold' }}>☁️ Subul Cloud Coach</h1>
//       </header>

//       <main style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
//         <div style={{ maxWidth: '800px', margin: '0 auto' }}>
//           {messages.map((msg, i) => (
//             <div key={i} style={{ marginBottom: '15px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
//               <div style={{ display: 'inline-block', padding: '12px 18px', borderRadius: '15px', backgroundColor: msg.role === 'user' ? '#4f46e5' : 'white', color: msg.role === 'user' ? 'white' : '#1e293b', border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0', maxWidth: '85%', textAlign: 'left', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
//                 {msg.image && <img src={msg.image} style={{ width: '100%', borderRadius: '10px', marginBottom: '8px', border: '1px solid #e2e8f0' }} alt="Capture" />}
//                 <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
//               </div>
//             </div>
//           ))}
//           {isRecording && <div style={{ textAlign: 'right', color: '#4f46e5', fontWeight: 'bold', fontStyle: 'italic' }}>{liveTranscript}...🎙️</div>}
//           {isLoading && !isRecording && <div style={{ textAlign: 'left', color: '#94a3b8', fontSize: '0.9em' }}>Le Coach réfléchit...</div>}
//           <div ref={messagesEndRef} />
//         </div>
//       </main>

//       <footer style={{ padding: '20px', backgroundColor: 'white', borderTop: '1px solid #ddd' }}>
//         {/* 🛡️ NOUVEAU : AFFICHAGE DU QUOTA VISUEL */}
//         <div style={{ maxWidth: '800px', margin: '0 auto', marginBottom: '10px' }}>
//           {voiceCredits <= 0 ? (
//             <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '10px 15px', borderRadius: '10px', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
//               <span>🔒</span> Quota vocal épuisé pour ce mois. Le mode texte gratuit a pris le relais !
//             </div>
//           ) : (
//             <div style={{ textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: 'bold', paddingRight: '10px' }}>
//               🎙️ Crédits vocaux restants : {voiceCredits}/76
//             </div>
//           )}
//         </div>

//         <div style={{ display: 'flex', gap: '10px', maxWidth: '800px', margin: '0 auto', backgroundColor: '#f1f5f9', padding: '10px', borderRadius: '15px', alignItems: 'center' }}>
//           <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
//           <button onClick={() => fileInputRef.current.click()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px' }}>📎</button>
          
//           {selectedImage && (
//             <div style={{ position: 'relative' }}>
//               <img src={selectedImage.preview} style={{ height: '40px', borderRadius: '5px', border: '1px solid #cbd5e1' }} alt="Preview" />
//               <button onClick={() => setSelectedImage(null)} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '10px', cursor: 'pointer' }}>✕</button>
//             </div>
//           )}

//           <button 
//             onClick={toggleRecording} 
//             disabled={voiceCredits <= 0} // 🛑 Désactivation du bouton si 0 crédit
//             title={voiceCredits <= 0 ? "Quota épuisé" : "Cliquez pour parler / arrêter"}
//             style={{ 
//               background: voiceCredits <= 0 ? '#e2e8f0' : (isRecording ? '#ef4444' : '#e2e8f0'), 
//               color: voiceCredits <= 0 ? '#94a3b8' : 'inherit',
//               border: 'none', 
//               cursor: voiceCredits <= 0 ? 'not-allowed' : 'pointer', 
//               fontSize: '20px', 
//               padding: '10px', 
//               borderRadius: '50%', 
//               width: '45px', 
//               height: '45px', 
//               display: 'flex', 
//               alignItems: 'center', 
//               justifyContent: 'center', 
//               transition: '0.2s',
//               opacity: voiceCredits <= 0 ? 0.5 : 1
//             }}>
//             {isRecording ? '⏹️' : '🎙️'}
//           </button>
          
//           <textarea style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', resize: 'none', fontSize: '15px', padding: '10px 0' }} placeholder="Deepgram t'écoute en Français et en Anglais..." rows="1" value={inputMessage} onChange={e => setInputMessage(e.target.value)} />
          
//           <button onClick={() => sendMessage(inputMessage, false)} disabled={isLoading || (!inputMessage.trim() && !selectedImage)} style={{ backgroundColor: (isLoading || (!inputMessage.trim() && !selectedImage)) ? '#94a3b8' : '#4f46e5', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: (isLoading || (!inputMessage.trim() && !selectedImage)) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
//             ➤
//           </button>
//         </div>
//       </footer>
//     </div>
//   );
// }

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Bonjour ! Je suis ton Subul Cloud Coach. Propulsé par **Deepgram** (Oreilles) et **Cartesia** (Voix) !', agent: 'Coach' }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const fileInputRef = useRef(null);
  
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  // =======================================================
  // 🆔 GESTION DES IDENTIFIANTS (Session & User ID)
  // =======================================================
  const [userId] = useState(() => {
    let savedId = localStorage.getItem('subul_user_id');
    if (!savedId) {
      savedId = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('subul_user_id', savedId);
    }
    return savedId;
  });
  
  const [sessionId] = useState(() => 'session_' + Math.random().toString(36).substr(2, 9));
  // =======================================================

  // Refs pour STT (Deepgram) et TTS (Cartesia)
  const sttSocketRef = useRef(null); 
  const mediaRecorderRef = useRef(null); 
  const playbackContextRef = useRef(null); 
  const nextPlayTimeRef = useRef(0);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveTranscript]);

  // 🔊 LECTEUR AUDIO (Cartesia TTS)
  const playAudioChunk = (arrayBuffer) => {
    const ctx = playbackContextRef.current;
    if (!ctx) return;
    const float32Array = new Float32Array(arrayBuffer);
    const audioBuffer = ctx.createBuffer(1, float32Array.length, 44100);
    audioBuffer.getChannelData(0).set(float32Array);
    
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    const now = ctx.currentTime;
    if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now;
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuffer.duration;
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedImage({ preview: reader.result, base64: reader.result.split(',')[1] });
      reader.readAsDataURL(file);
    }
    e.target.value = null; 
  };

  // 🧠 ENVOI MESSAGE & CARTESIA TTS
  const sendMessage = async (rawMessage, isAudio = true) => { 
    if (!rawMessage?.trim() && !selectedImage) return;
    setIsLoading(true);

    const currentImage = selectedImage; 
    setMessages(prev => [
      ...prev, 
      { role: 'user', content: rawMessage || "Analyse de cette capture d'écran...", image: currentImage ? currentImage.preview : null }
    ]);
    setInputMessage(''); 
    setSelectedImage(null);

    try {
      if (isAudio && playbackContextRef.current.state === 'suspended') {
        await playbackContextRef.current.resume();
      }

      let ttsWs = null;
      let ttsQueue = [];
      let contextId = "ctx-" + Date.now();
      let currentLang = 'fr'; 

      if (isAudio) {
        ttsWs = new WebSocket(`wss://api.cartesia.ai/tts/websocket?api_key=${import.meta.env.VITE_CARTESIA_API_KEY}&cartesia_version=2024-06-10`);
        
        ttsWs.onopen = () => {
          while(ttsQueue.length > 0) {
            ttsWs.send(JSON.stringify(ttsQueue.shift()));
          }
        };

        ttsWs.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.type === "chunk" && msg.data) {
            const binaryStr = atob(msg.data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            playAudioChunk(bytes.buffer);
          } else if (msg.type === "done") {
             if (ttsWs.readyState === WebSocket.OPEN) {
                ttsWs.close(); 
             }
          }
        };
      }

      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            message: rawMessage || "", 
            is_audio: isAudio, 
            base64_image: currentImage ? currentImage.base64 : null,
            user_id: userId,
            session_id: sessionId
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      
      setMessages(prev => [...prev, { role: 'assistant', content: '', agent: 'Coach' }]);

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          if (isAudio && ttsWs) {
            const voiceId = currentLang === 'en' ? "6ccbfb76-1fc6-48f7-b71d-91ac6298247b" : "f786b574-daa5-4673-aa0c-cbe3e8534c02";
            const endPayload = { 
                context_id: contextId, 
                model_id: "sonic-3",
                voice: { mode: "id", id: voiceId },
                transcript: " ", 
                output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: 44100 },
                language: currentLang,
                continue: false 
            };

            if (ttsWs.readyState === WebSocket.OPEN) {
              ttsWs.send(JSON.stringify(endPayload));
            } else {
              ttsQueue.push(endPayload);
            }
          }
          break;
        }
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            
            if (data.status === "streaming" && data.chunk) {
              fullResponse += data.chunk;
              const lang = data.lang || 'fr';
              
              setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1].content = fullResponse;
                return newMsgs;
              });

              if (isAudio && ttsWs) {
                const cleanText = data.chunk.replace(/[*#_~>|\-`"']/g, '');
                if (cleanText !== "") {
                  currentLang = lang; 
                  const voiceId = currentLang === 'en' ? "6ccbfb76-1fc6-48f7-b71d-91ac6298247b" : "f786b574-daa5-4673-aa0c-cbe3e8534c02";
                  
                  const payload = {
                      context_id: contextId,
                      model_id: "sonic-3",
                      voice: { mode: "id", id: voiceId },
                      transcript: cleanText,
                      output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: 44100 },
                      language: currentLang,
                      continue: true
                  };
                  
                  if (ttsWs.readyState === WebSocket.OPEN) {
                      ttsWs.send(JSON.stringify(payload));
                  } else {
                      ttsQueue.push(payload); 
                  }
                }
              }
            }
          } catch(e) {} 
        }
      }
    } catch (e) { 
      console.error("Erreur serveur:", e);
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erreur de connexion.', agent: 'Système' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // 🎙️ DEEPGRAM STT : LE MICROPHONE BILINGUE
  const startRecording = async () => {
    setLiveTranscript("");
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY; 
      
      if (!apiKey) {
        alert("Clé API Deepgram manquante dans le .env !");
        return;
      }
      
      const socket = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true&endpointing=100`, 
        ['token', apiKey]
      );
      sttSocketRef.current = socket;

      socket.onopen = () => {
        setIsRecording(true);
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === 1) {
            socket.send(event.data);
          }
        };
        mediaRecorder.start(250);
      };

      let finalTranscriptAccumulator = "";

      socket.onmessage = (message) => {
        try {
            const received = JSON.parse(message.data);
            if (received.type === "Results" && received.channel) {
                const transcript = received.channel.alternatives[0].transcript;
                if (transcript && received.is_final) {
                  finalTranscriptAccumulator += transcript + " ";
                  setLiveTranscript(finalTranscriptAccumulator);
                } else if (transcript) {
                  setLiveTranscript(finalTranscriptAccumulator + transcript);
                }
            }
        } catch(e) {}
      };

      socket.onclose = () => {
        setIsRecording(false);
        if (finalTranscriptAccumulator.trim() !== "") {
          sendMessage(finalTranscriptAccumulator, true);
        }
        stream.getTracks().forEach(track => track.stop());
      };

    } catch (err) { 
      console.error(err);
      alert("Micro inaccessible."); 
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setIsRecording(false);
      
      if (sttSocketRef.current && sttSocketRef.current.readyState === 1) {
          sttSocketRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      }
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f8fafc', fontFamily: 'sans-serif' }}>
      <header style={{ height: '60px', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' }}>
        <h1 style={{ color: '#4f46e5', fontWeight: 'bold' }}>☁️ Subul Cloud Coach</h1>
      </header>

      <main style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: '15px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
              <div style={{ display: 'inline-block', padding: '12px 18px', borderRadius: '15px', backgroundColor: msg.role === 'user' ? '#4f46e5' : 'white', color: msg.role === 'user' ? 'white' : '#1e293b', border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0', maxWidth: '85%', textAlign: 'left', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                {msg.image && <img src={msg.image} style={{ width: '100%', borderRadius: '10px', marginBottom: '8px', border: '1px solid #e2e8f0' }} alt="Capture" />}
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
            </div>
          ))}
          {isRecording && <div style={{ textAlign: 'right', color: '#4f46e5', fontWeight: 'bold', fontStyle: 'italic' }}>{liveTranscript}...🎙️</div>}
          {isLoading && !isRecording && <div style={{ textAlign: 'left', color: '#94a3b8', fontSize: '0.9em' }}>Le Coach réfléchit...</div>}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer style={{ padding: '20px', backgroundColor: 'white', borderTop: '1px solid #ddd' }}>
        <div style={{ display: 'flex', gap: '10px', maxWidth: '800px', margin: '0 auto', backgroundColor: '#f1f5f9', padding: '10px', borderRadius: '15px', alignItems: 'center' }}>
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current.click()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px' }}>📎</button>
          
          {selectedImage && (
            <div style={{ position: 'relative' }}>
              <img src={selectedImage.preview} style={{ height: '40px', borderRadius: '5px', border: '1px solid #cbd5e1' }} alt="Preview" />
              <button onClick={() => setSelectedImage(null)} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '10px', cursor: 'pointer' }}>✕</button>
            </div>
          )}

          <button 
            onClick={toggleRecording} 
            title="Cliquez pour parler / arrêter"
            style={{ 
              background: isRecording ? '#ef4444' : '#e2e8f0', 
              color: 'inherit',
              border: 'none', 
              cursor: 'pointer', 
              fontSize: '20px', 
              padding: '10px', 
              borderRadius: '50%', 
              width: '45px', 
              height: '45px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              transition: '0.2s',
            }}>
            {isRecording ? '⏹️' : '🎙️'}
          </button>
          
          <textarea style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', resize: 'none', fontSize: '15px', padding: '10px 0' }} placeholder="Deepgram t'écoute en Français et en Anglais..." rows="1" value={inputMessage} onChange={e => setInputMessage(e.target.value)} />
          
          <button onClick={() => sendMessage(inputMessage, false)} disabled={isLoading || (!inputMessage.trim() && !selectedImage)} style={{ backgroundColor: (isLoading || (!inputMessage.trim() && !selectedImage)) ? '#94a3b8' : '#4f46e5', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: (isLoading || (!inputMessage.trim() && !selectedImage)) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
            ➤
          </button>
        </div>
      </footer>
    </div>
  );
}