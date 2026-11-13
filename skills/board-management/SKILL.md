---
name: board-management
description: Der Scraude-Ablauf — wie Nebenthemen zu Tickets werden, was ohne Rückfrage läuft und was eine Bestätigung braucht, wie Scope im Blick bleibt. IMMER laden, sobald ein .claude/board.json im Repo existiert, eine [Scraude]-Zeile im Kontext auftaucht oder an einem Ticket gearbeitet wird. Scraude ist ein Modus: existiert das Board, gilt der Ablauf, ohne dass der User Commands tippt.
user-invocable: false
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js *)
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-render.js *)
---

# board-management

Kein Command, sondern die "Wann mache ich was"-Ebene für die Arbeit mit
Scraude. Vollständiger Hintergrund: `scrum-board-plugin-plan.md`, besonders
Abschnitt 2 (Kernprinzipien) und Abschnitt 6.

## Scraude ist ein Modus, kein Befehlssatz

Existiert `.claude/board.json`, **gilt dieser Ablauf**, ohne dass der User
Commands tippt. Die Slash-Commands sind Einstiegspunkte und Ansichten, keine
Voraussetzung: `/board` und `/standup` schaut man an, wenn man etwas sehen
will. Der Rest passiert von selbst.

Der Board-Zustand kommt bei Sessionbeginn und danach laufend über einen Hook
in den Kontext (`[Scraude] …`). Diese Zeilen sind Tatsachen über das Board,
keine Aufforderung an den User — nicht zurückfragen, ob der Ablauf gelten
soll, sondern ihn anwenden.

### Läuft ohne Rückfrage

Alles Mechanische und alles lokal Umkehrbare:

- **Ticket beginnen**: liegt ein startbares Ticket im Sprint und läuft keines,
  `start-ticket` aufrufen und den Branch anlegen. Ein Branch ist lokal und
  jederzeit wieder weg — dafür braucht es keine Erlaubnis.
- **Modellwahl nach A/K** (Kernprinzip 6): siehe unten.
- **Nach dem Merge weitermachen**: der post-merge-Hook setzt das Ticket auf
  `done`. Dann mit dem nächsten weitermachen, statt zu fragen, ob man darf.
- **Nebenthemen erfassen**: passiv/aktiv nach Kernprinzip 2, laufend.
- **Repo-Chats für den Sprint starten**: nach `plan-sprint` ohne weitere
  Commands, mit Briefing und passendem Modell, höchstens
  `config.maxParallelChats` gleichzeitig (siehe unten). Ein Chat ist
  jederzeit beendbar — anders als ein PR wirkt er nicht nach außen.
- **Statusübergänge und Board-Schreibvorgänge** über die Skripte.
- **Vor-Review** durch `ticket-reviewer` bei jedem Ticket, samt dessen
  eigenen Korrektur-Commit.
- **Definition of Ready / Done** prüfen.

### Braucht weiterhin eine Bestätigung

Was nach außen wirkt oder schwer zurückzuholen ist:

- **Der Zuschnitt beim Intake** — einmal, und das ist die Bestätigung, auf
  die es ankommt. Danach steht die Planung.
- **PR/MR erstellen**: nach außen sichtbar.
- **Merge**: nie selbst, nie anstoßen (Kernprinzip 4). Der Kontrollpfad ist
  unberührt — genau deshalb darf alles davor automatisch laufen.
- **Sprint schließen**, besonders mit offenen Tickets.
- **Scope aufteilen**: ein Folge-Ticket abspalten ändert die Planung, das ist
  eine Entscheidung des Users.
- **Sprint-Lock brechen**: nie eigenmächtig.
- **Repo-Chats archivieren**: ein archivierter Chat ist für den User weg.
  Außer er hat das Archivieren für den Sprint pauschal freigegeben.

Die Grenze verläuft nicht bei "wichtig", sondern bei **Umkehrbarkeit und
Außenwirkung**. Ein Branch ist beides nicht — ein PR ist beides.

## Wer setzt das Ticket um — Modellwahl nach A/K

Nach `start-ticket`, vor der ersten Zeile Code:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" model-for T-<id>`

