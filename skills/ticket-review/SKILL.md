---
name: ticket-review
description: Bringt das laufende Ticket in den Review — Definition of Done prüfen, PR erstellen, Review-Zusammenfassung liefern.
argument-hint: "[T-<id>]"
disable-model-invocation: true
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js *)
  - Bash(git push:*)
  - Bash(git diff:*)
  - Bash(git status:*)
  - Bash(gh pr create:*)
  - Bash(glab mr create:*)
---

Ticket-ID aus $ARGUMENTS, sonst `aktuelles_ticket` aus dem Board.

**Definition of Done prüfen** (Kernprinzip 10) — vor allem anderen:
- Keine offenen TODO-Kommentare im Diff (`git diff main...HEAD` gegenprüfen)
- Diff passt zur geschätzten `groesse` (Kernprinzip 8). Ist er erkennbar
  größer: melden und ein Folge-Ticket vorschlagen, statt alles in einen PR
  zu packen.
- Bei `typ: "spike"` ersetzt "Erkenntnisse dokumentiert" das übliche
  Done-Kriterium — kein Code-Deliverable nötig.

**Review-Zusammenfassung** (Kernprinzip 8 + 11) — als Bullet-Punkte, nie als
Absatz, und *bevor* der User vor den Diff gesetzt wird:
- Was geändert wurde
- Warum
- Worauf gezielt geachtet werden sollte: unsichere Annahmen, Edge Cases,
  Stellen mit erhöhtem Fehlerrisiko

**PR erstellen** (Kernprinzip 4 — Review passiert auf der Plattform, nicht
im Chat):
1. `git push -u origin <branch>`
2. `gh pr create` bzw. `glab mr create` mit der Review-Zusammenfassung als
   PR-Body. Erst den User fragen, bevor der PR tatsächlich erstellt wird —
   ein PR ist nach außen sichtbar.
3. `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" review-ticket T-<id> "<pr-url>"`

Ist weder `gh` noch `glab` verfügbar: `review-ticket` ohne URL aufrufen,
`pr_url` bleibt `null`, Fallback ist der lokale Merge nach Chat-Freigabe.

Nicht selbst mergen. Sobald der PR gemerged und `main` gepullt ist, setzt der
post-merge-Hook das Ticket automatisch auf `done`.
