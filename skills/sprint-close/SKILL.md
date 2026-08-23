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
3. Kurze Einordnung ist hier erlaubt — z. B. wenn auffällig viele Tickets
   passiv entstanden sind oder das Backlog spürbar altert.
4. Hinweis auf den nächsten Schritt: `/sprint-plan`.

Nur Zahlen sehen, ohne zu schließen: `board-store.js retro`.
