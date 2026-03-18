# """
# memory_management.py — Gestion de Mémoire Cloud-Native avec Azure Cosmos DB
# """

# import os
# import json
# import uuid
# import asyncio
# from datetime import datetime
# from typing import List, Dict, Optional

# try:
#     import tiktoken as _tiktoken
#     _TIKTOKEN_AVAILABLE = True
# except ImportError:
#     _tiktoken = None
#     _TIKTOKEN_AVAILABLE = False

# from openai import AsyncAzureOpenAI
# from azure.cosmos.aio import CosmosClient
# from azure.cosmos import PartitionKey, exceptions

# # ============================================================
# # 0. ABSTRACTION DU STOCKAGE (Adaptateur Cosmos DB)
# # ============================================================
# class DatabaseAdapter:
#     async def save_message(self, user_id: str, session_id: str, role: str, content: str):
#         raise NotImplementedError
        
#     async def get_session_messages(self, session_id: str) -> List[Dict]:
#         raise NotImplementedError

#     async def save_long_term_memory(self, user_id: str, memory_type: str, content: str, subject: str):
#         raise NotImplementedError
        
#     async def get_user_memories(self, user_id: str) -> List[Dict]:
#         raise NotImplementedError

# class CosmosDBAdapter(DatabaseAdapter):
#     """Adaptateur pour Azure Cosmos DB (Production)"""
#     def __init__(self, endpoint: str, key: str, db_name: str, container_name: str):
#         self.client = CosmosClient(endpoint, key)
#         self.db_name = db_name
#         self.container_name = container_name
#         self.database = None
#         self.container = None

#     async def setup(self):
#         """Initialise la connexion à Cosmos DB et crée la DB/Container si besoin"""
#         # 🚀 LA CORRECTION EST ICI : On crée la Database si elle est introuvable
#         self.database = await self.client.create_database_if_not_exists(id=self.db_name)
        
#         # On s'assure que le container existe, partitionné par /id
#         self.container = await self.database.create_container_if_not_exists(
#             id=self.container_name,
#             partition_key=PartitionKey(path="/id")
#         )
#         print(f"✅ CosmosDB Connecté : DB '{self.db_name}' et Container '{self.container_name}' prêts.")

#     async def _read_doc(self, doc_id: str) -> Dict:
#         try:
#             return await self.container.read_item(item=doc_id, partition_key=doc_id)
#         except exceptions.CosmosResourceNotFoundError:
#             return {"id": doc_id, "data": []}

#     async def save_message(self, user_id: str, session_id: str, role: str, content: str):
#         doc_id = f"session_{session_id}"
#         doc = await self._read_doc(doc_id)
#         doc["type"] = "short_term"
#         doc["user_id"] = user_id
#         doc["data"].append({
#             "role": role, 
#             "content": content, 
#             "timestamp": datetime.now().isoformat()
#         })
#         await self.container.upsert_item(doc)

#     async def get_session_messages(self, session_id: str) -> List[Dict]:
#         doc = await self._read_doc(f"session_{session_id}")
#         return doc.get("data", [])

#     async def save_long_term_memory(self, user_id: str, memory_type: str, content: str, subject: str):
#         doc_id = f"user_{user_id}"
#         doc = await self._read_doc(doc_id)
#         doc["type"] = "long_term"
#         doc["data"].append({
#             "id": str(uuid.uuid4()),
#             "type": memory_type,
#             "subject": subject,
#             "content": content,
#             "timestamp": datetime.now().isoformat()
#         })
#         await self.container.upsert_item(doc)

#     async def get_user_memories(self, user_id: str) -> List[Dict]:
#         doc = await self._read_doc(f"user_{user_id}")
#         return doc.get("data", [])

# # ============================================================
# # 1. LOGIQUE MÉMOIRE (Identique, mais utilise l'adaptateur)
# # ============================================================
# class ShortMemory:
#     def __init__(self, db_adapter: DatabaseAdapter, max_tokens: int = 6000):
#         self.db = db_adapter
#         self.max_tokens = max_tokens
#         self._enc = _tiktoken.get_encoding("cl100k_base") if _TIKTOKEN_AVAILABLE else None

#     async def add(self, user_id: str, session_id: str, role: str, content: str):
#         await self.db.save_message(user_id, session_id, role, content)

#     async def get_history(self, session_id: str) -> List[Dict]:
#         raw_messages = await self.db.get_session_messages(session_id)
#         valid_messages = []
#         current_tokens = 0
        
#         for msg in reversed(raw_messages):
#             text = msg["content"]
#             tokens = len(self._enc.encode(text)) if self._enc else len(text) // 4
#             if current_tokens + tokens > self.max_tokens:
#                 break
#             valid_messages.insert(0, {"role": msg["role"], "content": msg["content"]})
#             current_tokens += tokens
#         return valid_messages

# class LongMemory:
#     def __init__(self, db_adapter: DatabaseAdapter, max_context: int = 5):
#         self.db = db_adapter
#         self.max_context = max_context

#     async def add_summary(self, user_id: str, summary: str, subject: str = ""):
#         await self.db.save_long_term_memory(user_id, "summary", summary, subject)

