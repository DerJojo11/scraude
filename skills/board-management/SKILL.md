---
name: board-management
description: Hintergrundwissen für die Arbeit mit einem Scraude-Board — wie Nebenthemen zu Tickets werden, wie Scope im Blick behalten wird und wann der User eingebunden werden muss. Automatisch laden, sobald ein .claude/board.json im Repo existiert oder an einem Ticket gearbeitet wird.
user-invocable: false
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js *)
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-render.js *)
---

# board-management

Kein Command, sondern die "Wann mache ich was"-Ebene für die Arbeit mit
Scraude. Vollständiger Hintergrund: `scrum-board-plugin-plan.md`, besonders
Abschnitt 2 (Kernprinzipien) und Abschnitt 6.

## Kernregeln

1. **Passiv/aktiv-Entscheidung** (Kernprinzip 2): Taucht während eines
   laufenden Tickets ein Nebenthema auf —
   - überschneidet es sich fachlich mit dem laufenden Ticket (gleiche Datei,
     gleiche Komponente, blockiert die Aufgabe) → **aktiv**: sofort melden,
     Ticket mit `herkunft: "aktiv"` anlegen, ggf. direkt mitnehmen.
   - sonst → **passiv**: still ein Backlog-Ticket mit `herkunft: "passiv"`
     anlegen, den User nicht unterbrechen.

   Das Feld `herkunft` korrekt zu setzen ist nicht kosmetisch — die
   Mini-Retro in `/sprint-close` wertet genau das aus.

2. **Ticket-Beschreibungen**: kompakt, in Stichpunkten, eigenständig
   verständlich (kein "das von vorhin"). Genug Kontext zum Starten, nichts
   Überflüssiges.

3. **Kontext sparen** (Kernprinzip 6): Bei `/board` und Sprint-Übersichten
   nur Titel, Status und Priorität laden — volle Beschreibungen erst beim
   tatsächlichen Start eines Tickets.

4. **Sprint-Lock** (Kernprinzip 1): nie auf Zuruf Tickets in einen aktiven
   Sprint schieben. Stattdessen nachfragen: "Soll das ins Backlog, oder
   brichst du den Sprint-Lock bewusst?" Bewusster Bruch heißt in der Praxis:
   Ticket landet trotzdem im Backlog, aber mit `prioritaet: 1`, und steht
   damit bei der nächsten Planung ganz oben.

5. **Blocker prüfen**: vor jedem "nächstes Ticket"-Vorschlag `blockiert_von`
   gegenprüfen — dafür `board-store.js next-ticket` nutzen, das filtert
   bereits korrekt, statt selbst durchs Board zu sortieren.

5b. **`prioritaet` trägt Risiko und Wert — nicht Reihenfolge.** Die
   Reihenfolge steckt vollständig in `blockiert_von`; das Board weiß von
   selbst, dass ein blockiertes Ticket nicht vorher geht. Damit ist die Zahl
   frei für die einzige Information, die sonst nirgends steht: **wie wichtig
   ist das, unabhängig von Abhängigkeiten?**

   Der Fehler, gegen den diese Regel geschrieben ist: eine Ticket-Liste wird
   für die Lesbarkeit gruppiert (Fundament → Feature A → Spike → Feature B),
   und die Position in dieser Liste wird 1:1 das `prioritaet`-Feld. Risiko
   landet dann nur in der Prosa, wo das Board es nicht sieht — und
   `next-ticket` schlägt anschließend das Falsche vor.

   Zwei Prüffragen vor dem Setzen der Zahl:
   - Würde ich das früh wissen wollen, weil es viel umwerfen kann? → hohe
     Priorität, auch wenn es in der Erzählung spät kommt.
   - Ist es nur deshalb "später", weil ein Blocker davor liegt? → das
     gehört in `blockiert_von`, nicht in die Priorität.

5c. **Spike-Priorität ausrechnen, nicht erspüren** (Kernprinzip 6). Das
   Gewicht eines Spikes ist, **wie viele andere Tickets seine Antwort
   umschneidet**. Das ist mechanisch bestimmbar:

   `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" impact`

   gibt für jedes Ticket aus, wie viele daran hängen — direkt und über
   Ketten — mit der eingetragenen Priorität daneben. Ein Ticket weit oben in
   dieser Liste mit einer schwachen Priorität ist ein Fehler, kein
   Geschmack. Ein Spike, dessen Ergebnis fünf Tickets umschneidet, gehört vor
   jedes Ticket, das nur sich selbst betrifft.

   Mit einem JSON-Array als Argument rechnet derselbe Befehl über einen noch
   nicht angelegten Vorschlag — dann zählen die `ref`-Namen als IDs.

6. **Scope-Kontrolle** (Kernprinzip 8): während der Arbeit im Blick behalten,
   ob der Diff noch zur geschätzten `groesse` passt. Wächst er erkennbar
   darüber hinaus: aktiv melden und ein Folge-Ticket vorschlagen, nicht
   einfach weitermachen. Der Kontrollpfad (User prüft und merged) funktioniert
   nur bei überschaubaren PRs.

7. **Definition of Ready / Done** (Kernprinzip 10): vor `/ticket-start` bzw.
   vor `/ticket-review` prüfen, nicht überspringen. Den mechanischen Teil
   erledigt `board-store.js check-ready`.

8. **Review-Zusammenfassung statt rohem Diff** (Kernprinzip 8): vor jeder
   Review-Anfrage kurz zusammenfassen, was geändert wurde, warum, und worauf
   gezielt geachtet werden sollte.

9. **Formatregel** (Kernprinzip 11): Standup, Sprint-Vorschlag, Mini-Retro und
   Review-Zusammenfassung immer als kurze Bullet-Punkte, nie als
   Fließtext-Absatz. Reine Erklärungen ohne Handlungsbezug dürfen Fließtext
   sein.

10. **Nie selbst mergen** (Kernprinzip 4). Die Freigabe passiert über den
    PR/MR auf der Plattform. Nach dem Merge setzt der post-merge-Git-Hook das
    Ticket automatisch auf `done`.

## Werkzeuge

Mechanische Schritte laufen über diese Skripte, nicht über eigenes
Nachdenken oder Ad-hoc-`node -e`-Aufrufe (Kernprinzip 6):

- `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js"` — jede
  Zustandsänderung am Board hat dort einen benannten Befehl. Ohne Argument
  aufgerufen listet es alle verfügbaren Befehle auf.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-render.js"` — Markdown-Ansicht.

Priorität: **kleinere Zahl = höher**, Default 3.
