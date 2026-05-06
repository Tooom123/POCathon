<p align="center">
  <img src="client/public/previews/animals/animal-koala.png" alt="koala" width="160" />
</p>
<h1 align="center">Focus Island</h1>

> **Hackathon POC — Tom & Mehdi, 06/05/2026**

FocusIsland est un jeu de productivité multijoueur : chaque session de travail détectée sur votre machine se traduit en pièces, en animaux et en décorations sur votre île virtuelle. Rejoignez un lobby avec vos collègues ou amis, restez focus toute la journée, et comparez vos îles en fin de session. Le meilleur bosseur a la plus belle île.

L'idée n'est pas de passer du temps dans l'interface — c'est de travailler, de laisser le tracker faire son boulot en arrière-plan, et de revenir le soir pour voir qui a le mieux utilisé sa journée.

---

## Équipe

| Rôle | Personne |
|------|----------|
| Frontend (client + game server) | Tom Angles |
| Backend (API, pipeline, auth) | Mehdi Sellali |

---

## Architecture

Le projet est composé de trois briques indépendantes, chacune avec son propre README de lancement :

| Dossier | Rôle | README |
|---------|------|--------|
| `./client/` | Interface web (React + Three.js) | `./client/README.md` |
| `./server/` | Serveur de lobby multijoueur (Socket.IO) | `./server/README.md` |
| `./app-tracker-server/` | API REST + pipeline de sessions (FastAPI) | `./app-tracker-server/README.md` |
| `./app-tracker/` | Tracker desktop à installer sur chaque machine | `./app-tracker/README.md` |

---

## Comment ça marche

1. **Chaque utilisateur installe `app-tracker`** sur sa machine — c'est le daemon qui détecte les applications actives (VS Code, Terminal, Chrome…) et envoie les sessions productives à l'API.
2. **L'API (`app-tracker-server`)** reçoit les sessions, calcule les coins gagnés, et expose le profil de chaque utilisateur.
3. **Le client web** s'authentifie via un token de pairing (généré par l'API, lié au tracker desktop), affiche l'île, le shop, et la progression en temps réel via SSE.
4. **Le serveur de lobby (`server`)** synchronise les états entre joueurs connectés au même lobby (Socket.IO).

---

## Outils à installer

- **Node.js** >= 18 (client + server)
- **Python** >= 3.11 (app-tracker-server + app-tracker)
- **[uv](https://docs.astral.sh/uv/)** — gestionnaire de packages Python

```bash
# Installer uv
curl -Lf https://astral.sh/uv/install.sh | sh
```

---

## Lancement rapide (dev local)

```bash
# 1. API backend
cd app-tracker-server
uv sync
uv run uvicorn server.main:app --reload --port 8000

# 2. Serveur de lobby
cd server
npm install
npm start   # port 3001

# 3. Client web
cd client
npm install
npm run dev   # port 5173

# 4. Tracker desktop (une fois par machine utilisateur)
cd app-tracker
uv sync
uv run tracker link   # génère un token et le lie à votre compte
uv run tracker start  # lance le daemon de tracking
```

---

## Configuration `.env`

> En dev local, un seul utilisateur est possible car chaque brique pointe sur `localhost`.
> Pour jouer à plusieurs, toutes les machines doivent pointer vers un serveur partagé (VPS, ngrok, etc.).

Chaque brique expose ses variables d'environnement dans son propre README. Les variables clés à adapter :

| Brique | Variable | Valeur par défaut | À changer pour multi-user |
|--------|----------|-------------------|---------------------------|
| `client/` | `VITE_API_URL` | `http://localhost:8000` | URL publique de l'API |
| `client/` | `VITE_SOCKET_URL` | `http://localhost:3001` | URL publique du lobby |
| `app-tracker/` | `TRACKER_SERVER_URL` | `http://localhost:8000` | URL publique de l'API |

---

## Tracker desktop — obligatoire pour générer des coins

Chaque participant doit installer et lancer `app-tracker` sur sa propre machine :

```bash
cd app-tracker
uv sync

# Lier le tracker à votre compte (une seule fois)
# Ouvre le client web → affiche un code → entrez-le ici
uv run tracker link

# Lancer le tracking en arrière-plan
uv run tracker start
```

Sans le tracker, aucune session productive n'est remontée → aucun coin généré → île vide.

---

## Rejoindre un lobby

1. Ouvrez le client web et complétez le pairing avec votre tracker desktop.
2. Créez un lobby ou rejoignez-en un avec le code partagé par un ami.
3. Travaillez. Le tracker détecte vos apps en arrière-plan et alimente votre balance.
4. En fin de journée, revenez voir votre île — et celle des autres.

---

## Fonctionnalités du client

- 🌍 **Monde 3D** — îles flottantes en Three.js, caméra libre, zoom, rotation automatique en focus
- 🎨 **Biomes uniques** — 5 biomes par joueur (verdant, neige, désert, volcanique, sakura)
- 🐾 **24 animaux** — déblocables via pièces, animations fluides
- 🌿 **Décors** — plantes, arbres, champignons, fleurs avec revenus passifs
- 🔥 **Focus social** — voir en temps réel qui travaille dans le lobby
- 🗺️ **Minimap** — navigation rapide entre les îles
- 🎵 **Musique lofi** — fade in/out automatique au démarrage du focus
- 🌙 **Cycle jour/nuit** — basé sur le temps total de focus accumulé
- 🏆 **Leaderboard** — classement live par temps de focus