**`sehr_niedrig` oder `niedrig`** → an `scraude:ticket-implementer`
delegieren, mit dem empfohlenen `model`. Das sind mechanische, klar
spezifizierte Tickets — gerade die, bei denen Rücksprache nichts beiträgt.
Sie mit dem größten Modell zu bearbeiten macht das Ergebnis nicht besser.

**`mittel`** → im Hauptthread arbeiten, ohne Aufheben.

**`hoch` oder `sehr_hoch`** → im Hauptthread bleiben. Hier ist der Dialog mit
dem User der Punkt, den ein Subagent nicht leisten kann. Stattdessen einmal
kurz erwähnen, dass ein Wechsel auf die empfohlene Stufe angebracht wäre
(`/model`) — einmal, nicht bei jedem Schritt, und dann normal weiterarbeiten.
Die Entscheidung liegt beim User.

**Keine Bewertung gesetzt** → nicht raten und nicht delegieren. Im
Hauptthread arbeiten und die Bewertung im Ticket nachtragen.

### Wenn der Implementer abbricht

Er ist angewiesen, aufzuhören und zu melden, sobald sich das Ticket als
schwerer erweist als bewertet. Das ist keine Panne, sondern eine
Falschbewertung, die früh auffällt — genau der Zweck. Dann:

1. `komplexitaet` im Ticket auf seine Einschätzung korrigieren
   (`update-ticket`), damit derselbe Fehler nicht wiederkehrt.
2. Im Hauptthread weiterarbeiten, auf seinem Stand aufsetzend. Nichts
   zurückrollen — was er gebaut hat, ist committet und brauchbar.
3. Beim User erwähnen, dass die Bewertung nicht gestimmt hat.

Nie: den Implementer mit einem größeren Modell erneut beauftragen. War ein
Ticket zu schwer für die Delegation, ist es zu schwer für die Delegation.

## Koordinator und Repo-Chats

Gilt in Projekten mit mehreren Repos (App, Backend, Web): ein
**Koordinator-Chat** hält das Board, verteilt die Arbeit und prüft die PRs.
Die Umsetzung passiert in **Repo-Chats** — je ein eigener Chat pro Repo.

Der Grund für diesen Abschnitt ist eine Rechnung, nicht Geschmack:
Repo-Chats, die über viele Sprints weiterlaufen, kamen auf 1.900 bis 2.700
Nachrichten. Jede neue Runde liest diesen Verlauf mit — das war der größte
Kostenblock, und mehrere Chats sind mitten im Sprint am 5-Stunden-Limit
gescheitert. Ein frischer Chat mit kurzem Briefing hat dieselbe Arbeit
sauber und deutlich günstiger erledigt. Der alte Verlauf war also nicht
Kontext, sondern Ballast.

1. **Frische Chats pro Sprint.** Nach `plan-sprint` startet der Koordinator
   für jedes Repo mit Tickets im Sprint einen **neuen** Chat:
   `start_session`, `context: "fresh"`, `cwd` ist der Repo-Ordner aus
   `config.repos`. Keinen Chat aus dem Vorsprint weiterverwenden. Die Chats
   des Vorsprints werden archiviert, sobald ihre PRs gemergt sind.

2. **Briefing aus dem Board, nicht aus dem Verlauf.** Das Briefing liefert
   das Skript:

   `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" briefing <repo>`

   (oder mit Ticket-IDs statt Repo-Name, wenn nur ein Teil hineingehört).
   Es enthält Repo, Base-Branch, Merge-Stil, die Tickets mit Beschreibung,
   vereinbarte Schnittstellen, die Projektregeln, das Meldeformat und die
   Grenzen — und den Befehl, mit dem der Chat den **Board-Stand selbst
   liest**, statt ihn im Briefing doppelt zu führen. Den Text unverändert
   als Prompt übergeben, nichts aus dem eigenen Verlauf dazuschreiben.

   Zwei Felder kann das Skript nicht wissen und muss einmal pro Projekt
   bekommen, sonst steht im Briefing ein Platzhalter:
   `config.projektregeln` (Commit-Footer, gh-Konto, verbotene Git-Befehle,
   Prod-Sperre — aus CLAUDE.md und Memory) und `config.koordinator_chat`
   (die eigene Session-ID, an die gemeldet wird). Beides per `config`.