#     async def get_context_for_prompt(self, user_id: str) -> str:
#         entries = await self.db.get_user_memories(user_id)
#         if not entries: return ""
#         recent = entries[-self.max_context:][::-1]
#         lines = [f"📝 {e['timestamp'][:10]} — [{e.get('subject','')}] {e['content']}" for e in recent]
#         return "\n".join(lines)

# # ============================================================
# # 2. MÉMOIRE MANAGER
# # ============================================================
# class MemoryManager:
#     def __init__(self, oai_client: AsyncAzureOpenAI, chat_model: str, db_adapter: DatabaseAdapter):
#         self._client = oai_client
#         self._chat_model = chat_model
#         self.db_adapter = db_adapter
#         self.short = ShortMemory(db_adapter=self.db_adapter)
#         self.long = LongMemory(db_adapter=self.db_adapter)

#     async def add_user_message(self, user_id: str, session_id: str, content: str):
#         await self.short.add(user_id, session_id, "user", content)

#     async def add_agent_message(self, user_id: str, session_id: str, content: str):
#         await self.short.add(user_id, session_id, "assistant", content)

#     async def get_full_context(self, user_id: str, session_id: str) -> tuple:
#         long_ctx, short_hist = await asyncio.gather(
#             self.long.get_context_for_prompt(user_id),
#             self.short.get_history(session_id)
#         )
#         formatted_long = f"📚 HISTORIQUE ÉTUDIANT :\n{long_ctx}" if long_ctx else ""
#         return formatted_long, short_hist

#     async def trigger_background_summary(self, user_id: str, session_id: str):
#         history = await self.short.get_history(session_id)
#         if len(history) < 6: return 

#         prompt = f"Résume les acquis techniques de l'étudiant à partir de cette discussion :\n\n" + \
#                  "\n".join([f"{m['role']}: {m['content']}" for m in history])
        
#         try:
#             res = await self._client.chat.completions.create(
#                 model=self._chat_model,
#                 messages=[{"role": "user", "content": prompt}],
#                 max_tokens=150
#             )
#             await self.long.add_summary(user_id, res.choices[0].message.content, subject=f"Session {session_id[:5]}")
#         except Exception as e:
#             print(f"⚠️ Erreur résumé : {e}")


"""
memory_management.py — Gestion de Mémoire Cloud-Native avec Azure Cosmos DB (Agent Coach)
"""

import os
import json
import uuid
import asyncio
from datetime import datetime
from typing import List, Dict, Optional

try:
    import tiktoken as _tiktoken
    _TIKTOKEN_AVAILABLE = True
except ImportError:
    _tiktoken = None
    _TIKTOKEN_AVAILABLE = False

from openai import AsyncAzureOpenAI
from azure.cosmos.aio import CosmosClient
from azure.cosmos import PartitionKey, exceptions

# ============================================================
# 0. ABSTRACTION DU STOCKAGE (Adaptateur Cosmos DB)
# ============================================================
class DatabaseAdapter:
    async def save_message(self, user_id: str, session_id: str, role: str, content: str):
        raise NotImplementedError
        
    async def get_session_messages(self, session_id: str) -> List[Dict]:
        raise NotImplementedError

    async def save_long_term_memory(self, user_id: str, memory_type: str, content: str, subject: str):
        raise NotImplementedError
        
    async def get_user_memories(self, user_id: str) -> List[Dict]:
        raise NotImplementedError

