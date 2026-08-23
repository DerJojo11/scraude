---
name: board
description: Zeigt den aktuellen Board-Stand als Markdown-Tabelle.
disable-model-invocation: true
allowed-tools:
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/board-render.js *)
---

Führe `node "${CLAUDE_PLUGIN_ROOT}/scripts/board-render.js"` aus und gib die
Ausgabe unverändert zurück. Kein zusätzliches Fließtext-Drumherum
(Kernprinzip 6 — reine Anzeige braucht keinen Claude-Aufruf über das Skript
hinaus).

Nur wenn der User zusätzlich explizit eine Einschätzung oder Empfehlung
verlangt (z. B. "was sollte ich zuerst machen?"), darf danach eine kurze
Bullet-Punkt-Einschätzung folgen (Kernprinzip 11).
