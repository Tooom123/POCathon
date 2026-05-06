<p align="center">
  <img src="client/public/previews/animals/animal-monkey.png" alt="monkey" height="120" />
  <img src="client/public/previews/animals/animal-koala.png" alt="koala" height="120" />
  <img src="client/public/previews/animals/animal-fox.png" alt="fox" height="120" />
</p>
<h1 align="center">Focus Island</h1>

> **Hackathon POC — Tom Angles, 06/05/2026**

FocusIsland est un jeu de productivité multijoueur : restez concentré sur votre travail, gagnez des pièces, débloquez des animaux et décorez votre île virtuelle. Rejoignez un lobby avec vos collègues, travaillez, et comparez vos îles en fin de session.

L'idée n'est pas de passer du temps dans l'interface — c'est de travailler, de laisser l'app détecter votre focus automatiquement, et de revenir le soir pour voir qui a la plus belle île.

---

## Comment ça marche

1. Ouvrez le client web et entrez votre nom.
2. Créez un lobby ou rejoignez-en un avec le code d'un ami.
3. Travaillez. L'app détecte automatiquement si vous êtes en focus via l'onglet actif du navigateur.
4. Chaque seconde de focus génère des pièces — achetez des animaux et des décors dans le shop.
5. En fin de journée, visitez les îles de vos coéquipiers et comparez vos progressions.

---

## Lancement rapide

```bash
# Serveur de lobby
cd server
npm install
npm start   # port 3001

# Client web
cd client
npm install
npm run dev   # port 5173
```

---

## Fonctionnalités

- 🌍 **Monde 3D** — îles flottantes en Three.js, caméra libre, zoom, rotation automatique en focus
- 🎨 **Biomes uniques** — 5 biomes par joueur (verdant, neige, désert, volcanique, sakura)
- 🐾 **24 animaux** — déblocables via pièces, animations fluides
- 🌿 **Décors** — plantes, arbres, champignons, fleurs avec revenus passifs
- 🔥 **Focus social** — voir en temps réel qui travaille dans le lobby
- 🗺️ **Minimap** — navigation rapide entre les îles
- 🎵 **Musique lofi** — fade in/out automatique au démarrage du focus
- 🌙 **Cycle jour/nuit** — basé sur le temps total de focus accumulé
- 🏆 **Leaderboard** — classement live par temps de focus
