---
name: board-init
description: Initialisiert das Scraude-Board in diesem Repo — board.json anlegen, Branch-Konvention prüfen, post-merge-Hook installieren.
argument-hint: ""
disable-model-invocation: true
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js *)
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/install-git-hook.js *)
  - Bash(git branch:*)
---

Heißt bewusst `/board-init` und nicht `/init` — `/init` ist ein eingebauter
Claude-Code-Command (CLAUDE.md generieren) und wäre kollidiert.

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" init`
   - Existiert `.claude/board.json` noch nicht: anlegen und kurz bestätigen.
   - Existiert sie bereits: das dem User mitteilen, nichts überschreiben.
   - Der Befehl trägt das Board zugleich in die `.gitignore` ein, falls es
     nicht ohnehin ignoriert wird, und sagt in der Ausgabe, was er getan hat.
     Das Board ist bewusst lokal (siehe README): es ändert sich bei fast
     jeder Aktion und würde versioniert jeden Branch-Wechsel blockieren und
     jeden PR mit Rauschen füllen.

2. `node "${CLAUDE_PLUGIN_ROOT}/scripts/install-git-hook.js"` — installiert
   `.git/hooks/post-merge`, der nach einem Merge nach main das zugehörige
   Ticket auf `done` setzt (Abschnitt 8 des Plans). Existiert dort schon ein
   fremder Hook, meldet das Skript das und überschreibt nichts — dann dem
   User sagen, dass er den Aufruf selbst ergänzen muss.

Danach prüfen und **als Bullet-Liste** (Kernprinzip 11) mitteilen:
- Hat `init` die `.gitignore` geändert, den User bitten, sie einmal zu
  committen — sonst steht sie dauerhaft als modifiziert im `git status`.
- `git branch --list 'feature/*'` — gibt es Branches, die nicht dem Muster
  `feature/T-<id>-<slug>` entsprechen? Falls ja: erwähnen, dass neue Tickets
  ab jetzt diesem Muster folgen (Kernprinzip 3).
- Ist `gh` oder `glab` installiert und eingeloggt (für echte PR-Erstellung,
  Kernprinzip 4)? Falls nicht: kurz erwähnen, dass Scraude auf lokalen Merge
  nach Chat-Freigabe zurückfällt.

Abschluss-Hinweis: nächster sinnvoller Schritt ist `/ticket-new "<Titel>"`
oder `/sprint-plan`.
