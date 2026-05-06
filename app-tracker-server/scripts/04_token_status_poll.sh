#!/bin/bash
# Alternative au SSE : interroge l'état d'un token à un instant T.
# Utile pour déboguer ou pour un frontend qui préfère le polling au streaming.
# Réponse attendue :
#   - {status: "pending"}  si le PC n'a pas encore exécuté tracker link
#   - {status: "linked", user_id: "..."}  si le lien est établi
#   - HTTP 410  si le token a expiré
#
# Remplacer TOKEN par la valeur retournée par le script 02.

TOKEN="9Z8BUPZR"

curl -s http://localhost:8000/auth/token/$TOKEN/status | python3 -m json.tool
