#!/usr/bin/env node
/**
 * session-state.js — trägt den Board-Zustand in Claudes Kontext.
 *
 * Zweck: Scraude soll ein Modus sein, kein Satz von Befehlen. Existiert ein
 * Board, gilt der Ablauf — ohne dass der User ihn pro Session neu anstößt.
 *
 * Zwei Betriebsarten, beide über hooks/hooks.json verdrahtet:
 *
 *   ohne Argument   SessionStart — einmal pro Session, ausführliche Lage.
 *                   Erfüllt zugleich Kernprinzip 9 (Standup zu
 *                   Sessionbeginn, "automatisch falls technisch möglich").
 *
 *   --brief         UserPromptSubmit — bei jeder Eingabe, aber nur eine
 *                   Zeile, und nur solange überhaupt ein Ticket läuft oder
 *                   pausiert. Grund: nach einer Kompaktierung kann der
 *                   geladene Skill aus dem Kontext fallen; diese Zeile
 *                   überlebt das und verhindert, dass der Modus wegdriftet.
 *
 * Stdout beider Events landet als Kontext bei Claude — deshalb knapp halten.
 * Kein Board, kein Output: der Hook darf in fremden Repos nicht auffallen.
 */

const store = require('./board-store');

function ausgabe(zeilen) {
  const text = zeilen.filter(Boolean).join('\n');
  if (text) console.log(text);
}

function brief(board) {
  const id = board.aktuelles_ticket;
  const pausiert = board.pausierte_tickets || [];
  if (!id && !pausiert.length) return; // nichts in Arbeit, nichts zu sagen

  const teile = [];
  if (id && board.tickets[id]) {
    const t = board.tickets[id];
    teile.push(`Ticket ${id} (${t.status}) "${t.title}" auf ${t.branch || 'ohne Branch'}`);
  }
  if (pausiert.length) teile.push(`pausiert: ${pausiert.join(', ')}`);
  ausgabe([`[Scraude] ${teile.join(' — ')}`]);
}

function voll(board) {
  const zeilen = ['[Scraude] Board aktiv in diesem Repo.'];

  const sprintId = board.aktueller_sprint;
  const sprint = sprintId && board.sprints[sprintId];
  if (sprint) {
    const imSprint = sprint.tickets.filter((i) => board.tickets[i]);
    const fertig = imSprint.filter((i) => board.tickets[i].status === 'done').length;
    zeilen.push(`Sprint ${sprintId}: ${fertig}/${imSprint.length} fertig.`);
  } else {
    const backlog = Object.values(board.tickets).filter((t) => t.status === 'backlog');
    zeilen.push(
      backlog.length
        ? `Kein aktiver Sprint, ${backlog.length} Tickets im Backlog.`
        : 'Kein aktiver Sprint, Backlog leer.'
    );
  }

  const id = board.aktuelles_ticket;
  if (id && board.tickets[id]) {
    const t = board.tickets[id];
    zeilen.push(`In Arbeit: ${id} "${t.title}" (${t.status}) auf ${t.branch || 'ohne Branch'}.`);
  }

  const pausiert = (board.pausierte_tickets || []).filter((i) => board.tickets[i]);
  if (pausiert.length) {
    zeilen.push(`Pausiert: ${pausiert.join(', ')} — fortsetzen mit /ticket-resume.`);
  }

  if (!id) {
    const next = store.nextTicket(board);
    if (next) {
      zeilen.push(`Nächstes Ticket: ${next.id} "${next.ticket.title}".`);
    }
  }

  // Blocker, die im Sprint liegen und noch warten
  if (sprint) {
    const blockiert = sprint.tickets
      .filter((i) => board.tickets[i] && board.tickets[i].status === 'sprint')
      .filter((i) => store.openBlockers(board, i).length);
    if (blockiert.length) {
      zeilen.push(`Blockiert: ${blockiert.join(', ')}.`);
    }
  }

  zeilen.push(
    'Es gilt der Scraude-Ablauf — Skill board-management laden und ihm folgen, ' +
      'ohne dass der User Commands tippt.'
  );

  ausgabe(zeilen);
}

function run() {
  if (!store.boardExists()) return;
  const board = store.readBoard();
  if (process.argv.includes('--brief')) brief(board);
  else voll(board);
}

if (require.main === module) {
  try {
    run();
  } catch {
    // Ein Hook darf eine Session nie stören
    process.exit(0);
  }
}
