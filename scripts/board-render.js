#!/usr/bin/env node
/**
 * board-render.js — rendert board.json als Markdown-Tabelle für /board.
 * Rein deterministisch, kein Claude-Aufruf nötig (Kernprinzip 6).
 *
 * Nutzung: node scripts/board-render.js
 */

const { readBoard, ticketAgeInDays } = require('./board-store');

function renderTable(headers, rows) {
  if (!rows.length) return '_keine Einträge_\n';
  const head = `| ${headers.join(' | ')} |`;
  const sep = `|${headers.map(() => '---').join('|')}|`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}\n`;
}

function render() {
  const board = readBoard();
  const tickets = board.tickets;
  let out = '';

  // Backlog
  const backlog = Object.entries(tickets)
    .filter(([, t]) => t.status === 'backlog')
    .sort((a, b) => a[1].prioritaet - b[1].prioritaet);

  out += `## BACKLOG (${backlog.length})\n\n`;
  out += renderTable(
    ['ID', 'Titel', 'Typ', 'Prio', 'Alter'],
    backlog.map(([id, t]) => [
      id,
      t.title,
      t.typ,
      t.prioritaet,
      `${ticketAgeInDays(t)} Tage`
    ])
  );

  // Aktiver Sprint
  const sprintId = board.aktueller_sprint;
  if (sprintId && board.sprints[sprintId]) {
    const sprint = board.sprints[sprintId];
    // Tickets, die es nicht mehr gibt, still überspringen — eine
    // verwaiste ID im Sprint darf die ganze Ansicht nicht killen
    const sprintTickets = sprint.tickets
      .filter((id) => tickets[id])
      .map((id) => [id, tickets[id]]);
    const done = sprintTickets.filter(([, t]) => t.status === 'done').length;

    out += `\n## SPRINT ${sprintId} (${sprint.status}) — ${done}/${sprintTickets.length} fertig\n\n`;
    out += renderTable(
      ['ID', 'Titel', 'Status', 'PR'],
      sprintTickets.map(([id, t]) => [
        id,
        t.title,
        t.status,
        t.pr_url ? `[PR](${t.pr_url})` : '—'
      ])
    );
  } else {
    out += '\n_Kein aktiver Sprint._\n';
  }

  // Tickets, die weder im Backlog noch im aktiven Sprint stehen und nicht
  // fertig sind — typisch: ein Hotfix, der per /ticket-start am Sprint vorbei
  // gestartet und dann pausiert wurde (Kernprinzip 7). Ohne diese Sektion
  // wären sie auf dem Board unsichtbar.
  const imSprint = new Set(
    sprintId && board.sprints[sprintId] ? board.sprints[sprintId].tickets : []
  );
  const ausserhalb = Object.entries(tickets)
    .filter(([id, t]) => !imSprint.has(id))
    .filter(([, t]) => !['backlog', 'done'].includes(t.status))
    .sort((a, b) => a[1].prioritaet - b[1].prioritaet);

  if (ausserhalb.length) {
    out += `\n## AUSSERHALB DES SPRINTS (${ausserhalb.length})\n\n`;
    out += renderTable(
      ['ID', 'Titel', 'Typ', 'Status', 'PR'],
      ausserhalb.map(([id, t]) => [
        id,
        t.title,
        t.typ,
        t.status,
        t.pr_url ? `[PR](${t.pr_url})` : '—'
      ])
    );
  }

  // Alters-Warnung (Kernprinzip: älteste Backlog-Tickets hervorheben)
  const oldest = backlog
    .map(([id, t]) => [id, ticketAgeInDays(t)])
    .sort((a, b) => b[1] - a[1])[0];
  if (oldest && oldest[1] >= 7) {
    out += `\n⚠ ${oldest[0]} wartet schon ${oldest[1]} Tage im Backlog\n`;
  }

  return out;
}

if (require.main === module) {
  try {
    console.log(render());
  } catch (err) {
    console.error('Fehler:', err.message);
    process.exit(1);
  }
}

module.exports = { render };
