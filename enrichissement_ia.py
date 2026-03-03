import os
import json
import time
from dotenv import load_dotenv
from openai import AzureOpenAI

# ==========================================
# 1. CONFIGURATION DE L'ENVIRONNEMENT
# ==========================================
# On va chercher tes clés dans le dossier 00_Config
load_dotenv(".env.txt")

AOAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AOAI_KEY = os.getenv("AZURE_OPENAI_API_KEY")

# 🚨 METS ICI LE NOM EXACT DE TON DÉPLOIEMENT SUR AZURE OPENAI
AZURE_OPENAI_DEPLOYMENT_NAME = "gpt-4o-mini" 

FICHIER_ENTREE = "base_vectorielle.json"
FICHIER_SORTIE = "base_vectorielle_enrichie.json"

# Initialisation du client Azure OpenAI
client = AzureOpenAI(
    azure_endpoint=AOAI_ENDPOINT,
    api_key=AOAI_KEY,
    api_version="2024-02-15-preview" # Version requise pour forcer la sortie en JSON
)

# ==========================================
# 2. LE CERVEAU DU COACH (Le Prompt)
# ==========================================
PROMPT_SYSTEME = """
Tu es un concepteur pédagogique expert Azure (Cloud Coach).
Je vais te donner les instructions d'un exercice pratique (Lab) Azure.
Ta mission est d'analyser cet exercice et de générer du contenu pédagogique pour aider un étudiant qui serait bloqué à cette étape précise.

Tu DOIS répondre UNIQUEMENT avec un objet JSON valide ayant cette structure stricte :
{
    "solution_conceptuelle": "Une explication courte de ce que l'étudiant est censé accomplir et pourquoi (le concept cloud derrière l'action).",
    "analyse_erreurs": [
        {
            "description_erreur": "Description détaillée d'une erreur classique 1 (ex: L'étudiant a oublié de sélectionner la bonne région ou n'a pas retiré le verrou).",
            "indices_progressifs": [
                "Indice 1 : Très vague, pousse l'étudiant à la réflexion (ex: As-tu bien vérifié les prérequis ?).",
                "Indice 2 : Plus précis, indique où regarder dans l'interface Azure.",
                "Indice 3 : Très précis, donne presque la solution sans donner la réponse exacte."
            ]
        },
        {
            "description_erreur": "Description détaillée d'une erreur classique 2.",
            "indices_progressifs": [
                "Indice 1",
                "Indice 2",
                "Indice 3"
            ]
        }
    ]
}
"""

def enrichir_tache_avec_ia(tache):
    """Envoie une tâche à gpt-4o-mini pour générer les indices et solutions."""
    # On prépare le texte qu'on envoie à l'IA pour qu'elle comprenne le contexte
    contenu = f"Titre du Lab: {tache.get('titre_lab', 'Inconnu')}\nTâche: {tache.get('nom_tache', 'Inconnu')}\nInstructions de la tâche:\n{tache.get('contenu_texte', '')}"
    
    try:
        response = client.chat.completions.create(
            model=AZURE_OPENAI_DEPLOYMENT_NAME,
            response_format={ "type": "json_object" }, # La magie opère ici : on force un JSON parfait
            messages=[
                {"role": "system", "content": PROMPT_SYSTEME},
                {"role": "user", "content": contenu}
            ],
            temperature=0.3 # Température basse pour avoir des réponses sérieuses et pédagogiques
        )
        
        # On lit la réponse de l'IA et on la transforme en dictionnaire Python
        donnees_coach = json.loads(response.choices[0].message.content)
        return donnees_coach
        
    except Exception as e:
        print(f"   ❌ Erreur avec GPT-4o-mini sur la tâche '{tache.get('nom_tache', 'Inconnu')}': {e}")
        # En cas de bug réseau ou autre, on renvoie une structure vide pour ne pas faire planter le script
        return {
            "solution_conceptuelle": "Erreur lors de la génération.",
            "erreurs_frequentes": [],
            "indices_correctifs": []
        }

# ==========================================
# 3. LE MOTEUR DE TRAITEMENT MASSIF
# ==========================================
def lancer_enrichissement():
    print(f"📂 Ouverture de la base brute : {FICHIER_ENTREE}")
    
    if not os.path.exists(FICHIER_ENTREE):
        print(f"❌ ERREUR : Le fichier {FICHIER_ENTREE} est introuvable. As-tu bien lancé le script précédent ?")
        return

    with open(FICHIER_ENTREE, 'r', encoding='utf-8') as f:
        base_donnees = json.load(f)

    print(f"🚀 Début de l'enrichissement IA pour {len(base_donnees)} tâches avec {AZURE_OPENAI_DEPLOYMENT_NAME}...\n")
    
    base_enrichie = []
    
    for index, tache in enumerate(base_donnees):
        print(f"🧠 Traitement {index + 1}/{len(base_donnees)} : {tache.get('nom_tache', 'Tâche sans nom')}")
        
        # 1. Appel à l'IA pour créer l'intelligence pédagogique
        intelligence_pedagogique = enrichir_tache_avec_ia(tache)
        
        # 2. Fusion de la tâche brute avec les données du coach (Fusion de dictionnaires Python)
        tache_complete = {**tache, **intelligence_pedagogique}
        base_enrichie.append(tache_complete)
        
        # 3. Petite pause d'une seconde pour éviter de déclencher la sécurité anti-spam (Rate Limit) d'Azure
        time.sleep(1) 

    # Sauvegarde finale
    print(f"\n💾 Sauvegarde de la base de données de niveau PRODUCTION dans : {FICHIER_SORTIE}")
    with open(FICHIER_SORTIE, 'w', encoding='utf-8') as f:
        json.dump(base_enrichie, f, indent=4, ensure_ascii=False)
        
    print("🎉 SUCCÈS TOTAL ! Ton jeu de données est maintenant intelligent et prêt à être vectorisé.")

# ==========================================
# 🟢 POINT D'ENTRÉE
# ==========================================
if __name__ == "__main__":
    lancer_enrichissement()