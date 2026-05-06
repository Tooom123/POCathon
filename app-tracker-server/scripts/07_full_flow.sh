#!/bin/bash
# Simule le flow complet de bout en bout dans un seul script :
#
#   1. Browser  → POST /auth/token          (obtenir un token à afficher)
#   2. PC       → POST /auth/link           (valider le token avec le user_id du PC)
#   3. Browser  → GET  /auth/token/.../status  (vérifier que le token est linked)
#   4. PC       → POST /webhook/report      (envoyer un rapport de sessions)
#
# Le SSE (script 05) n'est pas simulé ici car curl bloque — utiliser le script 05
# dans un terminal séparé si besoin.

set -e

SERVER="http://localhost:8000"
USER_ID="12345678-1234-5678-1234-567812345678"

echo "=== 1. Browser demande un token ==="
TOKEN_RESP=$(curl -s -X POST $SERVER/auth/token)
echo $TOKEN_RESP | python3 -m json.tool
TOKEN=$(echo $TOKEN_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "→ Token obtenu : $TOKEN"

echo ""
echo "=== 2. PC valide le token ==="
# curl équivalent :
#   curl -s -X POST $SERVER/auth/link \
#     -H "Content-Type: application/json" \
#     -d "{\"user_id\": \"$USER_ID\", \"token\": \"$TOKEN\"}"
APP_TRACKER_SERVER=$SERVER \
  (cd "$(dirname "$0")/../../app-tracker" && uv run tracker link "$TOKEN")

echo ""
echo "=== 3. Browser vérifie le statut du token ==="
curl -s $SERVER/auth/token/$TOKEN/status | python3 -m json.tool

echo ""
echo "=== 4. PC envoie un rapport de sessions ==="
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
FIVE_MIN_AGO=$(date -u -v-5M +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || date -u -d "5 minutes ago" +"%Y-%m-%dT%H:%M:%S")

curl -s -X POST $SERVER/webhook/report \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"sessions\": [
      {
        \"app\": \"cursor\",
        \"category\": \"productive\",
        \"started_at\": \"$FIVE_MIN_AGO\",
        \"ended_at\": \"$NOW\",
        \"duration\": 300
      }
    ]
  }" | python3 -m json.tool

echo ""
echo "=== Flow complet terminé ==="