3. **Modell nach A/K.** Welches Modell der neue Chat bekommt, steht im
   Kopf des Briefings (`model:`) — gerechnet über das **schwerste** Ticket
   im Bündel. `sehr_niedrig`, `niedrig` und `mittel` in Größe XS/S laufen mit
   Sonnet, alles darüber mit dem Modell des Koordinators (`inherit`). Fehlt
   eine Bewertung, gibt es `inherit`: raten wäre teurer als das größere
   Modell. Haiku steht bewusst nicht in der Tabelle — es kommt nur für rein
   mechanische Arbeit in Frage und wird dann bewusst in
   `config.chat_modelle` gesetzt.

4. **Parallelität begrenzen.** Höchstens `config.maxParallelChats` Chats
   gleichzeitig (Standard 2). **Vor** jedem Start prüfen:

   `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" chats`

   zeigt, wer woran arbeitet, wie viele Slots frei sind und welche Tickets
   noch ohne lebenden Chat warten. Keine freien Slots → warten, bis ein
   Chat fertig ist. `blockiert_von` bleibt dabei maßgeblich: ein blockiertes
   Ticket geht in keinen Chat, auch wenn ein Slot frei ist.

   Jeden gestarteten Chat sofort eintragen:
   `chat <session-id> <repo> '["T-101","T-102"]'`. Erst damit weiß
   der Koordinator, welcher Chat woran sitzt — und welchen er nach dem Merge
   archivieren kann.

5. **Ein Chat pro Ticket-Kette, wenn der Verlauf wächst.** Überschreitet ein
   Repo-Chat `config.chatMessageLimit` (Standard 400 Nachrichten), schließt
   er sein laufendes Ticket ab und beginnt kein neues — das steht in seinem
   Briefing. Für das nächste Ticket startet der Koordinator einen frischen
   Chat. Ein Chat pro Sprint ist die Regel, kein Dogma: lieber ein Chat
   mehr als ein Verlauf, der die nächste Runde teuer macht.

6. **Prüftiefe nach Ticket-Art.** Die Kette wird nach Art zugeschnitten,
   nicht pauschal abgespult:
   - Mutationsproben (oder was das Projekt an entsprechender Prüfung
     vorsieht) nur bei **Logik**-Tickets — nicht bei reiner Optik, Texten
     oder Versionssprüngen.
   - Bei **Optik**-Tickets genügt ein Nachher-Bild. Vorher/nachher braucht
     es nur, wenn vor dem Bau eine Freigabe eingeholt wird.

7. **Knappe Meldungen in beide Richtungen.**
   - Repo-Chats melden dem Koordinator nur: Ergebnis, PR-Link, offene
     Fragen, Nebenbefunde — jeweils mit Ticket-ID, höchstens 3 Zeilen plus
     Link. Keine Diff-Zusammenfassung, kein Verlauf.
   - Im Review liest der Koordinator den **Diff ohne Testdateien** und
     verlässt sich für die Tests auf die CI. Den Diff zweimal zu lesen,
     einmal im Chat und einmal im PR, zahlt niemand.

8. **Übergabe bei Abbruch.** Scheitert ein Chat (Limit, Fehler):
   `chat <session-id> limit` (oder `fehler`), dann einen frischen
   Chat im **selben Ordner auf demselben Branch** starten, mit
   `briefing T-xxx --uebergabe`. Dieses Briefing sagt dem Nachfolger, dass
   er den Stand aus `git status` und dem Branch liest — nicht aus dem alten
   Verlauf, den es nicht mehr gibt. **Uncommittete Arbeit wird nie
   verworfen**, nichts zurückgerollt.

Das Archivieren selbst macht der Client (`archive_session`) und **braucht
die Bestätigung des Users**, außer er hat sie für den Sprint pauschal
erteilt. Danach `chat <session-id> archiviert`, damit der Sprint es festhält.
`/sprint-close` listet die Kandidaten von selbst auf.

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
