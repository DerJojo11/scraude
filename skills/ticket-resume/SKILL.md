---
name: ticket-resume
description: Nimmt das zuletzt pausierte Ticket wieder auf.
disable-model-invocation: true
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js *)
  - Bash(git checkout:*)
---

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" resume-ticket`
   Nimmt das zuletzt pausierte Ticket (Kernprinzip 7), setzt Status auf
   `in_progress`, `aktuelles_ticket` und entfernt es aus `pausierte_tickets`.
   Läuft gerade ein anderes Ticket, wird das im selben Schritt pausiert.
   Gibt Ticket und Branch als JSON zurück.
2. `git checkout <branch>` mit dem Branch aus der Ausgabe.

Kurze Bestätigung als Bullet-Punkte (Kernprinzip 11): welches Ticket wieder
aufgenommen wurde, plus kurzer Kontext-Reminder aus `beschreibung`/`notizen`,
woran zuletzt gearbeitet wurde.

Meldet das Skript "Keine pausierten Tickets vorhanden": das dem User klar
mitteilen, kein Fehler.
