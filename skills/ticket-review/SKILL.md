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
  - Bash(git add:*)
  - Bash(git commit:*)
---

Ticket-ID aus $ARGUMENTS, sonst `aktuelles_ticket` aus dem Board.

## 1. Vor-Review durch den ticket-reviewer — immer, ohne Rückfrage

Alle Änderungen committen, dann den Agenten `scraude:ticket-reviewer`
beauftragen. Ihm übergeben: Ticket-ID, Titel, `beschreibung`, `typ`,
`groesse`, `komplexitaet`, Branch. Den Diff holt er sich selbst.

Mit welchem Modell er läuft, sagt dir das Board:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" model-for T-<id>` —
diesen Wert als `model` beim Beauftragen übergeben. Ein mechanisches Ticket
braucht keinen teuren Reviewer, ein kniffliges schon. Kommt keine
Empfehlung zurück (`komplexitaet` nicht gesetzt), ohne Override beauftragen
und die fehlende Bewertung im Ticket nachtragen.

Warum ein eigener Agent und nicht du selbst: du hast den Code geschrieben und
teilst dessen blinde Flecken. Der Agent hat den Verlauf nicht gesehen — genau
das ist sein Wert. Ihn zu überspringen, weil "der Diff ist klein", hebt den
Nutzen auf.

Er behebt mechanisch Eindeutiges selbst in einem eigenen Commit und meldet
alles, was eine Abwägung braucht. Sein Bericht ist **Material für den User**,
kein Urteil: seine Befunde ersetzen den Review nicht, sie lenken ihn.

Was du mit seinem Bericht machst:
- **Behoben**: unverändert in die Zusammenfassung übernehmen, damit der User
  weiß, welcher Commit nicht von der eigentlichen Arbeit stammt.
- **Nicht abgedeckt**: das ist ein Stopp-Signal. Fehlt etwas aus der
  Beschreibung, wird das erst erledigt, bevor der PR entsteht — oder
  bewusst mit dem User als Folge-Ticket abgetrennt.
- **Prüfen**: fließt in die "worauf besonders achten"-Sektion ein.
- **Scope / Größe**: mit dem User besprechen und ggf. Folge-Ticket anlegen.
  Nie stillschweigend übergehen (Kernprinzip 8).

Widersprichst du einem seiner Befunde, gilt das nicht automatisch — du hast
den Kontext, aber auch das Motiv. Im Zweifel gehört der Punkt in die
Zusammenfassung, statt dass ihr das unter euch ausmacht.

## 2. Definition of Done prüfen (Kernprinzip 10)

- Keine offenen TODO-Kommentare mehr im Diff
- Diff passt zur geschätzten `groesse` (Kernprinzip 8). Ist er erkennbar
  größer: melden und ein Folge-Ticket vorschlagen, statt alles in einen PR
  zu packen.
- Bei `typ: "spike"` ersetzt "Erkenntnisse dokumentiert" das übliche
  Done-Kriterium — kein Code-Deliverable nötig.

## 3. Review-Zusammenfassung (Kernprinzip 8 + 11) — als Bullet-Punkte, nie als
Absatz, und *bevor* der User vor den Diff gesetzt wird:
- Was geändert wurde
- Warum
- Worauf gezielt geachtet werden sollte: unsichere Annahmen, Edge Cases,
  Stellen mit erhöhtem Fehlerrisiko

## 4. PR erstellen (Kernprinzip 4)

Review passiert auf der Plattform, nicht im Chat:
1. `git push -u origin <branch>`
2. `gh pr create` bzw. `glab mr create` mit der Review-Zusammenfassung als
   PR-Body. Erst den User fragen, bevor der PR tatsächlich erstellt wird —
   ein PR ist nach außen sichtbar.
3. `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" review-ticket T-<id> "<pr-url>"`

Ist weder `gh` noch `glab` verfügbar: `review-ticket` ohne URL aufrufen,
`pr_url` bleibt `null`, Fallback ist der lokale Merge nach Chat-Freigabe.

Nicht selbst mergen. Sobald der PR gemerged und `main` gepullt ist, setzt der
post-merge-Hook das Ticket automatisch auf `done`.
