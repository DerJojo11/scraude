---
name: sprint-plan
description: Backlog Refinement und neuen Sprint aus dem Backlog fixieren.
disable-model-invocation: true
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js *)
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-render.js *)
---

1. Board lesen:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" get-board`
2. **Backlog Refinement** (kurz, kein eigener Command): offensichtliche
   Duplikate oder nicht mehr relevante Tickets erkennen und dem User zum
   Zusammenführen/Schließen vorschlagen, bevor priorisiert wird. Nichts
   eigenmächtig schließen.
3. Backlog leer? Dann das klar mitteilen — nichts zu planen, bis neue
   Anforderungen reinkommen (geklärter Punkt in Abschnitt 11 des Plans).
4. Sprint-Vorschlag zusammenstellen: nach `prioritaet` sortiert (kleinere
   Zahl = höher). Ein blockiertes Ticket darf mit in den Sprint, solange
   sein Blocker ebenfalls drin ist — Abhängigkeitsketten gehören zusammen
   geplant. Blocker werden erst beim *Starten* geprüft (`next-ticket`
   überspringt sie), nicht bei der Planung. Das
   älteste offene Backlog-Ticket explizit hervorheben, damit passiv
   entstandene Tickets nicht endlos liegen bleiben — reiner Hinweis, keine
   automatische Priorisierung.
5. Vorschlag **als Bullet-Liste** (Kernprinzip 11) präsentieren. Der User
   muss bestätigen — kein automatisches Fixieren.
6. Nach Bestätigung:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" plan-sprint '["T-001","T-002"]'`
   Das legt den Sprint an, setzt alle gewählten Tickets auf `sprint` samt
   `sprint_id` und aktualisiert `aktueller_sprint` in einem Schritt. Läuft
   noch ein Sprint, verweigert das Skript — dann erst `/sprint-close`.

Ab hier gilt der Sprint-Lock (Kernprinzip 1): alles Neue geht ins Backlog.
