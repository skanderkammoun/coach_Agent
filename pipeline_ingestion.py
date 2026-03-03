import os
import glob
import frontmatter
import re
import json

# ==========================================
# ⚙️ CONFIGURATION DE L'ARCHITECTURE
# ==========================================
# Chemin dynamique basé sur ton arborescence locale
DOSSIER_LABS = os.path.join("data", "labs", "azure")

# L'URL de base de ton conteneur public (Couche Bronze)
BASE_IMAGE_URL = "https://mlworkspacesub3023581947.blob.core.windows.net/public-lab-images/"

# Fichier de sortie (pour vérifier le résultat avant envoi vers Azure AI Search)
FICHIER_SORTIE_JSON = "base_vectorielle.json"

def process_single_lab(file_path):
    """Lit un fichier MD, extrait le YAML, découpe les Tasks et génère les URL Azure."""
    with open(file_path, 'r', encoding='utf-8') as f:
        lab_data = frontmatter.load(f)
        
    metadata = lab_data.metadata
    content_text = lab_data.content
    
    # Sécurisation si le YAML est incomplet
    titre_lab = metadata.get('lab', {}).get('title', 'Titre_Inconnu')
    module_lab = metadata.get('lab', {}).get('module', 'Module_Inconnu')
    
    # Découpage logique par expression régulière
    chunks = re.split(r'(?=## Task \d+:)', content_text)
    
    documents_du_fichier = []
    
    for chunk in chunks:
        if "## Task" in chunk:
            lignes = chunk.split('\n')
            nom_tache = lignes[0].strip()
            
            # --- MAGIE MULTIMODALE : Remplacement dynamique des chemins ---
            # On cherche ![alt](./Media/nom_image.png)
            images_locales = re.findall(r'!\[.*?\]\(\./Media/(.*?)\)', chunk)
            
            urls_publiques = []
            for img_name in images_locales:
                urls_publiques.append(f"{BASE_IMAGE_URL}{img_name}")
                
            # Création de l'objet JSON (Le Chunk)
            doc = {
                "fichier_source": os.path.basename(file_path),
                "titre_lab": titre_lab,
                "module": module_lab,
                "nom_tache": nom_tache,
                "contenu_texte": chunk.strip(), 
                "images_reference": urls_publiques
            }
            documents_du_fichier.append(doc)
            
    return documents_du_fichier

def executer_pipeline_complet():
    """Fonction principale qui scanne le dossier et consolide les données."""
    print(f"🚀 DÉMARRAGE DU PIPELINE D'INGESTION...")
    print(f"📂 Recherche de fichiers dans : {DOSSIER_LABS}")
    
    # Recherche dynamique de TOUS les fichiers .md
    fichiers_md = glob.glob(os.path.join(DOSSIER_LABS, "*.md"))
    
    if not fichiers_md:
        print(f"❌ ERREUR : Aucun fichier .md trouvé dans {DOSSIER_LABS} !")
        return
        
    print(f"✅ {len(fichiers_md)} fichiers Markdown détectés. Traitement en cours...\n")
    
    base_de_donnees_globale = []
    
    for fichier in fichiers_md:
        print(f"   🔄 Traitement de -> {os.path.basename(fichier)}")
        docs = process_single_lab(fichier)
        base_de_donnees_globale.extend(docs)
        
    print(f"\n🎉 SUCCÈS ! {len(base_de_donnees_globale)} 'Tasks' ont été extraites au total.")
    
    # Sauvegarde du résultat dans un fichier JSON pour inspection
    with open(FICHIER_SORTIE_JSON, 'w', encoding='utf-8') as f:
        json.dump(base_de_donnees_globale, f, indent=4, ensure_ascii=False)
        
    print(f"💾 Les données structurées ont été sauvegardées dans le fichier : {FICHIER_SORTIE_JSON}")

# ==========================================
# 🟢 POINT D'ENTRÉE DU SCRIPT
# ==========================================
if __name__ == "__main__":
    executer_pipeline_complet()