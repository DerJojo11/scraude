#!/usr/bin/env node
/**
 * board-store.js — Zugriffsschicht auf .claude/board.json
 *
 * Stufe 1 des Implementierungsplans (Abschnitt 12 im Plan-Dokument):
 * das Fundament, auf das Commands, Hooks und Skill aufbauen.
 * Rein deterministisch, kein Claude-Aufruf nötig (Kernprinzip 6).
 *
 * Grundsatz: Jede Zustandsänderung am Board hat hier einen benannten Befehl.
 * Commands rufen diese Befehle auf, statt sich Ad-hoc-Logik zusammenzubauen.
 *
 * Nutzung als CLI (von Commands/Hooks aus per bash aufgerufen):
 *   node board-store.js init
 *   node board-store.js get-board
 *   node board-store.js create-ticket '{"title":"...", ...}'
 *   node board-store.js update-ticket T-001 '{"prioritaet":1}'
 *   node board-store.js check-ready T-001
 *   node board-store.js next-ticket
 *   node board-store.js start-ticket [T-001]
 *   node board-store.js resume-ticket
 *   node board-store.js review-ticket T-001 [<pr-url>]
 *   node board-store.js finish-ticket T-001
 *   node board-store.js plan-sprint '["T-001","T-002"]'
 *   node board-store.js close-sprint
 *   node board-store.js retro [S-01]
 *
 * Nutzung als Modul (aus anderen Skripten):
 *   const store = require('./board-store');
 *   const board = store.readBoard();
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Das Board ist bewusst NICHT versioniert (siehe README, "Speicherort von
 * board.json"): es ändert sich bei fast jeder Aktion, würde damit jeden
 * Branch-Wechsel blockieren, jeden PR mit Rauschen füllen und bei jedem
 * Merge im selben File kollidieren. Es liegt deshalb lokal im Repo und wird
 * von /board-init in die .gitignore eingetragen.
 *
 * SCRAUDE_BOARD überschreibt den Pfad — offene Tür für ein später geteiltes
 * Board, ohne dass dafür hier etwas umgebaut werden muss.
 */
const BOARD_PATH = process.env.SCRAUDE_BOARD
  ? path.resolve(process.env.SCRAUDE_BOARD)
  : path.join(process.cwd(), '.claude', 'board.json');

const EMPTY_BOARD = {
  tickets: {},
  sprints: {},
  aktueller_sprint: null,
  aktuelles_ticket: null,
  pausierte_tickets: []
};

function boardExists() {
  return fs.existsSync(BOARD_PATH);
}

