# Scraude

Scrum-artiges Ticket-Board für Claude Code. Voller Plan siehe
`scrum-board-plugin-plan.md`.

## Aufbau

```
scraude/
├── .claude-plugin/
│   ├── plugin.json          # Plugin-Metadaten
│   └── marketplace.json     # Marketplace-Auflistung
├── agents/
│   └── ticket-reviewer.md   # Vor-Review, kennt das Ticket
├── skills/
│   ├── board-management/    # Hintergrundwissen, lädt automatisch
│   ├── intake/              # /scraude — Aufgabe zerlegen + Sprint vorschlagen
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

## Lokal testen

Kein Marketplace nötig — `--plugin-dir` lädt das Plugin direkt:

```bash
claude --plugin-dir /pfad/zu/scraude
```

Nach Änderungen `/reload-plugins`, kein Neustart nötig.
Vor einem Release: `claude plugin validate .`

## Nutzung

Der Einstieg ist `/scraude` selbst. Die übrigen Skills lassen sich
qualifiziert (`/scraude:board`) oder bar (`/board`) aufrufen — der bare Name
greift, solange ihn kein anderer Command belegt:

```
/scraude:board-init
/scraude "Beschreibung der Aufgabe oder Pfad zum Design"
/scraude:ticket-new "Einzelnes Ticket"
/scraude:sprint-plan
/scraude:ticket-start
/scraude:ticket-review
/scraude:sprint-close
```

Der Skill heißt `board-init` und nicht `init`: durch die Namensraum-Trennung
gäbe es zwar keine echte Kollision mit dem eingebauten `/init`, aber
`/scraude:init` würde man beim Lesen trotzdem für "CLAUDE.md generieren"
halten.

## Stand

Umgesetzt und im Test-Repo end-to-end durchgespielt (Implementierungsplan
Stufe 1–6):
- `board-store.js` — jede Zustandsänderung am Board hat einen benannten
  Befehl (`init`, `create-ticket`, `check-ready`, `next-ticket`,
  `start-ticket`, `resume-ticket`, `review-ticket`, `finish-ticket`,
  `plan-sprint`, `plan-sprint`, `close-sprint`, `retro`, `create-tickets`, `impact`). Ohne Argument
  aufgerufen listet
  es alle Befehle auf.
- `board-render.js` — Backlog, aktiver Sprint, Tickets außerhalb des Sprints
- Alle 10 Command-Skills + `board-management`
- `agents/ticket-reviewer.md` — prüft bei jedem `/ticket-review` den Diff
  gegen die Ticket-Beschreibung, behebt mechanisch Eindeutiges in einem
  eigenen Commit, meldet den Rest. Gibt bewusst kein Urteil ab.
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
