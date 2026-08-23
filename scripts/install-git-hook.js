#!/usr/bin/env node
/**
 * install-git-hook.js — installiert .git/hooks/post-merge im aktuellen Repo.
 * Wird von /board-init aufgerufen.
 *
 * Der Hook ruft post-merge-check.js über den absoluten Pfad auf, unter dem
 * das Plugin aktuell installiert ist. Achtung: ${CLAUDE_PLUGIN_ROOT} ändert
 * sich bei einem Plugin-Update — nach einem Update muss /board-init einmal
 * erneut laufen, damit der Hook wieder auf den gültigen Pfad zeigt. Der Hook
 * meldet es selbst, falls das Skript nicht mehr da ist.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHECK_SCRIPT = path.join(__dirname, 'post-merge-check.js');
const MARKER = '# scraude post-merge hook';

function gitDir() {
  try {
    const dir = execSync('git rev-parse --git-dir', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return path.resolve(process.cwd(), dir);
  } catch {
    return null;
  }
}

function run() {
  const dir = gitDir();
  if (!dir) {
    console.error('Kein Git-Repository — post-merge-Hook nicht installiert.');
    process.exit(1);
  }

  const hooksDir = path.join(dir, 'hooks');
  const hookPath = path.join(hooksDir, 'post-merge');

  const body = [
    '#!/bin/sh',
    MARKER,
    `if [ -f "${CHECK_SCRIPT}" ]; then`,
    `  node "${CHECK_SCRIPT}"`,
    'else',
    '  echo "scraude: post-merge-check.js nicht gefunden — /board-init erneut ausführen." >&2',
    'fi',
    ''
  ].join('\n');

  if (fs.existsSync(hookPath)) {
    const vorhanden = fs.readFileSync(hookPath, 'utf-8');
    if (!vorhanden.includes(MARKER)) {
      console.error(
        `In ${hookPath} liegt bereits ein fremder post-merge-Hook — nichts überschrieben.\n` +
          'Bitte diese Zeile dort selbst ergänzen:\n' +
          `  node "${CHECK_SCRIPT}"`
      );
      process.exit(1);
    }
    fs.writeFileSync(hookPath, body, { mode: 0o755 });
    console.log(`post-merge-Hook aktualisiert: ${hookPath}`);
    return;
  }

  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(hookPath, body, { mode: 0o755 });
  console.log(`post-merge-Hook installiert: ${hookPath}`);
}

if (require.main === module) run();
