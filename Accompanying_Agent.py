import os
import sys
import asyncio
import json
import time 
import httpx 
import base64

from typing import Annotated, Optional
from pydantic import Field
from dotenv import load_dotenv

# 🚀 IMPORT DE L'ADAPTATEUR COSMOS DB
from memory_management import MemoryManager, CosmosDBAdapter

_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

# On s'assure que le dossier courant est dans le path
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)

# Chargement du fichier .env.txt
env_path = os.path.join(_CURRENT_DIR, ".env.txt")

if os.path.exists(env_path):
    print(f"📂 Configuration chargée depuis : {env_path}")
    load_dotenv(dotenv_path=env_path)
else:
    print(f"❌ Erreur : Fichier config introuvable à {env_path}")

from search_index_manager import SearchIndexManager
from azure.core.credentials import AzureKeyCredential
from openai import AsyncAzureOpenAI

# ============================================================
# 🛡️ LE DESIGN PATTERN PROXY : Bypass Agent pour le Streaming + VISION
# ============================================================
class MemoryAgentProxy:
    def __init__(self, memory_manager: MemoryManager, search_manager: SearchIndexManager, oai_client: AsyncAzureOpenAI, chat_model: str, instructions: str):
        self.memory = memory_manager
        self.search_manager = search_manager
        self.oai_client = oai_client       
        self.chat_model = chat_model       
        self.instructions = instructions   

    async def run_stream(self, message: str, user_id: str, session_id: str, base64_image: Optional[str] = None):
        print("\n⏱️ --- DÉBUT DU CHRONO (ULTRA-RÉSILIENT & MULTIMODAL) ---")
        t0 = time.time()

        # 1. Lancement des tâches SANS BLOQUER
        task_history = asyncio.create_task(self.memory.get_full_context(user_id, session_id))
        
        # Si on a une image mais pas de texte, on crée un texte par défaut pour la recherche
        search_query = message if message.strip() else "Analyse cette erreur sur la capture d'écran"
        task_search = asyncio.create_task(self.search_manager.search(search_query))
        
        # On sauvegarde le message texte en fond
        asyncio.create_task(self.memory.add_user_message(user_id, session_id, message or "[Image envoyée]"))

        # 2. RÉCUPÉRATION SÉCURISÉE
        try:
            res_history, res_search = await asyncio.wait_for(
                asyncio.gather(task_history, task_search, return_exceptions=True),
                timeout=10.0 # Timeout généreux pour le RAG
            )
            
            if isinstance(res_history, Exception):
                print(f"⚠️ Erreur Mémoire ignorée: {res_history}")
                long_ctx, short_hist = "", []
            else:
                long_ctx, short_hist = res_history

            if isinstance(res_search, Exception):
                print(f"⚠️ Erreur Search ignorée: {res_search}")
                context_docs = "Documentation momentanément indisponible."
            else:
                context_docs = res_search

        except Exception as e:
            print(f"🚨 Erreur critique parallèle ou Timeout: {e}")
            long_ctx, short_hist, context_docs = "", [], ""

        t1 = time.time()
        print(f"⏱️ [1+2a] Préparation terminée en {t1 - t0:.2f}s")

        # 3. Construction du prompt (Texte + Contexte)
        history_str = "\n".join([f"{msg['role'].upper()}: {msg['content']}" for msg in short_hist[-4:]])
        augmented_message_text = f"{long_ctx}\n[DOCS]: {context_docs}\n[QUESTION]: {message}"

        # 👁️ FORMATAGE MULTIMODAL POUR GPT-4o
        user_content_payload = [{"type": "text", "text": augmented_message_text}]
        
        if base64_image:
            print("📸 Capture d'écran détectée ! Injection dans le payload de GPT-4o...")
            user_content_payload.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{base64_image}"
                }
            })

        # 🤖 4. STREAMING DIRECT
        full_response = ""
        stream = await self.oai_client.chat.completions.create(
            model=self.chat_model,
            messages=[
                {"role": "system", "content": self.instructions}, 
                {"role": "user", "content": user_content_payload}
            ],
            stream=True,
            temperature=0.3
        )
        
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                text_chunk = chunk.choices[0].delta.content
                full_response += text_chunk
                yield text_chunk

        t2 = time.time()
        print(f"⏱️ [2b] Fin du Streaming : {t2 - t1:.2f} secondes")

        # 5. Sauvegarde finale en arrière-plan
        asyncio.create_task(self.memory.add_agent_message(user_id, session_id, full_response))
        asyncio.create_task(self.memory.trigger_background_summary(user_id, session_id))


