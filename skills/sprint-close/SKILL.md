---
name: sprint-close
description: Schließt den aktiven Sprint ab und liefert die Mini-Retro.
disable-model-invocation: true
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js *)
---

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" close-sprint`
   Sind noch Tickets offen, verweigert das Skript den Abschluss und listet
   sie auf. Dann **mit dem User klären**, wie verfahren wird — nicht
   eigenmächtig schließen. Erst nach ausdrücklicher Freigabe
   `close-sprint --force`: der Sprint wird geschlossen, offene Tickets gehen
   zurück ins Backlog.
2. Das Skript gibt die **Mini-Retro**-Zahlen direkt als JSON aus (aus
   board.json gerechnet, kein eigenes Nachzählen nötig, Kernprinzip 6).
   Diese **als Bullet-Liste** (Kernprinzip 11) wiedergeben:
   - Anzahl abgeschlossener Tickets
   - Aufteilung nach `herkunft` (manuell / aktiv / passiv entstanden)
   - Anzahl offener Backlog-Tickets
   - Alter des ältesten offenen Backlog-Tickets
   - **Repo-Chats**: wie viele gestartet wurden (`chats_gestartet`, auch je
     Repo) und wie viele gescheitert sind — davon wie viele am Limit
     (`chats_am_limit`). Viele Chats für wenige Tickets oder wiederholtes
     Scheitern am Limit heißt: die Bündel waren zu groß geschnitten.
3. **Repo-Chats des Sprints abschließen.** `close-sprint` listet die
   Kandidaten auf (fertige und gescheiterte Chats). Was mit ihnen passiert,
   sagt `config.chatAbschluss`: `archivieren` (Standard, `archive_session`)
   oder `loeschen` (`delete_session`, endgültig). Beides **erst nach
   Bestätigung des Users** — außer er hat sie für diesen Sprint pauschal
   erteilt oder `config.chatAbschlussSofort` gesetzt (dann sind fertige
   Chats meist schon archiviert, nur Archivieren); beim Löschen zusätzlich nur, wenn der PR gemergt ist und keine
   Frage aus der Meldung des Chats offen steht (siehe board-management).
   Danach je Chat `board-store.js chat <session-id> archiviert` bzw.
   `… geloescht`, damit der Sprint es festhält. Chats mit noch offenen PRs
   bleiben stehen, bis gemergt ist.
4. Kurze Einordnung ist hier erlaubt — z. B. wenn auffällig viele Tickets
   passiv entstanden sind oder das Backlog spürbar altert.
5. Hinweis auf den nächsten Schritt: `/sprint-plan`.

Nur Zahlen sehen, ohne zu schließen: `board-store.js retro`.
