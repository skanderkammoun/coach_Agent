# ☁️ Subul Cloud Coach

Un coach IA vocal et textuel en temps réel, conçu pour accompagner les étudiants dans leurs apprentissages et leurs certifications Cloud (ex: AZ-900). 

Propulsé par une architecture de streaming à très faible latence, ce projet offre une interaction fluide, naturelle et bilingue entre l'étudiant et l'IA.

---

## ✨ Fonctionnalités Principales

* 🗣️ **Mode Vocal Temps Réel (Zéro Latence)** : 
    * **Écoute (STT)** : Transcription instantanée via **Deepgram** (modèle `nova-3`) avec détection automatique de la langue.
    * **Parole (TTS)** : Synthèse vocale ultra-réaliste via **Cartesia** (modèle `sonic-3` en 44100Hz).
* ⚡ **Streaming Hybride Optimisé** : Le frontend React n'attend pas la fin de la réponse de l'IA. Les phrases sont envoyées au moteur vocal dès qu'une ponctuation est générée par le backend.
* 🧠 **Intelligence RAG** : L'agent s'appuie sur une base de connaissances pour fournir des explications précises (Azure, Cloud, Labs).
* 🌍 **Bilingue Dynamique** : L'IA détecte la langue de l'étudiant (FR/EN) et adapte sa réponse et sa voix instantanément.
* 📎 **Multimodalité** : Les étudiants peuvent envoyer des captures d'écran ou des images pour demander de l'aide sur un lab spécifique.

---

## 🏗️ Stack Technique

### Frontend (Client React)
* **Framework** : React (Interface conversationnelle)
* **Audio Temps Réel** : WebSockets natifs, `AudioContext` (44100Hz) pour la lecture brute (`pcm_f32le`), et `MediaRecorder`.
* **Rendu Markdown** : `react-markdown` avec support GFM.

### Backend (Serveur Python)
* **Framework** : FastAPI avec `asyncio` pour le streaming asynchrone (`application/x-ndjson`).
* **Agent IA** : RAG personnalisé (`AccompanyingAgent`).
* **Détection de langue** : `langdetect`.

---

## 🎙️ Identifiants Vocaux (Cartesia)

Le coach utilise deux voix spécifiques selon la langue détectée pour assurer une prononciation et un accent parfaits :

* 🇬🇧 **Voix Anglaise** : `6ccbfb76-1fc6-48f7-b71d-91ac6298247b`
* 🇫🇷 **Voix Française** : `65b25c5d-ff07-4687-a04c-da2f43ef6fa9`

*Note : Ces ID doivent correspondre à la fois dans le fichier frontend (`App.jsx`) pour le flux WebSockets et dans le fichier backend (`api_server.py`) pour la route de fallback.*

---

## ⚙️ Configuration (.env)

Créez les variables d'environnement nécessaires pour connecter les services externes.

**Côté Frontend (Vite/React) :**
```env
VITE_DEEPGRAM_API_KEY=votre_cle_deepgram
VITE_CARTESIA_API_KEY=votre_cle_cartesia