class AccompanyingAgent:
    def __init__(self):
        self.AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
        self.AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
        self.AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-4o")
        self.AZURE_OPENAI_EMBED_DEPLOYMENT = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
        
        self.AZURE_SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT")
        self.AZURE_SEARCH_API_KEY = os.getenv("AZURE_SEARCH_API_KEY")
        self.AZURE_SEARCH_INDEX = os.getenv("AZURE_SEARCH_INDEX_NAME")
        self.embed_dimensions = int(os.getenv("AZURE_AI_EMBED_DIMENSIONS", 1536))

        print("🔌 Connexion réseau optimisée (IPv4 Force)...")
        
        custom_http_client = httpx.AsyncClient(
            transport=httpx.AsyncHTTPTransport(local_address="0.0.0.0")
        )

        self.async_client = AsyncAzureOpenAI(
            azure_endpoint=self.AZURE_OPENAI_ENDPOINT,
            api_key=self.AZURE_OPENAI_API_KEY,
            api_version="2024-02-15-preview",
            http_client=custom_http_client
        )

        self.search_index_manager = SearchIndexManager(
            endpoint=self.AZURE_SEARCH_ENDPOINT,
            credential=AzureKeyCredential(self.AZURE_SEARCH_API_KEY),
            index_name=self.AZURE_SEARCH_INDEX,
            dimensions=self.embed_dimensions,
            model=self.AZURE_OPENAI_EMBED_DEPLOYMENT,
            embeddings_client=self.async_client
        )

        # 🚀 INITIALISATION DE COSMOS DB
        self.db_adapter = CosmosDBAdapter(
            endpoint=os.getenv("AZURE_COSMOS_ENDPOINT"),
            key=os.getenv("AZURE_COSMOS_KEY"),
            db_name=os.getenv("AZURE_COSMOS_DATABASE_NAME"),
            container_name=os.getenv("AZURE_COSMOS_CONTAINER_NAME")
        )

        self.memory = MemoryManager(
            oai_client=self.async_client,
            chat_model=self.AZURE_OPENAI_DEPLOYMENT,
            db_adapter=self.db_adapter
        )

    async def setup(self):
        # 🚀 CONNEXION À COSMOS DB AVANT LE SEARCH
        print("📦 Initialisation de la base de données Cosmos DB...")
        await self.db_adapter.setup()
        
        print("🔍 Vérification de l'index Azure AI Search...")
        await self.search_index_manager.ensure_index_created(vector_index_dimensions=self.embed_dimensions)

    def get_agent(self, lang: str, is_audio: bool):
        base_instruction = f"""Tu es 'Subul Cloud Coach', un mentor expert et bienveillant qui accompagne un étudiant dans ses Labs pratiques sur Azure.
L'utilisateur te parle en '{lang}'. Tu DOIS lui répondre en '{lang}'.

RÈGLES D'OR DU COACHING SOCRATIQUE :
1. NE DONNE JAMAIS LA SOLUTION DIRECTEMENT NI LA COMMANDE EXACTE DU PREMIER COUP. 
2. Ton but est de le faire réfléchir par lui-même.
3. Utilise STRICTEMENT le bloc [DOCS] qui contient le contexte de la tâche et les "ERREURS FRÉQUENTES & INDICES".
4. Si l'étudiant t'envoie une capture d'écran, analyse visuellement l'erreur rouge ou l'interface pour comprendre où il est bloqué.
5. Donne un seul indice à la fois. S'il te dit qu'il est toujours bloqué, donne l'indice suivant, plus précis.
6. Sois encourageant, chaleureux et professionnel."""
        
        if is_audio:
            instructions = base_instruction + " MODE VOCAL : RÉPONDS EN 1 OU 2 PHRASES COURTES MAXIMUM. Pas de Markdown."
        else:
            instructions = base_instruction + """ MODE TEXTE : 
Fais des paragraphes courts et aérés. Utilise le **gras** pour mettre en évidence les éléments de l'interface Azure ou les concepts clés."""
            
        return MemoryAgentProxy(
            memory_manager=self.memory,
            search_manager=self.search_index_manager,
            oai_client=self.async_client,
            chat_model=self.AZURE_OPENAI_DEPLOYMENT,
            instructions=instructions
        )

# ============================================================
# 🧪 TEST LOCAL DANS LE TERMINAL (AVANT LE FRONTEND)
# ============================================================
async def test_terminal():
    print("\n" + "="*50)
    print("🛠️ DÉMARRAGE DU TEST LOCAL (CLOUD COACH) 🛠️")
    print("="*50)

    # 1. Initialisation de l'Agent
    agent_system = AccompanyingAgent()
    await agent_system.setup()
    
    # 2. On récupère notre Coach (Texte, en Français)
    coach = agent_system.get_agent(lang="français", is_audio=False)

    # Variables de session simulées
    user_id = "etudiant_test_001"
    session_id = "session_lab8_001"

    print("\n✅ Agent prêt ! Tape 'quitter' pour arrêter le test.")

    while True:
        texte = input("\n👨‍🎓 Toi : ")
        if texte.lower() in ['quitter', 'exit', 'quit']:
            print("👋 Fin du test local.")
            break

        chemin_image = input("📸 Chemin de l'image (Appuie sur Entrée pour ignorer) : ").strip()
        chemin_image = chemin_image.strip("'\"") 
        
        base64_img = None
        if chemin_image:
            if os.path.exists(chemin_image):
                try:
                    with open(chemin_image, "rb") as img_file:
                        base64_img = base64.b64encode(img_file.read()).decode('utf-8')
                    print(f"   [✅ Image chargée : {os.path.basename(chemin_image)}]")
                except Exception as e:
                    print(f"   [❌ Erreur lors de la lecture de l'image : {e}]")
            else:
                print(f"   [⚠️ Fichier introuvable, l'Agent répondra sans l'image]")

        print("\n🤖 Coach : ", end="", flush=True)

        try:
            async for chunk in coach.run_stream(
                message=texte, 
                user_id=user_id, 
                session_id=session_id, 
                base64_image=base64_img
            ):
                print(chunk, end="", flush=True)
            print() 
            
        except Exception as e:
            print(f"\n❌ Erreur pendant le stream : {e}")

# 🔥 C'EST CE BLOC QUI LANCE LE SCRIPT :
if __name__ == "__main__":
    try:
        asyncio.run(test_terminal())
    except KeyboardInterrupt:
        print("\n👋 Arrêt manuel du Coach.")
    except Exception as e:
        print(f"\n💥 Erreur au démarrage : {e}")