import os
import json
import time
import hashlib
from dotenv import load_dotenv
from openai import AzureOpenAI
from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex, SimpleField, SearchableField, SearchField, SearchFieldDataType, 
    VectorSearch, HnswAlgorithmConfiguration, VectorSearchProfile,
    SemanticSearch, SemanticConfiguration, SemanticPrioritizedFields, SemanticField
)


load_dotenv(".env.txt")

print("🔌 Connexion aux services Azure (OpenAI & AI Search)...")

oai_client = AzureOpenAI(
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    api_version="2023-05-15" 
)


search_endpoint = os.environ["AZURE_SEARCH_ENDPOINT"]
search_key = AzureKeyCredential(os.environ.get("AZURE_SEARCH_ADMIN_KEY", os.environ.get("AZURE_SEARCH_API_KEY")))
index_name = os.environ["AZURE_SEARCH_INDEX_NAME"]
embedding_model = os.environ["AZURE_OPENAI_EMBEDDING_DEPLOYMENT"]

FICHIER_SOURCE = "base_vectorielle_enrichie.json"
FICHIER_CHECKPOINT = "checkpoint_embeddings.json" 
BATCH_SIZE = 50


def creer_index_semantique():
    print(f"🏗️ Création/Mise à jour de l'index '{index_name}' avec Semantic Ranker...")
    index_client = SearchIndexClient(endpoint=search_endpoint, credential=search_key)
    
    fields = [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SimpleField(name="fichier_source", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="titre_lab", type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="module", type=SearchFieldDataType.String, filterable=True),
        SearchableField(name="nom_tache", type=SearchFieldDataType.String),
        SearchableField(name="contenu_texte", type=SearchFieldDataType.String),
        SimpleField(name="images_reference", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
        
        
        SearchableField(name="solution_conceptuelle", type=SearchFieldDataType.String),
        SearchableField(name="analyse_erreurs_str", type=SearchFieldDataType.String), 
        
       
        SearchField(
            name="vecteur", 
            type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
            searchable=True, 
            vector_search_dimensions=1536,
            vector_search_profile_name="my-vector-profile"
        )
    ]
    
    vector_search = VectorSearch(
        algorithms=[HnswAlgorithmConfiguration(name="my-hnsw-algo")],
        profiles=[VectorSearchProfile(name="my-vector-profile", algorithm_configuration_name="my-hnsw-algo")]
    )
    
   
    semantic_config = SemanticConfiguration(
        name="my-semantic-config",
        prioritized_fields=SemanticPrioritizedFields(
            title_field=SemanticField(field_name="nom_tache"),
            content_fields=[
                SemanticField(field_name="contenu_texte"),
                SemanticField(field_name="solution_conceptuelle"),
                SemanticField(field_name="analyse_erreurs_str")
            ],
            keywords_fields=[SemanticField(field_name="titre_lab")]
        )
    )
    semantic_search = SemanticSearch(configurations=[semantic_config])
    
    index = SearchIndex(
        name=index_name, 
        fields=fields, 
        vector_search=vector_search,
        semantic_search=semantic_search
    )
    
    try:
        index_client.create_or_update_index(index)
        print("✅ Index Sémantique prêt !")
    except Exception as e:
        print(f"⚠️ Erreur de création d'Index : {e}")
        exit()


def get_embedding_avec_retry(texte, retries=3):
    for tentative in range(retries):
        try:
            response = oai_client.embeddings.create(input=texte, model=embedding_model)
            return response.data[0].embedding
        except Exception as e:
            attente = 2 ** tentative
            print(f"   ⏳ Surcharge API. Nouvel essai dans {attente}s... ({e})")
            time.sleep(attente)
    raise RuntimeError(f"❌ Embedding impossible pour ce texte.")

def upload_en_batches(search_client, documents):
    for i in range(0, len(documents), BATCH_SIZE):
        batch = documents[i:i + BATCH_SIZE]
        try:
            search_client.upload_documents(documents=batch)
            print(f"   ☁️ Batch envoyé ({len(batch)} documents)")
        except Exception as e:
            print(f"   ❌ Erreur lors de l'envoi du batch : {e}")


def executer_indexation():
    # 1. On prépare Azure
    creer_index_semantique()
    search_client = SearchClient(endpoint=search_endpoint, index_name=index_name, credential=search_key)
    
    # 2. On lit nos données de niveau Or
    print(f"\n📂 Lecture du fichier IA : {FICHIER_SOURCE}")
    if not os.path.exists(FICHIER_SOURCE):
        print(f"❌ Fichier introuvable. As-tu bien lancé le script d'enrichissement ?")
        return
        
    with open(FICHIER_SOURCE, 'r', encoding='utf-8') as f:
        donnees_coach = json.load(f)

    # 3. Système de Checkpoint (Pour ne pas repayer les vecteurs déjà calculés)
    deja_traites = {}
    if os.path.exists(FICHIER_CHECKPOINT):
        with open(FICHIER_CHECKPOINT, 'r', encoding='utf-8') as f:
            deja_traites = json.load(f)
            print(f"🔄 Checkpoint trouvé : {len(deja_traites)} tâches déjà vectorisées.")

    documents_azure_search = []
    
    print(f"\n🧠 Traitement et Vectorisation de {len(donnees_coach)} tâches...")
    for index, doc in enumerate(donnees_coach):
        
        # Création d'un ID unique et stable basé sur le nom du fichier et de la tâche
        id_unique = hashlib.md5(f"{doc['fichier_source']}_{doc['nom_tache']}".encode('utf-8')).hexdigest()
        
        # Aplatissement des erreurs (Azure Semantic Search adore le texte brut bien structuré)
        erreurs_formatees = json.dumps(doc.get('analyse_erreurs', []), ensure_ascii=False, indent=2)
        
        # Si on a déjà calculé le vecteur pour cet ID, on le récupère (FinOps !)
        if id_unique in deja_traites:
            vecteur = deja_traites[id_unique]
        else:
            # Le texte que l'IA va mathématiser (On lui donne tout le contexte !)
            texte_pour_vecteur = f"Tâche: {doc['nom_tache']}\nInstructions: {doc['contenu_texte']}\nConcept: {doc.get('solution_conceptuelle', '')}\nErreurs possibles et indices: {erreurs_formatees}"
            
            try:
                vecteur = get_embedding_avec_retry(texte_pour_vecteur)
                deja_traites[id_unique] = vecteur # On sauvegarde en mémoire
            except RuntimeError as e:
                print(e)
                continue

        # Préparation du document final pour Azure AI Search
        doc_azure = {
            "id": id_unique,
            "fichier_source": doc['fichier_source'],
            "titre_lab": doc['titre_lab'],
            "module": doc['module'],
            "nom_tache": doc['nom_tache'],
            "contenu_texte": doc['contenu_texte'],
            "images_reference": doc.get('images_reference', []),
            "solution_conceptuelle": doc.get('solution_conceptuelle', ''),
            "analyse_erreurs_str": erreurs_formatees, # Magie : Les objets imbriqués deviennent du texte cherchable !
            "vecteur": vecteur
        }
        documents_azure_search.append(doc_azure)
        print(f"   ✅ Prêt: {doc['nom_tache'][:40]}...")

    # Sauvegarde du checkpoint FinOps
    with open(FICHIER_CHECKPOINT, 'w', encoding='utf-8') as f:
        json.dump(deja_traites, f)

    # 4. Envoi final massif
    print(f"\n🚀 Lancement de l'Upload vers Azure AI Search...")
    upload_en_batches(search_client, documents_azure_search)
    
    print("\n🎉 ÉTAPE TERMINÉE ! Ton Agent Tuteur a désormais une mémoire de classe mondiale !")

if __name__ == "__main__":
    executer_indexation()