function readBoard() {
  if (!boardExists()) {
    throw new Error(
      `Kein board.json gefunden unter ${BOARD_PATH}. Erst /board-init ausführen.`
    );
  }
  const raw = fs.readFileSync(BOARD_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeBoard(board) {
  fs.mkdirSync(path.dirname(BOARD_PATH), { recursive: true });
  fs.writeFileSync(BOARD_PATH, JSON.stringify(board, null, 2) + '\n', 'utf-8');
  return board;
}

/**
 * Trägt das Board in die .gitignore des Repos ein, falls es nicht ohnehin
 * schon ignoriert wird (z. B. weil `.claude/` komplett drinsteht).
 * Wird von initBoard() mit erledigt, damit es nicht vergessen werden kann.
 */
function ensureIgnored() {
  let root;
  try {
    root = execSync('git rev-parse --show-toplevel', {
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim();
  } catch {
    return { status: 'kein-repo' };
  }

  const rel = path.relative(root, BOARD_PATH);
  if (rel.startsWith('..')) return { status: 'ausserhalb-repo', pfad: BOARD_PATH };

  try {
    execSync(`git check-ignore -q "${rel}"`, { cwd: root, stdio: 'ignore' });
    return { status: 'bereits-ignoriert', eintrag: rel };
  } catch {
    // nicht ignoriert -> eintragen
  }

  const gitignore = path.join(root, '.gitignore');
  const eintrag = `/${rel.split(path.sep).join('/')}`;
  const vorhanden = fs.existsSync(gitignore)
    ? fs.readFileSync(gitignore, 'utf-8')
    : '';
  const prefix = vorhanden && !vorhanden.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(
    gitignore,
    `${vorhanden}${prefix}\n# Scraude-Board: lokaler Stand, bewusst nicht versioniert\n${eintrag}\n`,
    'utf-8'
  );
  return { status: 'eingetragen', eintrag };
}

function initBoard() {
  const ignore = ensureIgnored();
  if (boardExists()) {
    return { alreadyExisted: true, board: readBoard(), ignore };
  }
  const board = writeBoard(EMPTY_BOARD);
  return { alreadyExisted: false, board, ignore };
}

// --- Hilfsfunktionen -------------------------------------------------------

function ticketAgeInDays(ticket) {
  const created = new Date(ticket.erstellt_am).getTime();
  return Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
}

/**
 * Branch-Slug aus einem Ticket-Titel (Kernprinzip 3: feature/T-<id>-<slug>).
 * Deutsche Umlaute werden ausgeschrieben, nicht weggeworfen.
 */
function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .reduce((acc, teil) => {
      // an der Wortgrenze kürzen, nicht mitten im Wort — beim ersten
      // Überlauf ist Schluss, sonst würden spätere kurze Wörter noch
      // hinterherrutschen und der Slug läse sich falsch
      if (acc.voll) return acc;
      if (!acc.teile.length) return { teile: [teil], voll: false };
      const laenge = acc.teile.join('-').length + 1 + teil.length;
      if (laenge > 40) return { ...acc, voll: true };
      return { teile: [...acc.teile, teil], voll: false };
    }, { teile: [], voll: false })
    .teile.join('-');
}

function branchName(id, title) {
  return `feature/${id}-${slugify(title)}`;
}

function requireTicket(board, id) {
  if (!board.tickets[id]) {
    throw new Error(`Ticket ${id} existiert nicht.`);
  }
  return board.tickets[id];
}

/** Blocker eines Tickets, die noch nicht `done` sind. */
function openBlockers(board, id) {
  const ticket = requireTicket(board, id);
  return (ticket.blockiert_von || []).filter(
    (b) => !board.tickets[b] || board.tickets[b].status !== 'done'
  );
}

/**
 * Wie viele andere Tickets hängen — direkt oder über Ketten — an diesem
 * einen? Genau die Zahl, die ein Spike braucht: ein Rechercheticket, dessen
 * Ergebnis fünf andere umschneidet, wiegt schwerer als eines, das nur sich
 * selbst betrifft.
 *
 * Erwartet eine Liste von { id, blockiert_von }. Kein Board nötig, damit das
 * auch auf einem noch nicht angelegten Vorschlag läuft (siehe /scraude).
 * Zyklen brechen die Rechnung nicht ab — sie werden nur nicht doppelt gezählt.
 */
function impactCounts(entries) {
  // Kanten umdrehen: wen blockiert dieses Ticket?
  const blockiert = {};
  entries.forEach((e) => {
    blockiert[e.id] = blockiert[e.id] || [];
  });
  entries.forEach((e) => {
    (e.blockiert_von || []).forEach((b) => {
      if (!blockiert[b]) blockiert[b] = [];
      blockiert[b].push(e.id);
    });
  });

  const memo = {};
  function nachgelagert(id, gesehen) {
    if (memo[id]) return memo[id];
    const treffer = new Set();
    (blockiert[id] || []).forEach((next) => {
      if (gesehen.has(next)) return; // Zyklus
      treffer.add(next);
      gesehen.add(next);
      nachgelagert(next, gesehen).forEach((t) => treffer.add(t));
    });
    const liste = [...treffer];
    memo[id] = liste;
    return liste;
  }

  return entries.map((e) => {
    const haengt_dran = nachgelagert(e.id, new Set([e.id]));
    return { id: e.id, haengt_dran: haengt_dran.length, tickets: haengt_dran };
  });
}

/**
 * Impact über das aktuelle Board, absteigend sortiert und mit der
 * eingetragenen Priorität daneben — damit ein Missverhältnis ins Auge fällt
 * (viel hängt dran, aber niedrige Priorität).
 */
function boardImpact(board) {
  const entries = Object.entries(board.tickets)
    .filter(([, t]) => t.status !== 'done')
    .map(([id, t]) => ({ id, blockiert_von: t.blockiert_von || [] }));

  return impactCounts(entries)
    .map((r) => ({
      ...r,
      titel: board.tickets[r.id].title,
      typ: board.tickets[r.id].typ,
      prioritaet: board.tickets[r.id].prioritaet
    }))
    .sort((a, b) => b.haengt_dran - a.haengt_dran || a.prioritaet - b.prioritaet);
}

function nextTicketId(board) {
  const ids = Object.keys(board.tickets)
    .map((id) => parseInt(id.replace('T-', ''), 10))
    .filter((n) => !Number.isNaN(n));
  const max = ids.length ? Math.max(...ids) : 0;
  return `T-${String(max + 1).padStart(3, '0')}`;
}

function nextSprintId(board) {
  const ids = Object.keys(board.sprints)
    .map((id) => parseInt(id.replace('S-', ''), 10))
    .filter((n) => !Number.isNaN(n));
  const max = ids.length ? Math.max(...ids) : 0;
  return `S-${String(max + 1).padStart(2, '0')}`;
}

// --- Tickets ---------------------------------------------------------------

/**
 * Legt ein Ticket an. Erwartet mindestens { title }.
 * Setzt sinnvolle Defaults für alle übrigen Felder aus dem Datenmodell
 * (Abschnitt 3 des Plans).
 *
 * `herkunft`: "manuell" (per /ticket-new), "passiv" (Nebenthema still
 * mitgeschrieben) oder "aktiv" (Nebenthema gemeldet) — siehe Kernprinzip 2.
 * Wird von der Mini-Retro in /sprint-close ausgewertet.
 */
function createTicket(board, data) {
  if (!data || !data.title) {
    throw new Error('Ticket braucht mindestens ein "title"-Feld.');
  }
  const id = nextTicketId(board);
  board.tickets[id] = {
    title: data.title,
    beschreibung: data.beschreibung || '',
    status: 'backlog',
    typ: data.typ || 'feature',
    groesse: data.groesse || null,
    herkunft: data.herkunft || 'manuell',
    prioritaet: data.prioritaet ?? 3,
    sprint_id: null,
    branch: null,
    pr_url: null,
    ueberschneidet_mit: data.ueberschneidet_mit || [],
    blockiert_von: data.blockiert_von || [],
    erstellt_waehrend: data.erstellt_waehrend || null,
    erstellt_am: new Date().toISOString(),
    notizen: []
  };
  writeBoard(board);
  return { id, ticket: board.tickets[id] };
}

/**
 * Legt mehrere Tickets in einem Rutsch an und löst dabei Abhängigkeiten
 * *zwischen* ihnen auf — das geht mit Einzelaufrufen nicht, weil die IDs
 * erst beim Anlegen entstehen.
 *
 * Jeder Eintrag darf ein `ref` tragen (freier Name, nur für diesen Aufruf).
 * In `blockiert_von` dürfen dann sowohl echte Ticket-IDs als auch diese
 * refs stehen:
 *
 *   [ { "ref": "modell", "title": "Datenmodell", "groesse": "S" },
 *     { "title": "API", "blockiert_von": ["modell"] } ]
 *
 * Die Reihenfolge im Array bestimmt die IDs, nicht die Priorität.
 */
function createTickets(board, entries) {
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error('create-tickets braucht eine nicht-leere Liste.');
  }

  // Unbekannte refs früh melden, statt sie später still zu verschlucken
  const refs = new Set(entries.filter((e) => e.ref).map((e) => e.ref));
  entries.forEach((e) => {
    (e.blockiert_von || []).forEach((b) => {
      if (!refs.has(b) && !board.tickets[b]) {
        throw new Error(
          `blockiert_von verweist auf "${b}" — weder ein ref in diesem Aufruf noch ein existierendes Ticket.`
        );
      }
    });
  });

  // Erst alle anlegen (ohne Blocker), damit die refs auf IDs abbildbar sind
  const refToId = {};
  const angelegt = [];
  entries.forEach((entry) => {
    const { ref, blockiert_von, ...rest } = entry;
    const { id } = createTicket(board, { ...rest, blockiert_von: [] });
    if (ref) refToId[ref] = id;
    angelegt.push({ id, ref: ref || null, blockiert_von: blockiert_von || [] });
  });

  // Dann die Blocker nachtragen
  angelegt.forEach(({ id, blockiert_von }) => {
    if (!blockiert_von.length) return;
    board.tickets[id].blockiert_von = blockiert_von.map((b) => refToId[b] || b);
  });
  writeBoard(board);

  return angelegt.map(({ id }) => ({
    id,
    title: board.tickets[id].title,
    groesse: board.tickets[id].groesse,
    prioritaet: board.tickets[id].prioritaet,
    blockiert_von: board.tickets[id].blockiert_von
  }));
}

function updateTicket(board, id, updates) {
  requireTicket(board, id);
  board.tickets[id] = { ...board.tickets[id], ...updates };
  writeBoard(board);
  return board.tickets[id];
}

/**
 * Definition of Ready (Kernprinzip 10) — rein mechanisch prüfbarer Teil.
 * Ob die Beschreibung *inhaltlich* eigenständig verständlich ist, kann nur
 * Claude beurteilen; hier wird geprüft, dass sie überhaupt existiert.
 */
function checkReady(board, id) {
  const ticket = requireTicket(board, id);
  const fehlt = [];
  if (!ticket.beschreibung || !ticket.beschreibung.trim()) {
    fehlt.push('beschreibung ist leer');
  }
  if (!ticket.groesse) {
    fehlt.push('groesse nicht geschätzt');
  }
  const blocker = openBlockers(board, id);
  if (blocker.length) {
    fehlt.push(`offene Blocker: ${blocker.join(', ')}`);
  }
  return { id, ready: fehlt.length === 0, fehlt };
}

/**
 * Nächstes Ticket im aktiven Sprint: höchste Priorität (kleinste Zahl),
 * Blocker bereits herausgefiltert (Kernprinzip: nie ein blockiertes Ticket
 * vorschlagen).
 */
function nextTicket(board) {
  const sprintId = board.aktueller_sprint;
  const sprint = sprintId && board.sprints[sprintId];
  if (!sprint) return null;
  const kandidaten = sprint.tickets
    .filter((id) => board.tickets[id])
    .filter((id) => ['sprint', 'paused'].includes(board.tickets[id].status))
    .filter((id) => openBlockers(board, id).length === 0)
    .sort((a, b) => board.tickets[a].prioritaet - board.tickets[b].prioritaet);
  if (!kandidaten.length) return null;
  const id = kandidaten[0];
  return { id, ticket: board.tickets[id] };
}

/**
 * Startet ein Ticket: pausiert ggf. das laufende (Kernprinzip 7), setzt
 * Branch-Namen, Status und `aktuelles_ticket` in einem Schritt.
 * Erstellt den Branch NICHT — das macht der Command per git.
 */
function startTicket(board, id) {
  const ticket = requireTicket(board, id);
  const blocker = openBlockers(board, id);
  if (blocker.length) {
    throw new Error(
      `${id} ist blockiert von: ${blocker.join(', ')} — erst diese abschließen.`
    );
  }

  let pausiert = null;
  const laufend = board.aktuelles_ticket;
  if (
    laufend &&
    laufend !== id &&
    board.tickets[laufend] &&
    board.tickets[laufend].status === 'in_progress'
  ) {
    board.tickets[laufend].status = 'paused';
    if (!board.pausierte_tickets.includes(laufend)) {
      board.pausierte_tickets.push(laufend);
    }
    pausiert = laufend;
  }

  const branch = ticket.branch || branchName(id, ticket.title);
  ticket.status = 'in_progress';
  ticket.branch = branch;
  board.pausierte_tickets = board.pausierte_tickets.filter((t) => t !== id);
  board.aktuelles_ticket = id;
  writeBoard(board);

  return { id, branch, pausiert, ticket };
}

/** Nimmt das zuletzt pausierte Ticket wieder auf (Kernprinzip 7). */
function resumeTicket(board) {
  if (!board.pausierte_tickets.length) {
    return null;
  }
  const id = board.pausierte_tickets[board.pausierte_tickets.length - 1];
  return startTicket(board, id);
}

/**
 * Übergang in den Review (Kernprinzip 4): Status auf `review`, PR-URL
 * speichern. Ohne PR-URL (kein gh/glab vorhanden) bleibt `pr_url` null,
 * Fallback ist der lokale Merge nach Chat-Freigabe.
 */
function reviewTicket(board, id, prUrl) {
  requireTicket(board, id);
  const updates = { status: 'review' };
  if (prUrl) updates.pr_url = prUrl;
  const ticket = updateTicket(board, id, updates);
  return { id, ticket };
}

/**
 * Ticket abschließen — wird vom post-merge-Hook aufgerufen, sobald der
 * Branch in main gelandet ist.
 */
function finishTicket(board, id) {
  requireTicket(board, id);
  board.tickets[id].status = 'done';
  if (board.aktuelles_ticket === id) board.aktuelles_ticket = null;
  board.pausierte_tickets = board.pausierte_tickets.filter((t) => t !== id);
  writeBoard(board);
  return { id, ticket: board.tickets[id], naechstes: nextTicket(board) };
}

// --- Sprints ---------------------------------------------------------------

/**
 * Fixiert einen neuen Sprint aus den übergebenen Backlog-Tickets.
 * Ab hier gilt der Sprint-Lock (Kernprinzip 1).
 */
function planSprint(board, ticketIds) {
  if (!Array.isArray(ticketIds) || !ticketIds.length) {
    throw new Error('plan-sprint braucht eine nicht-leere Liste von Ticket-IDs.');
  }
  const unbekannt = ticketIds.filter((id) => !board.tickets[id]);
  if (unbekannt.length) {
    throw new Error(`Unbekannte Ticket-IDs: ${unbekannt.join(', ')}`);
  }
  const aktiv = Object.entries(board.sprints).find(
    ([, s]) => s.status === 'active'
  );
  if (aktiv) {
    throw new Error(
      `Sprint ${aktiv[0]} ist noch aktiv — erst /sprint-close ausführen (Kernprinzip 1).`
    );
  }

  const id = nextSprintId(board);
  board.sprints[id] = {
    status: 'active',
    tickets: ticketIds,
    erstellt_am: new Date().toISOString(),
    abgeschlossen_am: null
  };
  ticketIds.forEach((t) => {
    board.tickets[t].status = 'sprint';
    board.tickets[t].sprint_id = id;
  });
  board.aktueller_sprint = id;
  writeBoard(board);
  return { id, sprint: board.sprints[id] };
}

/**
 * Zahlen für die Mini-Retro (Abschnitt 4 des Plans) — rein aus board.json,
 * kein Claude-Aufruf nötig.
 */
function retroStats(board, sprintId) {
  const sprint = board.sprints[sprintId];
  if (!sprint) throw new Error(`Sprint ${sprintId} existiert nicht.`);

  const tickets = sprint.tickets.map((id) => board.tickets[id]).filter(Boolean);
  const fertig = tickets.filter((t) => t.status === 'done');

  // Herkunft nur über die *abgeschlossenen* Tickets — die Frage der Retro
  // ist, wie viel von dem, was tatsächlich fertig wurde, passiv bzw. aktiv
  // entstanden ist (Abschnitt 4 des Plans).
  const nachHerkunft = {};
  fertig.forEach((t) => {
    nachHerkunft[t.herkunft] = (nachHerkunft[t.herkunft] || 0) + 1;
  });

  const backlog = Object.entries(board.tickets).filter(
    ([, t]) => t.status === 'backlog'
  );
  const aeltestes = backlog
    .map(([id, t]) => ({ id, titel: t.title, alter_tage: ticketAgeInDays(t) }))
    .sort((a, b) => b.alter_tage - a.alter_tage)[0] || null;

  return {
    sprint: sprintId,
    tickets_gesamt: sprint.tickets.length,
    abgeschlossen: fertig.length,
    nach_herkunft: nachHerkunft,
    offene_backlog_tickets: backlog.length,
    aeltestes_backlog_ticket: aeltestes
  };
}

/**
 * Schließt den aktiven Sprint. Verweigert den Abschluss, solange Tickets
 * offen sind — der Command klärt das dann mit dem User, statt dass hier
 * eigenmächtig geschlossen wird.
 */
function closeSprint(board, { force = false } = {}) {
  const id = board.aktueller_sprint;
  if (!id || !board.sprints[id]) {
    throw new Error('Kein aktiver Sprint vorhanden.');
  }
  const offen = board.sprints[id].tickets.filter(
    (t) => board.tickets[t] && board.tickets[t].status !== 'done'
  );
  if (offen.length && !force) {
    throw new Error(
      `Sprint ${id} hat noch offene Tickets: ${offen.join(', ')}. ` +
        'Erst mit dem User klären (--force schließt trotzdem, offene Tickets gehen zurück ins Backlog).'
    );
  }

  const geplant = board.sprints[id].tickets.length;

  // Erst umräumen, dann rechnen: sonst zählt die Retro die offenen Tickets
  // noch nicht als Backlog und meldet ein zu kleines Backlog.
  if (offen.length) {
    offen.forEach((t) => {
      board.tickets[t].status = 'backlog';
      board.tickets[t].sprint_id = null;
    });
    board.sprints[id].tickets = board.sprints[id].tickets.filter(
      (t) => !offen.includes(t)
    );
  }
  const retro = { ...retroStats(board, id), tickets_gesamt: geplant };
  board.sprints[id].status = 'closed';
  board.sprints[id].abgeschlossen_am = new Date().toISOString();
  board.aktueller_sprint = null;
  writeBoard(board);

  return { id, retro, zurueck_ins_backlog: offen };
}

module.exports = {
  BOARD_PATH,
  EMPTY_BOARD,
  boardExists,
  ensureIgnored,
  readBoard,
  writeBoard,
  initBoard,
  nextTicketId,
  nextSprintId,
  slugify,
  branchName,
  openBlockers,
  impactCounts,
  boardImpact,
  createTicket,
  createTickets,
  updateTicket,
  checkReady,
  nextTicket,
  startTicket,
  resumeTicket,
  reviewTicket,
  finishTicket,
  planSprint,
  closeSprint,
  retroStats,
  ticketAgeInDays
};

// --- CLI-Einstieg ----------------------------------------------------------

const USAGE = `Befehle:
  init                                Board anlegen
  get-board                           board.json ausgeben
  create-ticket '<json>'              Ticket anlegen (mind. title)
  create-tickets '<json-array>'       mehrere anlegen, refs in blockiert_von
  update-ticket T-001 '<json>'        Felder eines Tickets ändern
  check-ready T-001                   Definition of Ready prüfen
  impact ['<json-array>']             wie viele Tickets hängen an jedem?
  next-ticket                         nächstes unblockiertes Sprint-Ticket
  start-ticket [T-001]                Ticket starten (pausiert das laufende)
  resume-ticket                       zuletzt pausiertes Ticket fortsetzen
  review-ticket T-001 [<pr-url>]      Status auf review, PR-URL speichern
  finish-ticket T-001                 Status auf done (post-merge)
  plan-sprint '["T-001","T-002"]'     neuen Sprint fixieren
  close-sprint [--force]              aktiven Sprint schließen + Retro
  retro [S-01]                        Retro-Zahlen ohne zu schließen`;

if (require.main === module) {
  const [, , cmd, ...args] = process.argv;

  try {
    switch (cmd) {
      case 'init': {
        const result = initBoard();
        console.log(
          result.alreadyExisted
            ? `board.json existiert bereits: ${BOARD_PATH}`
            : `board.json angelegt: ${BOARD_PATH}`
        );
        const meldung = {
          eingetragen: `In .gitignore eingetragen: ${result.ignore.eintrag}`,
          'bereits-ignoriert': `Bereits gitignored: ${result.ignore.eintrag}`,
          'kein-repo': 'Kein Git-Repository — .gitignore nicht angefasst.',
          'ausserhalb-repo': `Board liegt außerhalb des Repos: ${result.ignore.pfad}`
        }[result.ignore.status];
        if (meldung) console.log(meldung);
        break;
      }
      case 'get-board': {
        console.log(JSON.stringify(readBoard(), null, 2));
        break;
      }
      case 'create-ticket': {
        const data = JSON.parse(args[0] || '{}');
        const board = readBoard();
        const { id, ticket } = createTicket(board, data);
        console.log(
          `Ticket angelegt: ${id} — ${ticket.title} (${ticket.typ}, ${ticket.groesse || 'Größe offen'}, Prio ${ticket.prioritaet}, ${ticket.herkunft})`
        );
        break;
      }
      case 'create-tickets': {
        const board = readBoard();
        const angelegt = createTickets(board, JSON.parse(args[0] || '[]'));
        angelegt.forEach((t) => {
          const blocker = t.blockiert_von.length
            ? ` — blockiert von ${t.blockiert_von.join(', ')}`
            : '';
          console.log(
            `${t.id} — ${t.title} (${t.groesse || 'Größe offen'}, Prio ${t.prioritaet})${blocker}`
          );
        });
        break;
      }
      case 'update-ticket': {
        const board = readBoard();
        updateTicket(board, args[0], JSON.parse(args[1] || '{}'));
        console.log(`Ticket ${args[0]} aktualisiert.`);
        break;
      }
      case 'check-ready': {
        console.log(JSON.stringify(checkReady(readBoard(), args[0]), null, 2));
        break;
      }
      case 'impact': {
        if (args[0]) {
          // Vorschlag prüfen, bevor er angelegt wird: refs zählen als IDs
          const entries = JSON.parse(args[0]).map((e, i) => ({
            id: e.ref || e.id || `#${i + 1}`,
            blockiert_von: e.blockiert_von || []
          }));
          const result = impactCounts(entries).sort(
            (a, b) => b.haengt_dran - a.haengt_dran
          );
          result.forEach((r) => {
            console.log(
              `${r.id}: ${r.haengt_dran} nachgelagert${r.tickets.length ? ` (${r.tickets.join(', ')})` : ''}`
            );
          });
        } else {
          boardImpact(readBoard()).forEach((r) => {
            console.log(
              `${r.id}  hängt dran: ${r.haengt_dran}  Prio: ${r.prioritaet}  [${r.typ}] ${r.titel}`
            );
          });
        }
        break;
      }
      case 'next-ticket': {
        const next = nextTicket(readBoard());
        console.log(
          next
            ? JSON.stringify(next, null, 2)
            : 'Kein startbares Ticket im aktiven Sprint.'
        );
        break;
      }
      case 'start-ticket': {
        const board = readBoard();
        let id = args[0];
        if (!id) {
          const next = nextTicket(board);
          if (!next) throw new Error('Kein startbares Ticket im aktiven Sprint.');
          id = next.id;
        }
        const result = startTicket(board, id);
        if (result.pausiert) {
          console.log(`${result.pausiert} pausiert (Kernprinzip 7).`);
        }
        console.log(`${result.id} gestartet — Branch: ${result.branch}`);
        console.log(`git checkout -b ${result.branch}`);
        break;
      }
      case 'resume-ticket': {
        const board = readBoard();
        const result = resumeTicket(board);
        if (!result) {
          console.log('Keine pausierten Tickets vorhanden.');
          break;
        }
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'review-ticket': {
        const board = readBoard();
        const { id, ticket } = reviewTicket(board, args[0], args[1]);
        console.log(
          `${id} auf "review" gesetzt${ticket.pr_url ? ` — ${ticket.pr_url}` : ' (kein PR, lokaler Merge als Fallback)'}`
        );
        break;
      }
      case 'finish-ticket': {
        const board = readBoard();
        const result = finishTicket(board, args[0]);
        console.log(`${result.id} auf "done" gesetzt.`);
        if (result.naechstes) {
          console.log(
            `Nächstes Ticket: ${result.naechstes.id} — ${result.naechstes.ticket.title}`
          );
        }
        break;
      }
      case 'plan-sprint': {
        const board = readBoard();
        const { id, sprint } = planSprint(board, JSON.parse(args[0] || '[]'));
        console.log(
          `Sprint ${id} aktiv mit ${sprint.tickets.length} Tickets: ${sprint.tickets.join(', ')}`
        );
        break;
      }
      case 'close-sprint': {
        const board = readBoard();
        const result = closeSprint(board, { force: args.includes('--force') });
        console.log(`Sprint ${result.id} geschlossen.`);
        if (result.zurueck_ins_backlog.length) {
          console.log(
            `Zurück ins Backlog: ${result.zurueck_ins_backlog.join(', ')}`
          );
        }
        console.log(JSON.stringify(result.retro, null, 2));
        break;
      }
      case 'retro': {
        const board = readBoard();
        const sprintId = args[0] || board.aktueller_sprint;
        if (!sprintId) throw new Error('Kein Sprint angegeben und keiner aktiv.');
        console.log(JSON.stringify(retroStats(board, sprintId), null, 2));
        break;
      }
      default:
        console.error(cmd ? `Unbekannter Befehl: ${cmd}\n` : '');
        console.error(USAGE);
        process.exit(1);
    }
  } catch (err) {
    console.error('Fehler:', err.message);
    process.exit(1);
  }
}