class CosmosDBAdapter(DatabaseAdapter):
    """Adaptateur pour Azure Cosmos DB (Production)"""
    def __init__(self, endpoint: str, key: str, db_name: str, container_name: str):
        self.client = CosmosClient(endpoint, key)
        self.db_name = db_name
        self.container_name = container_name
        self.database = None
        self.container = None

    async def setup(self):
        """Initialise la connexion à Cosmos DB et crée la DB/Container si besoin"""
        self.database = await self.client.create_database_if_not_exists(id=self.db_name)
        
        self.container = await self.database.create_container_if_not_exists(
            id=self.container_name,
            partition_key=PartitionKey(path="/id")
        )
        print(f"✅ CosmosDB Connecté : DB '{self.db_name}' et Container '{self.container_name}' prêts.")

    async def _read_doc(self, doc_id: str) -> Dict:
        try:
            return await self.container.read_item(item=doc_id, partition_key=doc_id)
        except exceptions.CosmosResourceNotFoundError:
            return {"id": doc_id, "data": []}

    async def save_message(self, user_id: str, session_id: str, role: str, content: str):
        doc_id = f"session_{session_id}"
        doc = await self._read_doc(doc_id)
        doc["type"] = "short_term"
        doc["user_id"] = user_id
        doc["data"].append({
            "role": role, 
            "content": content, 
            "timestamp": datetime.now().isoformat()
        })
        await self.container.upsert_item(doc)

    async def get_session_messages(self, session_id: str) -> List[Dict]:
        doc = await self._read_doc(f"session_{session_id}")
        return doc.get("data", [])

    async def save_long_term_memory(self, user_id: str, memory_type: str, content: str, subject: str):
        doc_id = f"user_{user_id}"
        doc = await self._read_doc(doc_id)
        doc["type"] = "long_term"
        doc["data"].append({
            "id": str(uuid.uuid4()),
            "type": memory_type,
            "subject": subject,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
        await self.container.upsert_item(doc)

    async def get_user_memories(self, user_id: str) -> List[Dict]:
        doc = await self._read_doc(f"user_{user_id}")
        return doc.get("data", [])

# ============================================================
# 1. LOGIQUE MÉMOIRE (Identique, mais utilise l'adaptateur)
# ============================================================
class ShortMemory:
    def __init__(self, db_adapter: DatabaseAdapter, max_tokens: int = 6000):
        self.db = db_adapter
        self.max_tokens = max_tokens
        self._enc = _tiktoken.get_encoding("cl100k_base") if _TIKTOKEN_AVAILABLE else None

    async def add(self, user_id: str, session_id: str, role: str, content: str):
        await self.db.save_message(user_id, session_id, role, content)

    async def get_history(self, session_id: str) -> List[Dict]:
        raw_messages = await self.db.get_session_messages(session_id)
        valid_messages = []
        current_tokens = 0
        
        for msg in reversed(raw_messages):
            text = msg["content"]
            tokens = len(self._enc.encode(text)) if self._enc else len(text) // 4
            if current_tokens + tokens > self.max_tokens:
                break
            valid_messages.insert(0, {"role": msg["role"], "content": msg["content"]})
            current_tokens += tokens
        return valid_messages

class LongMemory:
    def __init__(self, db_adapter: DatabaseAdapter, max_context: int = 5):
        self.db = db_adapter
        self.max_context = max_context

    async def add_summary(self, user_id: str, summary: str, subject: str = ""):
        await self.db.save_long_term_memory(user_id, "summary", summary, subject)

    async def get_context_for_prompt(self, user_id: str) -> str:
        entries = await self.db.get_user_memories(user_id)
        if not entries: return ""
        recent = entries[-self.max_context:][::-1]
        lines = [f"📝 {e['timestamp'][:10]} — [{e.get('subject','')}] {e['content']}" for e in recent]
        return "\n".join(lines)

# ============================================================
# 2. MÉMOIRE MANAGER
# ============================================================
class MemoryManager:
    def __init__(self, oai_client: AsyncAzureOpenAI, chat_model: str, db_adapter: DatabaseAdapter):
        self._client = oai_client
        self._chat_model = chat_model
        self.db_adapter = db_adapter
        self.short = ShortMemory(db_adapter=self.db_adapter)
        self.long = LongMemory(db_adapter=self.db_adapter)

    async def add_user_message(self, user_id: str, session_id: str, content: str):
        await self.short.add(user_id, session_id, "user", content)

    async def add_agent_message(self, user_id: str, session_id: str, content: str):
        await self.short.add(user_id, session_id, "assistant", content)

    async def get_full_context(self, user_id: str, session_id: str) -> tuple:
        long_ctx, short_hist = await asyncio.gather(
            self.long.get_context_for_prompt(user_id),
            self.short.get_history(session_id)
        )
        formatted_long = f"📚 HISTORIQUE ÉTUDIANT :\n{long_ctx}" if long_ctx else ""
        return formatted_long, short_hist

    async def trigger_background_summary(self, user_id: str, session_id: str):
        """
        Génère un résumé de coaching orienté soft skills et objectifs.
        Doit être appelé uniquement à la fin de la session.
        """
        history = await self.short.get_history(session_id)
        if len(history) < 4: 
            print(f"ℹ️ [Coach Memory] Session {session_id} trop courte pour un bilan.")
            return 

        print(f"\n💭 [Coach Memory] Génération du Bilan de Coaching pour {user_id}...")
        historique_str = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in history])
        
        prompt = (
            "Tu es le Coach d'orientation et de méthodologie d'une plateforme e-learning.\n"
            "Analyse cette conversation finalisée et rédige un rapport ultra-concis (exactement 4 phrases) "
            "qui servira de mémoire à long terme pour la prochaine session de coaching.\n\n"
            "INSTRUCTIONS STRICTES (Rédige 1 phrase par point) :\n"
            "1. OBJECTIFS : Note le ou les objectifs professionnels ou d'apprentissage abordés.\n"
            "2. MOTIVATION : Indique l'état d'esprit de l'étudiant (motivé, bloqué, stressé) et ce qui le rassure.\n"
            "3. FREINS : Indique les obstacles (manque de temps, d'organisation, doutes) qui le bloquent.\n"
            "4. PLAN D'ACTION : Liste les 2 ou 3 prochaines étapes que tu lui as conseillé de faire.\n\n"
            f"CONVERSATION :\n{historique_str}"
        )
        
        try:
            res = await self._client.chat.completions.create(
                model=self._chat_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=250,
                temperature=0.2
            )
            resume = res.choices[0].message.content.strip()
            await self.long.add_summary(user_id, resume, subject=f"Bilan Coaching")
            print(f"✅ [Coach Memory] Bilan sauvegardé avec succès dans Cosmos DB.")
        except Exception as e:
            print(f"⚠️ Erreur résumé Coach : {e}")