#!/bin/bash
# Simule l'appel que fait le BROWSER pour obtenir un token à afficher à l'utilisateur.
# Le serveur génère un token de 8 caractères (ex: "A3F2B1C9") avec un TTL de 10 minutes.
# Le frontend affiche ce token et ouvre le stream SSE (script 05) pour attendre la validation.
# Réponse attendue : {token, status: "pending", user_id: null, expires_at, instructions}

curl -s -X POST http://localhost:8000/auth/token | python3 -m json.tool
