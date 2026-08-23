# Scraude

Scrum-artiges Ticket-Board für Claude Code. Voller Plan siehe
`scrum-board-plugin-plan.md`.

## Aufbau

```
scraude/
├── .claude-plugin/
│   ├── plugin.json          # Plugin-Metadaten
│   └── marketplace.json     # Marketplace-Auflistung
├── skills/
│   ├── board-management/    # Hintergrundwissen, lädt automatisch
│   ├── board-init/          # /board-init
│   ├── standup/             # /standup
│   ├── board/               # /board
│   ├── ticket-new/          # /ticket-new "<Titel>"
│   ├── ticket-start/        # /ticket-start [T-<id>]
│   ├── ticket-resume/       # /ticket-resume
│   ├── ticket-review/       # /ticket-review [T-<id>]
│   ├── sprint-plan/         # /sprint-plan
│   └── sprint-close/        # /sprint-close
├── scripts/
│   ├── board-store.js       # Zugriffsschicht auf .claude/board.json
│   ├── board-render.js      # Markdown-Rendering für /board
│   ├── post-merge-check.js  # Git-Hook-Logik: Ticket nach Merge auf done
│   └── install-git-hook.js  # installiert .git/hooks/post-merge
└── scrum-board-plugin-plan.md
```

**Warum Skills statt `commands/`**: `${CLAUDE_PLUGIN_ROOT}` wird laut
Plugin-Referenz nur in Skill- und Agent-Inhalten ersetzt, nicht in
`commands/*.md`. Da Custom Commands inzwischen ohnehin in Skills aufgegangen
sind (`commands/x.md` und `skills/x/SKILL.md` erzeugen beide `/x`), liegt
jeder Command als Skill vor. Nebeneffekt: `allowed-tools` erlaubt es, die
gebündelten Skripte ohne Permission-Prompt laufen zu lassen.

Alle Command-Skills tragen `disable-model-invocation: true` — sie haben
Seiteneffekte und sollen nur der User auslösen. `board-management` ist
umgekehrt `user-invocable: false`: reines Hintergrundwissen.

## Nutzung

```
/board-init
/ticket-new "Erste Aufgabe"
/sprint-plan
/ticket-start
/ticket-review
/sprint-close
```

`/board-init` heißt bewusst nicht `/init` — das ist ein eingebauter
Claude-Code-Command.

## Stand

Umgesetzt und im Test-Repo end-to-end durchgespielt (Implementierungsplan
Stufe 1–6):
- `board-store.js` — jede Zustandsänderung am Board hat einen benannten
  Befehl (`init`, `create-ticket`, `check-ready`, `next-ticket`,
  `start-ticket`, `resume-ticket`, `review-ticket`, `finish-ticket`,
  `plan-sprint`, `close-sprint`, `retro`). Ohne Argument aufgerufen listet
  es alle Befehle auf.
- `board-render.js` — Backlog, aktiver Sprint, Tickets außerhalb des Sprints
- Alle 9 Command-Skills + `board-management`
- post-merge-Git-Hook, von `/board-init` installiert — verifiziert an einem
  echten Merge
- `marketplace.json`

Offen:
- Installation als echtes Plugin in Claude Code noch nicht getestet
  (bisher nur die Skripte direkt)
- Nach einem Plugin-Update zeigt der Git-Hook auf den alten Pfad; `/board-init`
  muss dann einmal erneut laufen. Der Hook meldet das selbst.

## Speicherort von `board.json`

Das Board liegt lokal unter `.claude/board.json` und ist **bewusst nicht
versioniert** — `/board-init` trägt es in die `.gitignore` ein.

Ursprünglich sah der Plan (Abschnitt 3) ein mit dem Code versioniertes Board
vor. Der End-to-End-Test hat gezeigt, dass das mit dem Ticket-Workflow
kollidiert: die Datei ändert sich bei praktisch jeder Aktion, dadurch
- blockierte sie `git checkout` bei uncommitteten Änderungen,
- landete Board-Rauschen in jedem PR,
- drohte bei jedem Merge ein Konflikt in derselben Datei,
- ließ der post-merge-Hook den Worktree direkt wieder dirty zurück.

Für die Zielgruppe von v1 (Einzelentwickler) ist das Board damit
Arbeitsstand, nicht Projektinhalt. Konsequenz: es wird nicht mitgeklont und
nicht geteilt — beides für einen einzelnen Entwickler ohne Belang.

Die Umgebungsvariable `SCRAUDE_BOARD` überschreibt den Pfad. Damit bleibt die
Tür für ein später geteiltes Board offen, ohne dass dafür etwas umgebaut
werden muss — nötig wäre dann zusätzlich eine Merge-Strategie für die Datei.
