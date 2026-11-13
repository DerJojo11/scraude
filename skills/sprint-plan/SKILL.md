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
   Dazu `board-store.js impact` — zeigt je Ticket, wie viele andere daran
   hängen, mit der Priorität daneben. Steht etwas weit oben in dieser Liste
   und trägt eine schwache Priorität, ist die Priorität falsch gesetzt und
   gehört korrigiert, bevor geplant wird (siehe Skill board-management).
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

7. **Mehrere Repos im Projekt?** Dann direkt im Anschluss die frischen
   Repo-Chats starten — ohne weitere Rückfrage, der Ablauf steht im Skill
   board-management, Abschnitt „Koordinator und Repo-Chats":
   - `board-store.js chats` — wie viele Slots sind frei
     (`config.maxParallelChats`), welche Tickets warten ohne Chat?
   - je Repo `board-store.js briefing <repo>` — Prompt und Modell stehen
     darin
   - `start_session` mit `context: "fresh"`, `cwd` aus `config.repos`, dem
     Briefing als Prompt und dem empfohlenen Modell
   - `board-store.js chat <session-id> <repo> '["T-101"]'`

   Tragen die Sprint-Tickets kein `repo`, gehört das vor dem Start
   nachgetragen (`update-ticket T-101 '{"repo":"app"}'`) — sonst
   verweigert das Briefing.

Ab hier gilt der Sprint-Lock (Kernprinzip 1): alles Neue geht ins Backlog.
