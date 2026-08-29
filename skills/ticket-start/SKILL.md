---
name: ticket-start
description: Startet ein Ticket — Definition of Ready prüfen, Branch erstellen, Status setzen.
argument-hint: "[T-<id>]"
disable-model-invocation: true
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js *)
  - Bash(git checkout:*)
  - Bash(git status:*)
---

Ticket-ID aus $ARGUMENTS. Ist sie leer, ermittelt
`node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" next-ticket` das
höchstpriorisierte, unblockierte Ticket im aktiven Sprint selbst — nicht
selbst durch das Board sortieren (Kernprinzip 6).

**Definition of Ready zuerst** (Kernprinzip 10):
`node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" check-ready T-<id>`
prüft den mechanischen Teil (Beschreibung vorhanden, Größe geschätzt, keine
offenen Blocker). Den inhaltlichen Teil — ist die Beschreibung wirklich
eigenständig verständlich? — beurteilst du selbst. Fehlt etwas: erst
nachschärfen (ggf. mit dem User), nicht trotzdem starten.

Dann:
1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" start-ticket T-<id>`
   Das erledigt in einem Schritt: laufendes Ticket auf `paused` setzen und
   in `pausierte_tickets` ablegen (Kernprinzip 7), Branch-Namen nach
   Konvention `feature/T-<id>-<slug>` bilden, Status auf `in_progress`,
   `aktuelles_ticket` setzen. Das Skript gibt den Branch-Namen aus.
2. Mit genau diesem Branch-Namen: `git checkout -b <branch>`
   (existiert der Branch schon: `git checkout <branch>`).

3. `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" model-for T-<id>`
   entscheidet, wer umsetzt: bei `sehr_niedrig`/`niedrig` an
   `scraude:ticket-implementer` mit dem empfohlenen Modell delegieren, sonst
   im Hauptthread arbeiten. Details im Skill `board-management`.

Kurze Bestätigung als Bullet-Punkte (Kernprinzip 11): Branch, Ticket-Titel,
ggf. welches Ticket pausiert wurde, wer umsetzt und mit welchem Modell,
kurzer Hinweis zu Kernprinzip 2 (passiv/aktiv bei Nebenthemen).
