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

/**
 * Zuordnung Komplexität → Modell und Effort.
 *
 * Bewusst im Board und nicht im Code festgeschrieben: welches Modell zu
 * welcher Arbeit passt, ist teils Kostenfrage, teils Geschmack, und die
 * Modell-Landschaft ändert sich. Ein Wert hier ist eine Zeile Bearbeitung,
 * eine Konstante im Plugin wäre ein Release.
 *
 * Erlaubt sind die Kurznamen, die Claude Code akzeptiert (haiku, sonnet,
 * opus, fable, inherit) oder eine vollständige Modell-ID.
 */
const DEFAULT_MODELLE = {
  sehr_niedrig: { model: 'haiku', effort: 'low' },
  niedrig: { model: 'sonnet', effort: 'low' },
  mittel: { model: 'sonnet', effort: 'medium' },
  hoch: { model: 'opus', effort: 'high' },
  sehr_hoch: { model: 'opus', effort: 'xhigh' }
};

const KOMPLEXITAETEN = Object.keys(DEFAULT_MODELLE);

/**
 * Modellwahl für einen *eigenen Repo-Chat* — nicht zu verwechseln mit
 * DEFAULT_MODELLE, das den Subagenten für ein einzelnes Ticket betrifft.
 *
 * Ein eigener Chat trägt mehr als ein Ticket und redet mit dem Koordinator;
 * er braucht deshalb eher Sonnet als Haiku. Haiku steht hier bewusst nicht
 * drin: es kommt nur für rein mechanische Arbeit in Frage, und ob eine
 * Aufgabe das ist, steht in keinem Feld — das setzt man bei Bedarf von Hand
 * in `config.chat_modelle`.
 *
 * `inherit` heißt: das Modell des Koordinators.
 */
const DEFAULT_CHAT_MODELLE = {
  sehr_niedrig: 'sonnet',
  niedrig: 'sonnet',
  mittel: 'sonnet',
  hoch: 'inherit',
  sehr_hoch: 'inherit'
};

/**
 * Bei `mittel` gilt Sonnet nur für kleine Tickets. Ein mittleres Ticket in
 * Größe L ist der Fall, bei dem das kleinere Modell lange arbeitet und am
 * Ende doch Rücksprache braucht — teurer als gleich das größere.
 * Unbekannte Größe zählt wie "zu groß": nicht raten.
 */
const CHAT_SONNET_GROESSEN = ['XS', 'S'];

/**
 * Projektweite Einstellungen. Liegen im Board, nicht im Code: welche Repos
 * es gibt, ist pro Projekt anders, und wie viele Chats parallel laufen
 * dürfen, ist eine Kosten- und Nervenfrage.
 *
 * `repos`: Name → { pfad, base_branch, merge_stil, schnittstellen: [] }
 * `koordinator_chat`: Session-ID, an die Repo-Chats melden.
 * `projektregeln`: Zeilen aus CLAUDE.md und Memory, die in jedes Briefing
 *   gehören (Commit-Footer, gh-Konto, verbotene Git-Befehle, Prod-Sperre).
 *   Das Skript kann die nicht selbst lesen — sie werden einmal hier
 *   eingetragen, und `briefing` meldet, solange sie fehlen.
 */
const DEFAULT_CONFIG = {
  repos: {},
  maxParallelChats: 2,
  chatMessageLimit: 400,
  koordinator_chat: null,
  projektregeln: [],
  chat_modelle: DEFAULT_CHAT_MODELLE,
  chat_sonnet_groessen: CHAT_SONNET_GROESSEN,
  // Was mit einem fertigen Repo-Chat passiert: "archivieren" oder
  // "loeschen". Standard ist archivieren, weil Löschen endgültig ist — der
  // Verlauf ist dann weg, auch wenn drei Wochen später im PR eine Frage
  // auftaucht, die nur dieser Chat beantworten konnte. Beides braucht die
  // Bestätigung des Users.
  chatAbschluss: 'archivieren'
};

