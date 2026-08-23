#!/usr/bin/env node
/**
 * post-merge-check.js — läuft als echter Git-Hook (.git/hooks/post-merge)
 * und setzt das gemergte Ticket auf `done` (Abschnitt 8 im Plan-Dokument).
 *
 * Warum Git-Hook und nicht Claude-Code-Hook: der native post-merge feuert
 * exakt dann, wenn ein Merge stattgefunden hat — auch nach `git pull` auf
 * main, also sowohl bei lokalem Merge als auch bei einer auf der Plattform
 * gemergten PR. Ein PostToolUse-Hook auf Bash würde dagegen nach jedem
 * einzelnen Bash-Aufruf feuern, um fast immer nichts zu tun.
 *
 * Installiert wird der Hook von /board-init über install-git-hook.js.
 * Läuft komplett deterministisch, ohne Claude-Aufruf — kein Token-Verbrauch.
 */

const { execSync } = require('child_process');
const store = require('./board-store');

function git(cmd) {
  return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
}

function getCurrentBranch() {
  try {
    return git('rev-parse --abbrev-ref HEAD');
  } catch {
    return null;
  }
}

/**
 * Sucht die Ticket-ID im letzten Merge-Commit. Der Branch-Name steht dort
 * in der Regel in der Subject-Zeile ("Merge branch 'feature/T-014-...'",
 * bzw. "Merge pull request #12 from user/feature/T-014-..."), notfalls im
 * Body. Möglich ist das nur, weil die Namenskonvention strikt gilt
 * (Kernprinzip 3).
 */
function getMergedTicketId() {
  try {
    const log = git('log -1 --merges --pretty=%B');
    const match = log.match(/feature\/(T-\d+)-[\w-]*/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function run() {
  const branch = getCurrentBranch();
  if (branch !== 'main' && branch !== 'master') return; // nur relevant auf main
  if (!store.boardExists()) return;

  const ticketId = getMergedTicketId();
  if (!ticketId) return;

  const board = store.readBoard();
  const ticket = board.tickets[ticketId];
  if (!ticket || ticket.status === 'done') return; // schon verarbeitet

  const result = store.finishTicket(board, ticketId);
  console.log(`✓ ${ticketId} auf "done" gesetzt (Merge nach ${branch} erkannt)`);

  // Nächstes Ticket nur vorschlagen, nie automatisch starten (Kernprinzip 4)
  if (result.naechstes) {
    console.log(
      `→ Nächstes Ticket: ${result.naechstes.id} — ${result.naechstes.ticket.title}`
    );
    console.log('   starten mit: /ticket-start');
  }
}

if (require.main === module) {
  try {
    run();
  } catch {
    // Ein Hook darf den Merge nie zum Scheitern bringen
    process.exit(0);
  }
}

module.exports = { run, getMergedTicketId };
