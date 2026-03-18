import os
import json
import time
import hashlib
import PyPDF2  
from dotenv import load_dotenv
from openai import AzureOpenAI
from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient


env_path = ".env.txt"
if os.path.exists(env_path):
    print(f"⚙️ Chargement de la configuration depuis : {env_path}")
    
    load_dotenv(dotenv_path=env_path, override=True)
else:
    print(f" Erreur : Fichier config introuvable à {env_path}")
    exit(1)

print("🔌 Connexion aux services Azure...")


oai_client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", "").strip(),
    api_key=os.getenv("AZURE_OPENAI_API_KEY", "").strip(),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview").strip()
)
embedding_model = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "").strip()


search_endpoint = os.getenv("AZURE_SEARCH_ENDPOINT", "").strip()
search_key = AzureKeyCredential(os.getenv("AZURE_SEARCH_API_KEY", "").strip())
index_name = os.getenv("AZURE_SEARCH_INDEX_NAME", "").strip()


FICHIER_JSON = "labs_certifications (1).json"
FICHIER_PDF = "guide_labs_certifications.pdf"
BATCH_SIZE = 50

# ==========================================
# 2. PARSEUR JSON (Le Mapping Magique)
# ==========================================
def parser_json_labs(filepath):
    print(f"📂 Lecture du JSON : {filepath}")
    documents = []
    
    if not os.path.exists(filepath):
        print(f"⚠️ JSON introuvable : {filepath}")
        return documents
        
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    for certif in data.get('labs', []):
        provider = certif.get('provider', 'Cloud')
        certif_title = certif.get('certif_title', 'Certif')
        
        for lab in certif.get('labs', []):
            # 1. On aplatit les étapes en un beau texte
            etapes_str = "\n".join([f"Étape {s.get('step', '')}: {s.get('title', '')} - {s.get('action', '')}" for s in lab.get('steps', [])])
            
            # 2. On rassemble les commandes CLI
            cmds = lab.get('azure_cli_commands', []) + lab.get('aws_cli_commands', []) + lab.get('gcloud_commands', [])
            cmds_str = "\n".join(cmds) if cmds else "Aucune commande CLI."
            
            # 3. Le Mapping strict vers ton schéma existant !
            doc = {
                "fichier_source": os.path.basename(filepath),
                "titre_lab": certif_title,
                "module": provider,
                "nom_tache": lab.get('title', 'Lab Inconnu'),
                # On met toute la pédagogie dans contenu_texte
                "contenu_texte": f"Objectifs: {', '.join(lab.get('objectives', []))}\nPrérequis: {', '.join(lab.get('prerequisites', []))}\n\nÉtapes détaillées:\n{etapes_str}",
                "images_reference": [],
                # Le résultat attendu va dans solution_conceptuelle
                "solution_conceptuelle": lab.get('expected_result', ''),
                # Les astuces Coach vont dans analyse_erreurs (Très important pour ton Agent Coach !)
                "analyse_erreurs_str": f"NETTOYAGE OBLIGATOIRE: {lab.get('cleanup', '')}\nCONSEILS COACH: {lab.get('tips', '')}\nCOMMANDES UTILES:\n{cmds_str}"
            }
            documents.append(doc)
            
    print(f"✅ {len(documents)} labs extraits du JSON.")
    return documents

# ==========================================
# 3. PARSEUR PDF (Découpage par page)
# ==========================================
def parser_pdf_guide(filepath):
    print(f"📄 Lecture du PDF : {filepath}")
    documents = []
    
    if not os.path.exists(filepath):
        print(f"⚠️ PDF introuvable : {filepath}")
        return documents

    with open(filepath, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        for i, page in enumerate(reader.pages):
            texte_page = page.extract_text()
            if not texte_page or not texte_page.strip():
                continue
                
            # Mapping pour le PDF
            doc = {
                "fichier_source": os.path.basename(filepath),
                "titre_lab": "Guide Complet des Labs",
                "module": "Documentation PDF",
                "nom_tache": f"Page {i+1} - Concept ou Sommaire",
                "contenu_texte": texte_page.strip(),
                "images_reference": [],
                "solution_conceptuelle": "Voir le texte pour les concepts théoriques.",
                "analyse_erreurs_str": "Document de référence (Guide PDF)."
            }
            documents.append(doc)
            
    print(f"✅ {len(documents)} pages extraites du PDF.")
    return documents

# ==========================================
# 4. MOTEUR DE VECTORISATION & UPLOAD
# ==========================================
def get_embedding_avec_retry(texte, retries=3):
    for tentative in range(retries):
        try:
            response = oai_client.embeddings.create(input=texte, model=embedding_model)
            return response.data[0].embedding
        except Exception as e:
            attente = 2 ** tentative
            print(f"   ⏳ Surcharge API (Rate Limit). Essai dans {attente}s... ({e})")
            time.sleep(attente)
    raise RuntimeError(f"❌ Embedding impossible après plusieurs tentatives.")

def executer_ingestion():
    # 1. Parsing des deux formats
    docs_json = parser_json_labs(FICHIER_JSON)
    docs_pdf = parser_pdf_guide(FICHIER_PDF)
    tous_les_docs = docs_json + docs_pdf
    
    if not tous_les_docs:
        print("❌ Aucun document à traiter. Vérifie le nom de tes fichiers.")
        return

    # Connexion à l'Index Azure Search
    search_client = SearchClient(endpoint=search_endpoint, index_name=index_name, credential=search_key)
    documents_azure = []

    # 2. Vectorisation (Calcul des embeddings)
    print(f"\n🧠 Vectorisation de {len(tous_les_docs)} documents en cours avec '{embedding_model}'...")
    for doc in tous_les_docs:
        # Création d'un ID unique sécurisé
        id_unique = hashlib.md5(f"{doc['fichier_source']}_{doc['nom_tache']}".encode('utf-8')).hexdigest()
        
        # Concaténation des champs pour créer le "Vecteur Sémantique" global
        texte_pour_vecteur = f"Titre: {doc['titre_lab']}\nTâche: {doc['nom_tache']}\nInstructions: {doc['contenu_texte']}\nAstuces: {doc['analyse_erreurs_str']}"
        
        try:
            vecteur = get_embedding_avec_retry(texte_pour_vecteur)
            # On ajoute l'ID et le vecteur au dictionnaire
            doc['id'] = id_unique
            doc['vecteur'] = vecteur
            documents_azure.append(doc)
            print(f"   ✅ Vecteur généré : {doc['nom_tache'][:40]}...")
        except Exception as e:
            print(f"   ❌ Erreur sur {doc['nom_tache'][:30]} : {e}")
            
    # 3. Upload vers Azure Search par lots (Batch)
    print(f"\n🚀 Upload de {len(documents_azure)} documents vers Azure AI Search (Index: {index_name})...")
    for i in range(0, len(documents_azure), BATCH_SIZE):
        batch = documents_azure[i:i + BATCH_SIZE]
        try:
            search_client.upload_documents(documents=batch)
            print(f"   ☁️ Batch uploadé avec succès ({len(batch)} documents)")
        except Exception as e:
            print(f"   ❌ Erreur d'upload sur un batch : {e}")

    print("\n🎉 INGESTION MULTIFORMAT TERMINÉE ! Les nouveaux labs sont dans le cerveau de l'Agent !")

if __name__ == "__main__":
    executer_ingestion()