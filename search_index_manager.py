from typing import Optional
import time

from azure.core.credentials_async import AsyncTokenCredential
from azure.search.documents.aio import SearchClient
from azure.search.documents.indexes.aio import SearchIndexClient
from azure.search.documents.models import VectorizedQuery, QueryType
from azure.core.exceptions import ResourceNotFoundError, HttpResponseError
from openai import AsyncAzureOpenAI

class SearchIndexManager:
    """
    Manager de recherche adapté SUR MESURE pour l'index de Subul Coach.
    Architecture de Production : Asynchrone, Recherche Hybride (Sémantique + Vecteur).
    """
    
    def __init__(
            self,
            endpoint: str,
            credential: AsyncTokenCredential,
            index_name: str,
            dimensions: Optional[int],
            model: str,
            embeddings_client: AsyncAzureOpenAI,
        ) -> None:
        self._dimensions = dimensions
        self._index_name = index_name
        self._embeddings_client = embeddings_client
        self._endpoint = endpoint
        self._credential = credential
        self._index = None
        self._model = model
        self._client = None

    def _get_client(self) -> SearchClient:
        """Initialise et retourne le SearchClient asynchrone (Singleton pattern)."""
        if self._client is None:
            self._client = SearchClient(
                endpoint=self._endpoint, 
                index_name=self._index_name, 
                credential=self._credential
            )
        return self._client

    async def search(self, message: str) -> str:
        """
        Recherche Hybride (Sémantique + Vectorielle) ultra-optimisée.
        Récupère le contexte du Lab et les indices de coaching.
        """
        t_start = time.time()

        try:
            # 1. Création de l'Embedding (OpenAI)
            response = await self._embeddings_client.embeddings.create(
                input=message,
                model=self._model
            )
            embedded_question = response.data[0].embedding
            
            t_embed = time.time()
            print(f"      -> [Search] 🟢 Embedding généré en {t_embed - t_start:.2f} secondes")
            
            # 2. Requête Vectorielle
            vector_query = VectorizedQuery(
                vector=embedded_question, 
                k_nearest_neighbors=3, 
                fields="vecteur"
            )
            
            # 3. Recherche dans Azure Search (Hybride + Sémantique)
            response_search = await self._get_client().search(
                search_text=message, # Mot-clé pour la recherche hybride
                vector_queries=[vector_query],
                query_type=QueryType.SEMANTIC, # 🔥 Activation du Semantic Ranker
                semantic_configuration_name="my-semantic-config",
                select=[
                    'fichier_source', 
                    'nom_tache', 
                    'contenu_texte', 
                    'solution_conceptuelle', 
                    'analyse_erreurs_str'
                ],
                top=2 # On remonte les 2 tâches les plus pertinentes
            )
            
            results = []
            async for result in response_search:
                # 4. Extraction sécurisée (Fallbacks en cas de champ vide)
                fichier = result.get('fichier_source', 'Inconnu')
                tache = result.get('nom_tache', 'Inconnu')
                texte = result.get('contenu_texte', '')
                concept = result.get('solution_conceptuelle', '')
                erreurs = result.get('analyse_erreurs_str', '')
                
                # 5. Formatage du contexte pour l'Agent Proxy
                bloc = (
                    f"--- DÉBUT DU CONTEXTE ---\n"
                    f"FICHIER : {fichier}\n"
                    f"TÂCHE : {tache}\n"
                    f"INSTRUCTIONS OFFICIELLES : {texte}\n"
                    f"CONCEPT CLÉ : {concept}\n"
                    f"ERREURS FRÉQUENTES & INDICES À UTILISER : {erreurs}\n"
                    f"--- FIN DU CONTEXTE ---"
                )
                results.append(bloc)

            t_db = time.time()
            print(f"      -> [Search] 🔵 Azure Search a répondu en {t_db - t_embed:.2f} secondes")

            if not results:
                return "Aucune documentation technique trouvée pour cette requête."
                
            return "\n\n".join(results)

        except HttpResponseError as e:
            print(f"      -> [Search] ❌ Erreur critique Azure Search : {e}")
            return "Documentation momentanément indisponible (Erreur Azure)."
        except Exception as e:
            print(f"      -> [Search] ❌ Erreur inattendue : {e}")
            return "Une erreur inattendue s'est produite lors de la recherche."

    async def ensure_index_created(self, vector_index_dimensions: Optional[int] = None) -> None:
        """
        Vérifie simplement que l'index existe. 
        (La création complexe est gérée par le pipeline d'indexation).
        """
        async with SearchIndexClient(endpoint=self._endpoint, credential=self._credential) as ix_client:
            try:
                await ix_client.get_index(self._index_name)
                print(f"✅ [Index Manager] Index '{self._index_name}' trouvé et connecté.")
            except ResourceNotFoundError:
                print(f"⚠️ [Index Manager] Index '{self._index_name}' introuvable ! Lance d'abord le script d'indexation.")
        
    async def close(self):
        """Ferme proprement la connexion asynchrone."""
        if self._client:
            await self._client.close()