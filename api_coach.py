import asyncio
import json
import re
import os
from fastapi import FastAPI, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from contextlib import asynccontextmanager
import requests

from langdetect import detect 

from Accompanying_Agent import AccompanyingAgent


from cartesia import Cartesia 

coach_system = AccompanyingAgent()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(" Démarrage du Serveur FastAPI (Subul Cloud Coach)...")
    await coach_system.setup()
    
    print(" Warm-up réseau (Azure Search)...")
    try:
        await coach_system.search_index_manager.search("azure cloud diagnostics")
        print(" Réseau prêt !")
    except Exception as e:
        print(f" Warm-up a échoué: {e}")

    print(" API prête à recevoir des requêtes !")
    yield 
    print(" Extinction du serveur...")

app = FastAPI(title="Subul Cloud Coach API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    user_id: str = "etudiant_anonyme"
    session_id: str = "session_defaut"
    is_audio: bool = False
    base64_image: Optional[str] = None 

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
   
    try:
        clean_text = request.message.strip()
        if len(clean_text) >= 2:
            lang_code = detect(clean_text)
            final_lang = "fr" if lang_code == "fr" else "en"
        else:
            final_lang = "fr"
    except Exception:
        final_lang = "fr" 

    print(f" Message de [{request.user_id}] | Langue détectée : {final_lang} | Audio : {request.is_audio}")
    
    agent = coach_system.get_agent(lang=final_lang, is_audio=request.is_audio)
    
    async def generate_response():
        try:
            consigne = "\n\n(Réponds en Français.)" if final_lang == "fr" else "\n\n(Answer in English.)"
            message_securise = request.message + consigne

            
            async for chunk in agent.run_stream(
                message=message_securise, 
                user_id=request.user_id, 
                session_id=request.session_id,
                base64_image=request.base64_image
            ):
                
                yield json.dumps({"chunk": chunk, "status": "streaming", "lang": final_lang}) + "\n"

            yield json.dumps({"chunk": "", "status": "completed", "lang": final_lang}) + "\n"

        except Exception as e:
            print(f" Erreur streaming : {e}")
            yield json.dumps({"chunk": f"Erreur: {e}", "status": "error"}) + "\n"

    return StreamingResponse(generate_response(), media_type="application/x-ndjson")


@app.get("/api/tts")
def tts_endpoint(text: str, lang: str = "fr"):
    print(f"🔊 Demande Cartesia TTS ({lang}) : {text}")
    
    if lang == "en":
    
        voice_id = "6ccbfb76-1fc6-48f7-b71d-91ac6298247b" 
    else:
        voice_id = "65b25c5d-ff07-4687-a04c-da2f43ef6fa9" 

    CARTESIA_API_KEY = os.getenv("CARTESIA_API_KEY")
    CARTESIA_URL = "https://api.cartesia.ai/tts/bytes"

    
    headers = {
        "X-API-Key": CARTESIA_API_KEY,
        "Cartesia-Version": "2025-04-16", 
        "Content-Type": "application/json"
    }

    payload = {
        "model_id": "sonic-3",
        "transcript": text,
        "voice": {
            "mode": "id",
            "id": voice_id
        },
        "output_format": {
            "container": "wav",
            "encoding": "pcm_f32le",
            "sample_rate": 44100
        },
        "language": lang, 
        "generation_config": {
            "speed": 1,
            "volume": 1
        }
    }
    
    try:
        response = requests.post(CARTESIA_URL, headers=headers, json=payload)
        
        if response.status_code != 200:
            error_detail = response.text
            print(f" Erreur Cartesia: {error_detail}")
            raise HTTPException(status_code=500, detail=f"Cartesia Error: {error_detail}")

        return Response(content=response.content, media_type="audio/wav")
        
    except Exception as e:
        print(f" Erreur Serveur TTS: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class EndSessionRequest(BaseModel):
    user_id: str
    session_id: str

@app.post("/api/session/end")
async def end_session(request: EndSessionRequest):
    try:
        await coach_system.memory.trigger_background_summary(request.user_id, request.session_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
