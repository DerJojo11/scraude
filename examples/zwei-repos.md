# Durchgespielt: ein Sprint, zwei Repos, frische Chats

Dieses Beispiel zeigt den Ablauf aus dem Skill `board-management`,
Abschnitt „Koordinator und Repo-Chats", an einem echten Board-Stand.
`examples/board-zwei-repos.json` ist der Snapshot an der Stelle, an der
beide Repo-Chats laufen — zum Anschauen oder zum Mitspielen:

```bash
SCRAUDE_BOARD=/tmp/scraude-demo/board.json node scripts/board-store.js get-board
```

Alle Ausgaben unten sind echt, nicht nachgeschrieben. `board-store.js` steht
für `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js"`.

## Ausgangslage

Ein Projekt mit zwei Repos. Der Koordinator-Chat hält das Board und
verteilt; gearbeitet wird in den Repo-Chats.

```bash
board-store.js config '{
  "repos": {
    "app":     { "pfad": "/Users/du/projekt/app",     "base_branch": "main",    "merge_stil": "squash",
                 "schnittstellen": ["Push-Token kommt als POST /devices {token, platform} — Vertrag steht, nicht ändern"] },
    "backend": { "pfad": "/Users/du/projekt/backend", "base_branch": "develop", "merge_stil": "merge",
                 "schnittstellen": ["POST /devices antwortet 201 mit {id} — vom App-Team erwartet"] }
  },
  "maxParallelChats": 2,
  "chatMessageLimit": 400,
  "koordinator_chat": "local_koordinator",
  "projektregeln": [
    "Commit-Footer: Co-Authored-By: Claude",
    "gh-Konto: projekt-bot",
    "Kein git push --force, kein rebase auf geteilten Branches",
    "Prod-Datenbank ist gesperrt — nur Staging"
  ]
}'
```

`projektregeln` und `koordinator_chat` kann das Skript nicht wissen — ohne
sie steht im Briefing ein Platzhalter statt der Regeln.

Vier Tickets, jedes mit `repo`:

| Ticket | Repo | Größe / A/K | |
|---|---|---|---|
| T-001 | backend | M / mittel | POST /devices für Push-Token |
| T-002 | app | M / mittel | Push-Registrierung — blockiert von T-001 |
| T-003 | app | S / niedrig | Onboarding-Screen: Abstände und Farbe |
| T-004 | backend | XS / sehr_niedrig | Abhängigkeiten aktualisieren |

## 1. Nach `plan-sprint`: wer darf starten?

```
$ board-store.js chats
S-01: 0 von 2 Chats aktiv, 2 Slot(s) frei
Ohne lebenden Chat:
  backend: T-001, T-004
  app: T-002 (wartet auf T-001), T-003
```

T-002 steht mit seinem Blocker da. Es geht in **keinen** Chat, obwohl Slots
frei sind — `blockiert_von` bleibt maßgeblich.

## 2. Briefing holen und Chat starten

~~~
$ board-store.js briefing app
# app — Sprint S-01

## Für start_session
context: fresh
cwd: /Users/du/projekt/app
model: sonnet   (schwerstes Ticket T-003: niedrig, Größe S)

## Auftrag
Du arbeitest allein im Repo **app** (/Users/du/projekt/app).
Base-Branch: main · Merge-Stil: squash
Pro Ticket ein eigener Branch nach dem Scraude-Muster, ein eigener PR.

## Tickets
### T-003 — Onboarding-Screen: Abstände und Button-Farbe (S, niedrig, Prio 3)
- Abstände auf das 8er-Raster
- Primary-Button auf die Markenfarbe
- reine Optik, keine Logik

## Nicht in diesem Chat
- T-002 — Push-Registrierung beim App-Start (wartet auf T-001)
Nicht vorgreifen — dafür startet der Koordinator einen eigenen Chat.

## Vereinbarte Schnittstellen und Entscheidungen
- Push-Token kommt als POST /devices {token, platform} — Vertrag steht, nicht ändern

## Projektregeln
- Commit-Footer: Co-Authored-By: Claude
- gh-Konto: projekt-bot
- Kein git push --force, kein rebase auf geteilten Branches
- Prod-Datenbank ist gesperrt — nur Staging

## Board-Stand selbst lesen
Nicht beim Koordinator erfragen, sondern:
```bash
node ".../scripts/board-store.js" get-board
```
Ablauf, Statusübergänge, Definition of Ready/Done und Prüfkette stehen im
Skill `scraude:board-management` — der lädt im Repo von selbst.

## Meldung an den Koordinator
An: local_koordinator — per SendMessage.
Höchstens 3 Zeilen plus PR-Link, je Ticket:
- Ergebnis (fertig / offen, mit Ticket-ID)
- offene Fragen
- Nebenbefunde, jeweils mit Ticket-ID
Keine Zusammenfassung des Diffs und kein Verlauf — den Diff liest der
Koordinator im PR.

