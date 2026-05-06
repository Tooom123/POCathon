#!/bin/bash
# Vérifie que le serveur est démarré et répond.
# Réponse attendue : {"status": "ok"}
# Utiliser en premier pour confirmer que uv run tracker-server tourne bien.

curl -s http://localhost:8000/health | python3 -m json.tool
