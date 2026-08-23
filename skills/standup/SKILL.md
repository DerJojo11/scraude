---
name: standup
description: Lagemeldung zu Sessionbeginn — was läuft, was pausiert, was blockiert.
disable-model-invocation: true
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js *)
---

`node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" get-board` lesen und
**als Bullet-Liste** (Kernprinzip 11) zusammenfassen:

- Aktuelles Ticket (`aktuelles_ticket`, falls gesetzt): Titel, Status, Branch
- Pausierte Tickets (`pausierte_tickets`, falls vorhanden): wie viele, welche
- Was im aktiven Sprint bereits `done` ist
- Was als Nächstes ansteht: `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" next-ticket`
- Ältestes offenes Backlog-Ticket, falls älter als 7 Tage
- Blocker: Sprint-Tickets, deren `blockiert_von` noch nicht `done` ist

Kein Fließtext-Vorspann — direkt mit der Liste starten (Kernprinzip 11).