## Grenzen
- Nie selbst mergen und keinen Merge anstoßen.
- Sprint-Lock nicht brechen: Neues geht ins Backlog.
- Uncommittete Arbeit nie verwerfen.
- Wird dieser Chat länger als ~400 Nachrichten: laufendes Ticket
  abschließen, melden, kein weiteres beginnen. Für das nächste Ticket
  startet der Koordinator einen frischen Chat.
~~~

Dieser Text geht unverändert als Prompt in `start_session`
(`context: "fresh"`, `cwd` und `model` wie im Kopf). Kein Wort aus dem
Verlauf des Koordinators kommt dazu — genau darum geht es.

Das Backend-Bündel fällt anders aus:

```
$ board-store.js briefing backend | head -6
# backend — Sprint S-01

## Für start_session
context: fresh
cwd: /Users/du/projekt/backend
model: inherit   (mittel, aber Größe T-001=M — über XS/S (config.chat_sonnet_groessen))
```

Das schwerste Ticket entscheidet, und ein mittleres Ticket in Größe M läuft
auf dem Modell des Koordinators. Wer das anders halten will, setzt
`config.chat_sonnet_groessen` auf `["XS","S","M"]` — eine Zeile, kein Release.

Beide Chats eintragen, sobald sie laufen:

```
$ board-store.js chat local_backend backend '["T-001","T-004"]'
Chat local_backend für backend eingetragen: T-001, T-004
Aktive Chats: 1 von 2
$ board-store.js chat local_app app '["T-003"]'
Chat local_app für app eingetragen: T-003
Aktive Chats: 2 von 2

$ board-store.js chats
S-01: 2 von 2 Chats aktiv, 0 Slot(s) frei
  aktiv        backend  local_backend  T-001, T-004  offen: T-001, T-004
  aktiv        app      local_app  T-003  offen: T-003
Ohne lebenden Chat:
  app: T-002 (wartet auf T-001)
```

Keine freien Slots: T-002 wartet, auch wenn sein Blocker fällt. Dieser Stand
liegt als `examples/board-zwei-repos.json` bei.

## 3. Ein Chat läuft ans Limit

T-004 ist durch, T-003 auch — dann hängt der Backend-Chat.

```
$ board-store.js chat local_backend limit
Chat local_backend (backend) als gescheitert markiert: limit
Noch offen: T-001 — Nachfolge-Chat mit "briefing T-001 --uebergabe" briefen.
```

Das Übergabe-Briefing enthält dieselben Blöcke, zusätzlich:

~~~
## Stand (Übergabe aus einem abgebrochenen Chat)
Ein Vorgänger-Chat hat hier schon gearbeitet und abgebrochen. Seinen
Verlauf gibt es nicht — den Stand liest du aus Git:
```bash
git -C "/Users/du/projekt/backend" status --short
git -C "/Users/du/projekt/backend" log --oneline develop..HEAD
```
Branch(es): feature/T-001-post-devices-fuer-push-token
Uncommittete Arbeit wird nie verworfen und nichts zurückgerollt — du
setzt auf dem vorhandenen Stand auf.
~~~

Der Nachfolger arbeitet im selben Ordner auf demselben Branch:

```
$ board-store.js chat local_backend_2 backend '["T-001"]'
Chat local_backend_2 für backend eingetragen: T-001
Aktive Chats: 1 von 2
```

Nach dem Merge von T-001 ist T-002 frei, und der Slot auch:

```
$ board-store.js chats
S-01: 0 von 2 Chats aktiv, 2 Slot(s) frei
  gescheitert  backend  local_backend  T-001, T-004 [gescheitert: limit]  (archivierbar)
  fertig       app      local_app  T-003  (archivierbar)
  fertig       backend  local_backend_2  T-001  (archivierbar)
Ohne lebenden Chat:
  app: T-002
```

## 4. Sprint schließen

```
$ board-store.js close-sprint
Sprint S-01 geschlossen.
Chats dieses Sprints, die archiviert werden können:
  backend  local_backend [gescheitert: limit]
  app  local_app
  backend  local_backend_2
  app  local_app_2
Archivieren erst nach Bestätigung des Users.
{
  "sprint": "S-01",
  "tickets_gesamt": 4,
  "abgeschlossen": 4,
  "nach_herkunft": { "manuell": 4 },
  "offene_backlog_tickets": 0,
  "aeltestes_backlog_ticket": null,
  "chats_gestartet": 4,
  "chats_gescheitert": 1,
  "chats_am_limit": 1,
  "chats_je_repo": { "backend": 2, "app": 2 }
}
```

Vier Tickets, vier Chats, einer am Limit gescheitert — das ist die Zahl, auf
die es ankommt: wäre sie hoch, wären die Bündel zu groß geschnitten.

Archiviert werden die Chats im Client (`archive_session`), **nach
Bestätigung des Users**. Festgehalten wird es danach:

```
$ board-store.js chat local_backend archiviert
Chat local_backend (backend, S-01) als archiviert vermerkt.
```

Der nächste Sprint beginnt wieder mit frischen Chats. Keiner von diesen vier
sieht den nächsten Sprint — das ist der Punkt.
