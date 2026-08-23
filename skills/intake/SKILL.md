---
name: scraude
description: Nimmt eine Aufgabe, Anforderung oder ein Design entgegen, zerlegt sie in Tickets und schlägt den ersten Sprint vor. Der Einstieg in den Scraude-Zyklus.
argument-hint: "<Aufgabe, Anforderung oder Pfad/Link zum Design>"
disable-model-invocation: true
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js *)
  - Read
  - Glob
---

Aufgerufen als `/scraude` — die Vordertür des Plugins (Abschnitt 4 des Plans: "Design/Anforderung
eingereicht → Feature-Tickets erstellt → Sprint geplant"). Ein Aufruf statt
zehnmal `/ticket-new` plus `/sprint-plan`.

Eingabe: $ARGUMENTS — freier Text, ein Dateipfad oder ein Link zu einem
Design. Ist es ein Pfad, erst lesen. Ist die Eingabe leer, nach der Aufgabe
fragen statt zu raten.

## 1. Board-Zustand prüfen — zuerst

`node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" get-board`

**Läuft bereits ein Sprint** (`aktueller_sprint` gesetzt, Sprint-Status
`active`), gilt der Sprint-Lock (Kernprinzip 1): Tickets werden angelegt,
aber **kein** Sprint vorgeschlagen. Das dem User klar sagen — die neuen
Tickets liegen im Backlog und kommen bei der nächsten `/sprint-plan` dran.
Nicht nachfragen, ob der Lock gebrochen werden soll; wer das will, sagt es.

## 2. Aufgabe zerlegen

Das ist der Teil, der Urteilsvermögen braucht — hier liegt der Wert des
Commands (Kernprinzip 6). Für jedes Ticket:

- **Zuschnitt am Review-Aufwand**, nicht nur an fachlicher Logik
  (Kernprinzip 8): jedes Ticket soll ein überschaubarer PR werden. Lieber
  ein Ticket mehr als eines, das niemand mehr sinnvoll reviewen kann.
- `beschreibung` in Stichpunkten, eigenständig verständlich — sie muss auch
  in drei Wochen ohne diesen Chatverlauf tragen.
- `typ` und `groesse` immer setzen. Ohne `groesse` scheitert später die
  Definition of Ready (Kernprinzip 10), das Ticket wäre nicht startbar.
- `prioritaet`: kleinere Zahl = höher.
- **`blockiert_von` ist der eigentliche Gewinn hier.** Einzelne
  `/ticket-new`-Aufrufe kennen ihre Geschwister nicht und können keine
  Reihenfolge ausdrücken. Typische Ketten: Datenmodell vor API vor UI,
  Gerüst vor Feature. Nicht künstlich verketten — nur wo eine Abhängigkeit
  wirklich besteht.
- Unklarheiten, die den Zuschnitt ändern würden, **vor** dem Anlegen klären.
  Was nur ein Detail betrifft, gehört als offene Frage in die Beschreibung.

Ist die Aufgabe zu klein zum Zerlegen (ein einziges Ticket), das sagen und
`/ticket-new` vorschlagen statt einen Sprint um ein Ticket zu bauen.

## 3. Alles auf einmal vorlegen — eine Bestätigung, nicht zwei

**Als Bullet-Liste** (Kernprinzip 11), Ticket-Vorschlag und Sprint-Vorschlag
zusammen in einer Ausgabe:

- pro Ticket: Titel, Typ, Größe, wovon es abhängt
- darunter markiert: welche davon in den ersten Sprint sollen und warum
  (in der Regel die erste zusammenhängende Kette, die für sich einen
  benutzbaren Stand ergibt)
- was bewusst im Backlog bleibt

Zwei Bestätigungen hintereinander werden durchgewunken — deshalb eine, die
beides zeigt. Der User bestätigt, ändert oder streicht.

## 4. Erst nach Bestätigung schreiben

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" create-tickets '<json-array>'`

   Legt alle Tickets in einem Rutsch an und löst Abhängigkeiten *zwischen*
   ihnen auf. Dafür trägt jeder Eintrag ein `ref` (freier Name, gilt nur für
   diesen Aufruf), auf das andere in `blockiert_von` verweisen:

   ```json
   [ { "ref": "modell", "title": "Datenmodell", "typ": "chore", "groesse": "S", "prioritaet": 1 },
     { "ref": "api", "title": "API-Endpunkte", "groesse": "M", "prioritaet": 2, "blockiert_von": ["modell"] } ]
   ```

   Ohne `ref` ginge das nicht: die Ticket-IDs entstehen erst beim Anlegen.

2. Nur wenn kein Sprint aktiv war:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" plan-sprint '["T-001","T-002"]'`

   Eine Abhängigkeitskette darf komplett in den Sprint — blockierte Tickets
   werden nur beim *Starten* übersprungen, nicht bei der Planung. Ist der
   Blocker gemerged, wird das nächste automatisch startbar.

3. Kurz bestätigen: wie viele Tickets, welcher Sprint, welches Ticket als
   Nächstes dran ist. Hinweis auf `/scraude:ticket-start`.
