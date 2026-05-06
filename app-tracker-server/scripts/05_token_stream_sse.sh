#!/bin/bash
# Simule le BROWSER qui écoute le stream SSE en attendant que l'utilisateur valide depuis son PC.
# Le serveur envoie un événement par seconde avec l'état courant du token.
# Dès que le PC appelle POST /auth/link (script 03), le stream émet status: "linked" et se ferme.
# Le frontend utilise ce signal pour débloquer l'interface et stocker le token comme Bearer.
#
# Lancer ce script AVANT le script 03 pour voir la transition pending → linked en temps réel.
# Interrompre avec Ctrl-C si le token expire ou si le test est terminé.
#
# Remplacer TOKEN par la valeur retournée par le script 02.

TOKEN="9Z8BUPZR"

curl -s -N \
  -H "Accept: text/event-stream" \
  http://localhost:8000/auth/token/$TOKEN/stream
