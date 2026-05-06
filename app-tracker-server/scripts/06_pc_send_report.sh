#!/bin/bash
# Simule l'envoi d'un rapport de sessions par le CLIENT PC toutes les 5 minutes.
# Chaque session représente une période d'utilisation d'une application.
# Le serveur valide chaque session (recency 15 min, pas de chevauchement, pas de doublon)
# et répond avec le détail des sessions acceptées et rejetées.
#
# Ce script envoie un batch de 3 sessions dont une volontairement trop ancienne
# pour illustrer le rejet partiel.
#
# Réponse attendue : {accepted: 2, rejected: [{..., reason: "too old: ..."}]}
#
# Remplacer USER_ID par l'UUID réel du PC (cat ~/.local/share/app-tracker/identity.json).
# Les timestamps started_at / ended_at doivent être dans les 15 dernières minutes.

USER_ID="ee9d0508-d3f6-48d6-aeaa-d2ff0d5fd161"

# Calcule des timestamps récents (dans la fenêtre de 15 min)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
FIVE_MIN_AGO=$(date -u -v-5M +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || date -u -d "5 minutes ago" +"%Y-%m-%dT%H:%M:%S")
TEN_MIN_AGO=$(date -u -v-10M +"%Y-%m-%dT%H:%M:%S" 2>/dev/null || date -u -d "10 minutes ago" +"%Y-%m-%dT%H:%M:%S")

curl -s -X POST http://localhost:8000/webhook/report \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"sessions\": [
      {
        \"app\": \"cursor\",
        \"category\": \"productive\",
        \"started_at\": \"$TEN_MIN_AGO\",
        \"ended_at\": \"$FIVE_MIN_AGO\",
        \"duration\": 300
      },
      {
        \"app\": \"iTerm2\",
        \"category\": \"productive\",
        \"started_at\": \"$FIVE_MIN_AGO\",
        \"ended_at\": \"$NOW\",
        \"duration\": 300
      },
      {
        \"app\": \"YouTube\",
        \"category\": \"distraction\",
        \"started_at\": \"2024-01-01T08:00:00\",
        \"ended_at\": \"2024-01-01T08:05:00\",
        \"duration\": 300
      }
    ]
  }" | python3 -m json.tool