const EMPTY_BOARD = {
  tickets: {},
  sprints: {},
  aktueller_sprint: null,
  aktuelles_ticket: null,
  pausierte_tickets: [],
  modelle: DEFAULT_MODELLE,
  config: DEFAULT_CONFIG
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
    komplexitaet: data.komplexitaet || null,
    herkunft: data.herkunft || 'manuell',
    prioritaet: data.prioritaet ?? 3,
    sprint_id: null,
    branch: null,
    pr_url: null,
    // In welchem Repo liegt die Arbeit, und welcher Chat macht sie? Beides
    // bleibt bei Einzel-Repo-Projekten einfach null.
    repo: data.repo || null,
    chat: data.chat || null,
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

/**
 * Welches Modell und welcher Effort passen zu diesem Ticket?
 *
 * Der Sinn ist nicht Sparsamkeit um ihrer selbst willen: ein mechanisches
 * Ticket mit dem größten Modell und höchstem Effort zu bearbeiten macht das
 * Ergebnis nicht besser, nur langsamer und teurer. Umgekehrt ist es teuer,
 * einen wirklich schwierigen Fall zu klein zu fahren — der Fehler landet
 * dann im Review oder in Produktion.
 *
 * Ohne gesetzte `komplexitaet` gibt es keine Empfehlung: raten wäre
 * schlechter als nichts zu sagen.
 */
function modelFor(board, id) {
  const ticket = requireTicket(board, id);
  const stufe = ticket.komplexitaet;
  if (!stufe) {
    return { id, komplexitaet: null, empfehlung: null, grund: 'komplexitaet nicht gesetzt' };
  }
  const tabelle = { ...DEFAULT_MODELLE, ...(board.modelle || {}) };
  const treffer = tabelle[stufe];
  if (!treffer) {
    return {
      id,
      komplexitaet: stufe,
      empfehlung: null,
      grund: `unbekannte Stufe "${stufe}" — erlaubt: ${KOMPLEXITAETEN.join(', ')}`
    };
  }
  return {
    id,
    komplexitaet: stufe,
    groesse: ticket.groesse,
    empfehlung: treffer,
    // Kleiner Diff bei hoher Komplexität ist der tückische Fall: wenig zu
    // lesen, viel falsch zu machen. Nicht als Fehler melden, aber benennen.
    hinweis:
      ['hoch', 'sehr_hoch'].includes(stufe) && ticket.groesse === 'S'
        ? 'Kleiner Diff, hohe Komplexität — wenig zu lesen, viel falsch zu machen.'
        : null
  };
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

// --- Repos, Chats und Briefings -------------------------------------------

/** Config mit Defaults aufgefüllt — nie direkt `board.config` lesen. */
function boardConfig(board) {
  const cfg = { ...DEFAULT_CONFIG, ...(board.config || {}) };
  cfg.chat_modelle = { ...DEFAULT_CHAT_MODELLE, ...(cfg.chat_modelle || {}) };
  cfg.repos = cfg.repos || {};
  cfg.projektregeln = cfg.projektregeln || [];
  return cfg;
}

function setConfig(board, updates) {
  board.config = { ...(board.config || {}), ...updates };
  writeBoard(board);
  return boardConfig(board);
}

/** Repo-Eintrag aus der Config, mit Defaults und klarer Fehlermeldung. */
function repoFor(board, name) {
  const cfg = boardConfig(board);
  const eintrag = cfg.repos[name];
  if (!eintrag) {
    const bekannt = Object.keys(cfg.repos).join(', ') || 'keins';
    throw new Error(
      `Repo "${name}" steht nicht in config.repos (bekannt: ${bekannt}). ` +
        `Mit config nachtragen.`
    );
  }
  return {
    name,
    pfad: null,
    base_branch: 'main',
    merge_stil: 'squash',
    schnittstellen: [],
    ...eintrag
  };
}

/**
 * Welches Modell bekommt ein Chat, der diese Tickets übernimmt?
 *
 * Es entscheidet das *schwerste* Ticket im Bündel: der Chat muss alle
 * schaffen, nicht den Durchschnitt. Fehlt irgendwo die Bewertung, gibt es
 * `inherit` — raten wäre hier teurer als das größere Modell zu nehmen.
 */
function chatModelFor(board, ids) {
  const cfg = boardConfig(board);
  const tickets = ids.map((id) => ({ id, ticket: requireTicket(board, id) }));

  const unbewertet = tickets
    .filter((x) => !KOMPLEXITAETEN.includes(x.ticket.komplexitaet))
    .map((x) => x.id);
  if (unbewertet.length) {
    return {
      model: 'inherit',
      stufe: null,
      grund: `komplexitaet fehlt oder ist unbekannt bei ${unbewertet.join(', ')} — nicht geraten`
    };
  }

  const schwerstes = tickets.reduce((a, b) =>
    KOMPLEXITAETEN.indexOf(b.ticket.komplexitaet) >
    KOMPLEXITAETEN.indexOf(a.ticket.komplexitaet)
      ? b
      : a
  );
  const stufe = schwerstes.ticket.komplexitaet;
  const model = cfg.chat_modelle[stufe] || 'inherit';

  const kleine = cfg.chat_sonnet_groessen || CHAT_SONNET_GROESSEN;
  if (stufe === 'mittel' && model !== 'inherit') {
    const grob = tickets.filter(
      (x) =>
        x.ticket.komplexitaet === 'mittel' && !kleine.includes(x.ticket.groesse)
    );
    if (grob.length) {
      return {
        model: 'inherit',
        stufe,
        grund: `mittel, aber Größe ${grob
          .map((x) => `${x.id}=${x.ticket.groesse || 'offen'}`)
          .join(', ')} — über ${kleine.join('/')} (config.chat_sonnet_groessen)`
      };
    }
  }

  return {
    model,
    stufe,
    grund: `schwerstes Ticket ${schwerstes.id}: ${stufe}${
      schwerstes.ticket.groesse ? `, Größe ${schwerstes.ticket.groesse}` : ''
    }`
  };
}

/**
 * Sprint-Tickets eines Repos, die noch nicht fertig sind.
 *
 * Standardmäßig ohne blockierte: `blockiert_von` bleibt maßgeblich, auch
 * wenn gerade ein Chat-Slot frei ist. Ein Chat, der auf ein Ticket in einem
 * anderen Repo wartet, verbraucht nur Slot und Verlauf.
 */
function sprintTicketsOfRepo(board, repo, { inklusiveBlockierte = false } = {}) {
  const sprintId = board.aktueller_sprint;
  const sprint = sprintId && board.sprints[sprintId];
  if (!sprint) throw new Error('Kein aktiver Sprint vorhanden.');
  return sprint.tickets.filter(
    (id) =>
      board.tickets[id] &&
      board.tickets[id].repo === repo &&
      board.tickets[id].status !== 'done' &&
      (inklusiveBlockierte || openBlockers(board, id).length === 0)
  );
}

/**
 * Das Briefing für einen frischen Repo-Chat. Es muss **ohne den Verlauf des
 * Vorsprints** auskommen — das ist der ganze Punkt: der alte Verlauf war der
 * Kostentreiber, nicht die Arbeit.
 *
 * Was hier *nicht* hineingehört: der Board-Stand. Den liest der Chat selbst,
 * sonst steht er doppelt und veraltet in zwei Quellen.
 */
function briefing(board, ids, { uebergabe = false } = {}) {
  if (!Array.isArray(ids) || !ids.length) {
    throw new Error('briefing braucht mindestens eine Ticket-ID.');
  }
  const tickets = ids.map((id) => ({ id, ticket: requireTicket(board, id) }));

  const repos = [...new Set(tickets.map((x) => x.ticket.repo))];
  if (repos.length > 1) {
    throw new Error(
      `Tickets liegen in verschiedenen Repos (${repos
        .map((r) => r || 'ohne repo')
        .join(', ')}) — ein Briefing gilt für einen Chat und damit ein Repo.`
    );
  }
  if (!repos[0]) {
    throw new Error(
      `Kein "repo" an ${ids.join(', ')} gesetzt — mit update-ticket nachtragen.`
    );
  }

  const cfg = boardConfig(board);
  const repo = repoFor(board, repos[0]);
  const modell = chatModelFor(board, ids);
  const sprintId = board.aktueller_sprint;
  const pluginRoot = path.dirname(__dirname);
  const storePfad = path.join(pluginRoot, 'scripts', 'board-store.js');
  const boardEnv =
    BOARD_PATH === path.join(process.cwd(), '.claude', 'board.json')
      ? ''
      : `SCRAUDE_BOARD="${BOARD_PATH}" `;

  const zeilen = [];
  const z = (s = '') => zeilen.push(s);

  z(`# ${repo.name}${sprintId ? ` — Sprint ${sprintId}` : ''}`);
  z();
  z('## Für start_session');
  z('context: fresh');
  z(`cwd: ${repo.pfad || '(pfad in config.repos nicht gesetzt)'}`);
  z(`model: ${modell.model}   (${modell.grund})`);
  z();
  z('## Auftrag');
  z(
    `Du arbeitest allein im Repo **${repo.name}**${
      repo.pfad ? ` (${repo.pfad})` : ''
    }.`
  );
  z(`Base-Branch: ${repo.base_branch} · Merge-Stil: ${repo.merge_stil}`);
  z('Pro Ticket ein eigener Branch nach dem Scraude-Muster, ein eigener PR.');
  z();
  z('## Tickets');
  tickets.forEach(({ id, ticket }) => {
    const kopf = [ticket.groesse || 'Größe offen', ticket.komplexitaet || 'A/K offen']
      .join(', ');
    z(`### ${id} — ${ticket.title} (${kopf}, Prio ${ticket.prioritaet})`);
    if (ticket.beschreibung) z(ticket.beschreibung.trim());
    if ((ticket.blockiert_von || []).length) {
      z(`Blockiert von: ${ticket.blockiert_von.join(', ')}`);
    }
    z();
  });

  // Was im selben Repo noch im Sprint liegt, aber nicht in diesem Chat: der
  // Chat soll es kennen, damit er nicht vorgreift — und wissen, warum.
  if (sprintId) {
    const spaeter = board.sprints[sprintId].tickets.filter(
      (id) =>
        board.tickets[id] &&
        board.tickets[id].repo === repo.name &&
        board.tickets[id].status !== 'done' &&
        !ids.includes(id)
    );
    if (spaeter.length) {
      z('## Nicht in diesem Chat');
      spaeter.forEach((id) => {
        const blocker = openBlockers(board, id);
        z(
          `- ${id} — ${board.tickets[id].title}${
            blocker.length ? ` (wartet auf ${blocker.join(', ')})` : ''
          }`
        );
      });
      z('Nicht vorgreifen — dafür startet der Koordinator einen eigenen Chat.');
      z();
    }
  }

  if (repo.schnittstellen.length) {
    z('## Vereinbarte Schnittstellen und Entscheidungen');
    repo.schnittstellen.forEach((s) => z(`- ${s}`));
    z();
  }

  z('## Projektregeln');
  if (cfg.projektregeln.length) {
    cfg.projektregeln.forEach((r) => z(`- ${r}`));
  } else {
    z(
      '- (config.projektregeln ist leer — Commit-Footer, gh-Konto, verbotene'
    );
    z('  Git-Befehle und Prod-Sperre aus CLAUDE.md dort eintragen)');
  }
  z();

  z('## Board-Stand selbst lesen');
  z('Nicht beim Koordinator erfragen, sondern:');
  z('```bash');
  z(`${boardEnv}node "${storePfad}" get-board`);
  z('```');
  z(
    'Ablauf, Statusübergänge, Definition of Ready/Done und Prüfkette stehen im'
  );
  z('Skill `scraude:board-management` — der lädt im Repo von selbst.');
  z();

  if (uebergabe) {
    const branches = tickets
      .map((x) => x.ticket.branch)
      .filter(Boolean);
    z('## Stand (Übergabe aus einem abgebrochenen Chat)');
    z(
      'Ein Vorgänger-Chat hat hier schon gearbeitet und abgebrochen. Seinen'
    );
    z('Verlauf gibt es nicht — den Stand liest du aus Git:');
    z('```bash');
    z(`git -C "${repo.pfad || '.'}" status --short`);
    z(
      `git -C "${repo.pfad || '.'}" log --oneline ${repo.base_branch}..HEAD`
    );
    z('```');
    if (branches.length) z(`Branch(es): ${branches.join(', ')}`);
    z(
      'Uncommittete Arbeit wird nie verworfen und nichts zurückgerollt — du'
    );
    z('setzt auf dem vorhandenen Stand auf.');
    z();
  }

  z('## Meldung an den Koordinator');
  z(
    `An: ${cfg.koordinator_chat || '(config.koordinator_chat nicht gesetzt)'} — per SendMessage.`
  );
  z('Höchstens 3 Zeilen plus PR-Link, je Ticket:');
  z('- Ergebnis (fertig / offen, mit Ticket-ID)');
  z('- offene Fragen');
  z('- Nebenbefunde, jeweils mit Ticket-ID');
  z(
    'Keine Zusammenfassung des Diffs und kein Verlauf — den Diff liest der'
  );
  z('Koordinator im PR.');
  z();
  z('## Grenzen');
  z('- Nie selbst mergen und keinen Merge anstoßen.');
  z('- Sprint-Lock nicht brechen: Neues geht ins Backlog.');
  z('- Uncommittete Arbeit nie verwerfen.');
  z(
    `- Wird dieser Chat länger als ~${cfg.chatMessageLimit} Nachrichten: laufendes Ticket`
  );
  z(
    '  abschließen, melden, kein weiteres beginnen. Für das nächste Ticket'
  );
  z('  startet der Koordinator einen frischen Chat.');

  return { repo: repo.name, tickets: ids, modell, text: zeilen.join('\n') };
}

/**
 * Trägt einen gestarteten Repo-Chat im Sprint ein und markiert die Tickets,
 * an denen er arbeitet. Erst damit weiß der Koordinator später, welcher Chat
 * woran saß — und welchen er nach dem Merge archivieren kann.
 *
 * Die Parallelitäts-Grenze wird hier gemeldet, nicht erzwungen: der Chat
 * existiert zu diesem Zeitpunkt schon, ihn nicht einzutragen wäre schlimmer
 * als ein Chat zu viel. Geprüft wird vorher, mit `chats`.
 */
function registerChat(board, { repo, chat, tickets }) {
  const sprintId = board.aktueller_sprint;
  if (!sprintId || !board.sprints[sprintId]) {
    throw new Error('Kein aktiver Sprint — erst plan-sprint.');
  }
  if (!chat) throw new Error('Ein Chat braucht eine Chat-/Session-ID.');
  repoFor(board, repo);
  if (!Array.isArray(tickets) || !tickets.length) {
    throw new Error('Ein Chat braucht mindestens eine Ticket-ID.');
  }
  tickets.forEach((id) => requireTicket(board, id));

  const sprint = board.sprints[sprintId];
  sprint.chats = sprint.chats || [];
  const vorhanden = sprint.chats.find((c) => c.chat === chat);
  if (vorhanden) {
    vorhanden.tickets = [...new Set([...vorhanden.tickets, ...tickets])];
    vorhanden.gescheitert = null;
  } else {
    sprint.chats.push({
      chat,
      repo,
      tickets: [...tickets],
      gestartet_am: new Date().toISOString(),
      gescheitert: null,
      archiviert_am: null
    });
  }

  tickets.forEach((id) => {
    board.tickets[id].repo = repo;
    board.tickets[id].chat = chat;
  });
  writeBoard(board);

  const uebersicht = chatOverview(board, sprintId);
  return {
    chat,
    repo,
    tickets,
    aktiv: uebersicht.aktiv,
    max: uebersicht.max,
    ueber_limit: uebersicht.aktiv > uebersicht.max
  };
}

/**
 * Chat als gescheitert markieren (`limit` am 5-Stunden- bzw.
 * Nachrichten-Limit, sonst `fehler`). Die Tickets behalten ihren Stand — der
 * Nachfolge-Chat setzt darauf auf.
 */
function chatFailed(board, chat, grund = 'fehler') {
  const sprintId = board.aktueller_sprint;
  const sprint = sprintId && board.sprints[sprintId];
  if (!sprint) throw new Error('Kein aktiver Sprint vorhanden.');
  const eintrag = (sprint.chats || []).find((c) => c.chat === chat);
  if (!eintrag) throw new Error(`Chat ${chat} ist in ${sprintId} nicht eingetragen.`);
  eintrag.gescheitert = grund;
  eintrag.gescheitert_am = new Date().toISOString();
  writeBoard(board);
  // Für die Übergabe zählt nur, was noch offen ist — fertige Tickets gehören
  // nicht ins Briefing des Nachfolgers.
  const offen = eintrag.tickets.filter(
    (id) => board.tickets[id] && board.tickets[id].status !== 'done'
  );
  return { chat, grund, repo: eintrag.repo, tickets: eintrag.tickets, offen };
}

/**
 * Abschluss eines Chats festhalten — erledigt wird er außerhalb, im Client
 * (`archive_session` bzw. `delete_session`).
 *
 * `art` ist `archiviert` oder `geloescht`. Das Board hält beides fest, weil
 * es ein Unterschied ist: ein archivierter Chat ist nachlesbar, ein
 * gelöschter nicht mehr. Steht hier `geloescht`, ist später nicht mehr zu
 * klären, was in dem Chat besprochen wurde — nur noch, dass es ihn gab.
 */
function archiveChat(board, chat, art = 'archiviert') {
  if (!['archiviert', 'geloescht'].includes(art)) {
    throw new Error(`Unbekannte Art "${art}" — erlaubt: archiviert, geloescht.`);
  }
  const treffer = Object.entries(board.sprints)
    .map(([id, s]) => ({ id, eintrag: (s.chats || []).find((c) => c.chat === chat) }))
    .find((x) => x.eintrag);
  if (!treffer) throw new Error(`Chat ${chat} ist in keinem Sprint eingetragen.`);
  treffer.eintrag.archiviert_am = new Date().toISOString();
  treffer.eintrag.art = art;
  writeBoard(board);
  return { chat, sprint: treffer.id, repo: treffer.eintrag.repo, art };
}

/**
 * Wer arbeitet gerade woran, wie viele Slots sind frei, und welche Tickets
 * warten noch ohne Chat? Die Antwort, die der Koordinator braucht, bevor er
 * den nächsten Chat startet (Parallelitäts-Grenze).
 */
function chatOverview(board, sprintId = board.aktueller_sprint) {
  const cfg = boardConfig(board);
  const sprint = sprintId && board.sprints[sprintId];
  if (!sprint) throw new Error('Kein aktiver Sprint vorhanden.');

  const chats = (sprint.chats || []).map((c) => {
    const offen = c.tickets.filter(
      (id) => board.tickets[id] && board.tickets[id].status !== 'done'
    );
    const status = c.archiviert_am
      ? c.art === 'geloescht'
        ? 'geloescht'
        : 'archiviert'
      : c.gescheitert
        ? 'gescheitert'
        : offen.length
          ? 'aktiv'
          : 'fertig';
    return {
      chat: c.chat,
      repo: c.repo,
      tickets: c.tickets,
      offen,
      gescheitert: c.gescheitert || null,
      status,
      // Gescheiterte Chats sind ebenfalls weg — nur ihre Tickets wandern
      // vorher in einen Nachfolge-Chat.
      archivierbar: status === 'fertig' || status === 'gescheitert'
    };
  });

  const aktiv = chats.filter((c) => c.status === 'aktiv').length;

  // Tickets im Sprint, die noch keinem lebenden Chat zugeordnet sind
  const lebende = new Set(
    chats.filter((c) => c.status === 'aktiv').flatMap((c) => c.tickets)
  );
  const ohneChat = {};
  sprint.tickets.forEach((id) => {
    const t = board.tickets[id];
    if (!t || t.status === 'done' || lebende.has(id)) return;
    const repo = t.repo || 'ohne repo';
    ohneChat[repo] = ohneChat[repo] || [];
    // Blocker mitgeben: ein blockiertes Ticket gehört in keinen Chat, auch
    // wenn ein Slot frei ist.
    ohneChat[repo].push({ id, wartet_auf: openBlockers(board, id) });
  });

  return {
    sprint: sprintId,
    max: cfg.maxParallelChats,
    aktiv,
    freie_slots: Math.max(0, cfg.maxParallelChats - aktiv),
    chats,
    ohne_chat: ohneChat
  };
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
    abgeschlossen_am: null,
    // Repo-Chats dieses Sprints — gefüllt vom Befehl "chat"
    chats: []
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

  // Chat-Zahlen: der Grund, aus dem pro Sprint frisch gestartet wird, ist
  // Kosten — dann gehört auch in die Retro, wie viele Chats es gebraucht hat
  // und wie viele unterwegs am Limit hängengeblieben sind.
  const chats = sprint.chats || [];
  const gescheitert = chats.filter((c) => c.gescheitert);

  return {
    sprint: sprintId,
    tickets_gesamt: sprint.tickets.length,
    abgeschlossen: fertig.length,
    nach_herkunft: nachHerkunft,
    offene_backlog_tickets: backlog.length,
    aeltestes_backlog_ticket: aeltestes,
    chats_gestartet: chats.length,
    chats_gescheitert: gescheitert.length,
    chats_am_limit: gescheitert.filter((c) => c.gescheitert === 'limit').length,
    chats_je_repo: chats.reduce((acc, c) => {
      acc[c.repo] = (acc[c.repo] || 0) + 1;
      return acc;
    }, {})
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

  // Welche Chats dieses Sprints können weg? Archiviert werden sie im Client,
  // nach Bestätigung des Users — hier stehen nur die Kandidaten.
  const archivierbar = (board.sprints[id].chats || [])
    .filter((c) => !c.archiviert_am)
    .map((c) => ({ chat: c.chat, repo: c.repo, gescheitert: c.gescheitert || null }));

  board.sprints[id].status = 'closed';
  board.sprints[id].abgeschlossen_am = new Date().toISOString();
  board.aktueller_sprint = null;
  writeBoard(board);

  return { id, retro, zurueck_ins_backlog: offen, archivierbare_chats: archivierbar };
}

module.exports = {
  BOARD_PATH,
  EMPTY_BOARD,
  DEFAULT_MODELLE,
  DEFAULT_CHAT_MODELLE,
  DEFAULT_CONFIG,
  CHAT_SONNET_GROESSEN,
  KOMPLEXITAETEN,
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
  modelFor,
  nextTicket,
  startTicket,
  resumeTicket,
  reviewTicket,
  finishTicket,
  planSprint,
  closeSprint,
  retroStats,
  ticketAgeInDays,
  boardConfig,
  setConfig,
  repoFor,
  chatModelFor,
  sprintTicketsOfRepo,
  briefing,
  registerChat,
  chatFailed,
  archiveChat,
  chatOverview
};

// --- CLI-Einstieg ----------------------------------------------------------

const USAGE = `Befehle:
  init                                Board anlegen
  get-board                           board.json ausgeben
  create-ticket '<json>'              Ticket anlegen (mind. title)
  create-tickets '<json-array>'       mehrere anlegen, refs in blockiert_von
  update-ticket T-001 '<json>'        Felder eines Tickets ändern
  check-ready T-001                   Definition of Ready prüfen
  model-for [T-001]                   Modell + Effort für dieses Ticket
  impact ['<json-array>']             wie viele Tickets hängen an jedem?
  next-ticket                         nächstes unblockiertes Sprint-Ticket
  start-ticket [T-001]                Ticket starten (pausiert das laufende)
  resume-ticket                       zuletzt pausiertes Ticket fortsetzen
  review-ticket T-001 [<pr-url>]      Status auf review, PR-URL speichern
  finish-ticket T-001                 Status auf done (post-merge)
  plan-sprint '["T-001","T-002"]'     neuen Sprint fixieren
  close-sprint [--force]              aktiven Sprint schließen + Retro
  retro [S-01]                        Retro-Zahlen ohne zu schließen

Koordinator und Repo-Chats:
  config ['<json>']                   Einstellungen zeigen bzw. ändern
  briefing <repo|T-001 …> [--uebergabe]
                                      Briefing + Modell für einen Repo-Chat
  chats                               wer arbeitet woran, freie Slots
  chat <chat-id> <repo> '["T-001"]'   gestarteten Chat eintragen
  chat <chat-id> limit|fehler         als gescheitert markieren
  chat <chat-id> archiviert|geloescht Abschluss festhalten`;

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
      case 'model-for': {
        const board = readBoard();
        const id = args[0] || board.aktuelles_ticket;
        if (!id) throw new Error('Kein Ticket angegeben und keines aktiv.');
        console.log(JSON.stringify(modelFor(board, id), null, 2));
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
        if (result.archivierbare_chats.length) {
          const art =
            boardConfig(board).chatAbschluss === 'loeschen'
              ? 'gelöscht'
              : 'archiviert';
          console.log(`Chats dieses Sprints, die ${art} werden können:`);
          result.archivierbare_chats.forEach((c) =>
            console.log(
              `  ${c.repo}  ${c.chat}${c.gescheitert ? ` [gescheitert: ${c.gescheitert}]` : ''}`
            )
          );
          console.log(
            art === 'gelöscht'
              ? 'Löschen ist endgültig — erst nach ausdrücklicher Bestätigung des Users.'
              : 'Archivieren erst nach Bestätigung des Users.'
          );
        }
        console.log(JSON.stringify(result.retro, null, 2));
        break;
      }
      case 'config': {
        const board = readBoard();
        // Ohne Argument zeigen, mit Argument ändern — zwei Befehle für
        // dieselbe Sache wären einer zu viel.
        const cfg = args[0]
          ? setConfig(board, JSON.parse(args[0]))
          : boardConfig(board);
        console.log(JSON.stringify(cfg, null, 2));
        break;
      }
      case 'briefing': {
        const board = readBoard();
        const uebergabe = args.includes('--uebergabe');
        const rest = args.filter((a) => a !== '--uebergabe');
        if (!rest.length) throw new Error('briefing braucht ein Repo oder Ticket-IDs.');
        // Erstes Argument kein Ticket? Dann ist es ein Repo-Name, und es
        // gelten alle offenen Sprint-Tickets dieses Repos.
        const ids = /^T-\d+$/.test(rest[0])
          ? rest
          : sprintTicketsOfRepo(board, rest[0]);
        if (!ids.length) {
          throw new Error(`Keine offenen Sprint-Tickets für Repo "${rest[0]}".`);
        }
        console.log(briefing(board, ids, { uebergabe }).text);
        break;
      }
      case 'chats': {
        const u = chatOverview(readBoard());
        console.log(
          `${u.sprint}: ${u.aktiv} von ${u.max} Chats aktiv, ${u.freie_slots} Slot(s) frei`
        );
        const breite = Math.max(4, ...u.chats.map((c) => c.repo.length));
        u.chats.forEach((c) => {
          const g = c.gescheitert ? ` [gescheitert: ${c.gescheitert}]` : '';
          console.log(
            `  ${c.status.padEnd(12)} ${c.repo.padEnd(breite)}  ${c.chat}  ${c.tickets.join(', ')}` +
              `${c.offen.length ? `  offen: ${c.offen.join(', ')}` : ''}${g}` +
              `${c.archivierbar ? '  (archivierbar)' : ''}`
          );
        });
        const wartend = Object.entries(u.ohne_chat);
        if (wartend.length) {
          console.log('Ohne lebenden Chat:');
          wartend.forEach(([repo, eintraege]) =>
            console.log(
              `  ${repo}: ${eintraege
                .map((e) =>
                  e.wartet_auf.length
                    ? `${e.id} (wartet auf ${e.wartet_auf.join(', ')})`
                    : e.id
                )
                .join(', ')}`
            )
          );
        }
        break;
      }
      /**
       * Ein Befehl für alles, was mit einem Chat passiert. Das zweite
       * Argument entscheidet: ein reserviertes Wort ändert den Zustand,
       * alles andere ist ein Repo-Name und trägt den Chat ein.
       */
      case 'chat': {
        const board = readBoard();
        const [chatId, was, ...rest] = args;
        if (!chatId || !was) {
          throw new Error(
            'chat braucht eine Chat-ID und dann <repo> + Tickets, "limit", "fehler", "archiviert" oder "geloescht".'
          );
        }

        if (was === 'archiviert' || was === 'geloescht') {
          const result = archiveChat(board, chatId, was);
          console.log(
            `Chat ${result.chat} (${result.repo}, ${result.sprint}) als ${result.art} vermerkt.`
          );
          break;
        }

        if (was === 'limit' || was === 'fehler') {
          const result = chatFailed(board, chatId, was);
          console.log(
            `Chat ${result.chat} (${result.repo}) als gescheitert markiert: ${result.grund}`
          );
          if (result.offen.length) {
            console.log(
              `Noch offen: ${result.offen.join(', ')} — Nachfolge-Chat mit ` +
                `"briefing ${result.offen.join(' ')} --uebergabe" briefen.`
            );
          } else {
            console.log('Keine offenen Tickets — kein Nachfolge-Chat nötig.');
          }
          break;
        }

        // Ohne Ticket-Liste war das zweite Argument als Zustandswort
        // gemeint — dann ist es ein Tippfehler, kein Repo-Name.
        if (!rest[0]) {
          throw new Error(
            `"${was}" ist weder ein Zustand (limit, fehler, archiviert, geloescht) ` +
              'noch ein Repo mit Ticket-Liste.'
          );
        }

        const result = registerChat(board, {
          repo: was,
          chat: chatId,
          tickets: JSON.parse(rest[0])
        });
        console.log(
          `Chat ${result.chat} für ${result.repo} eingetragen: ${result.tickets.join(', ')}`
        );
        console.log(`Aktive Chats: ${result.aktiv} von ${result.max}`);
        if (result.ueber_limit) {
          console.log(
            'Über der Grenze aus config.maxParallelChats — vor dem nächsten Start "chats" prüfen.'
          );
        }
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
