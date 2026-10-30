# Scraude entwickeln

Hintergrund für alle, die am Plugin selbst arbeiten. Für die Nutzung siehe
[README](../README.md), für die Begründung jeder Designentscheidung
[`scrum-board-plugin-plan.md`](../scrum-board-plugin-plan.md).

## Aufbau

```
scraude/
├── .claude-plugin/
│   ├── plugin.json          # Plugin-Metadaten
│   └── marketplace.json     # Marketplace-Auflistung
├── hooks/
│   └── hooks.json           # trägt den Modus über die Session
├── agents/
│   ├── ticket-implementer.md # setzt Tickets mit niedriger A/K um
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
│   ├── session-state.js     # Board-Zustand in den Kontext
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

Der Skill heißt `board-init` und nicht `init`: durch die Namensraum-Trennung
gäbe es zwar keine echte Kollision mit dem eingebauten `/init`, aber
`/scraude:init` würde man beim Lesen trotzdem für "CLAUDE.md generieren"
halten.

## Lokal testen

Kein Marketplace nötig — `--plugin-dir` lädt das Plugin direkt aus dem
geklonten Repo:

```bash
claude --plugin-dir /pfad/zu/scraude
```

Nach Änderungen `/reload-plugins`, kein Neustart nötig.
Vor einem Release: `claude plugin validate .`

Die Skripte lassen sich auch ohne Claude ausprobieren, in einem beliebigen
Test-Repo:

```bash
node /pfad/zu/scraude/scripts/board-store.js
```

Ohne Argument listet `board-store.js` alle Befehle auf. Jede
Zustandsänderung am Board hat dort einen benannten Befehl (`init`,
`create-ticket`, `create-tickets`, `update-ticket`, `check-ready`,
`next-ticket`, `start-ticket`, `resume-ticket`, `review-ticket`,
`finish-ticket`, `plan-sprint`, `close-sprint`, `retro`, `impact`,
`model-for`).

## Scraude als Modus

Existiert `.claude/board.json`, gilt der Ablauf von selbst. Zwei Hooks tragen
ihn: `SessionStart` legt den Board-Zustand bei Sessionbeginn in den Kontext,
`UserPromptSubmit` hält eine einzelne Zustandszeile nach, solange ein Ticket
läuft. In Repos ohne Board schweigen beide.

Der `post-merge`-Hook ist dagegen ein echter Git-Hook, kein
Claude-Code-Hook: er feuert genau dann, wenn ein Merge stattgefunden hat —
auch nach `git pull` einer auf der Plattform gemergten PR.

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
