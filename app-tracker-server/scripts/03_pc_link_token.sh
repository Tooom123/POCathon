#!/bin/bash
# Simule le CLIENT PC qui valide le token affiché par le browser.
# L'utilisateur a copié le token depuis le frontend et l'exécute dans son terminal.
# Le serveur vérifie que le token est pending + non expiré, puis l'associe au user_id du PC.
# Une fois validé, le stream SSE du browser (script 05) reçoit l'événement "linked".
#
# Remplacer TOKEN par la valeur retournée par le script 02.
#
# Équivalent curl :
#   curl -s -X POST http://localhost:8000/auth/link \
#     -H "Content-Type: application/json" \
#     -d '{"user_id": "<user_id>", "token": "<TOKEN>"}'

TOKEN="A3F2B1C9"

cd "$(dirname "$0")/../../app-tracker" && \
  uv run tracker link "$TOKEN" --server http://localhost:8000
