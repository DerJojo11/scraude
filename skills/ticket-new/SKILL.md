---
name: ticket-new
description: Legt manuell ein Ticket im Backlog an.
argument-hint: "<Titel>"
disable-model-invocation: true
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js *)
---

Der User hat folgenden Titel übergeben: $ARGUMENTS

1. Formuliere eine kompakte, eigenständig verständliche Beschreibung in
   Stichpunkten (Kernprinzip 6) — frag nach, falls der Titel allein nicht
   reicht, um eine sinnvolle Beschreibung abzuleiten. Sie muss ohne den
   aktuellen Chatverlauf verständlich sein (kein "das von vorhin").
2. Schätze `typ` (feature | bug | chore | spike) und grobe `groesse`
   (S | M | L) ein. Beides ist Teil der Definition of Ready (Kernprinzip 10)
   — fehlt die Größe, lässt sich das Ticket später nicht starten.
3. `prioritaet`: kleinere Zahl = höhere Priorität, Default 3. Will der User
   den Sprint-Lock bewusst brechen, bekommt das Ticket `prioritaet: 1` und
   bleibt trotzdem im Backlog (geklärter Punkt in Abschnitt 11 des Plans).
4. `herkunft` setzen (Kernprinzip 2, wird von der Mini-Retro ausgewertet):
   - `manuell` — über diesen Command angelegt (Default)
   - `passiv` — Nebenthema, still mitgeschrieben
   - `aktiv` — Nebenthema, das gemeldet wurde
5. Aufrufen:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" create-ticket '<json>'`
   mit `title`, `beschreibung`, `typ`, `groesse`, ggf. `prioritaet`/`herkunft`.
6. Bestätige kurz (ein bis zwei Bullet-Punkte, Kernprinzip 11): Ticket-ID und
   grobe Einschätzung.
