# Scraude — Claude Code Plugin für Scrum-Ticket-Boards — Vollständiger Plan

## 1. Vision

Ein Claude Code Plugin, das während der Arbeit mit Claude entstehende Nebenthemen
auffängt, sie als Tickets strukturiert, in Sprints organisiert und den
Umsetzungs-Workflow (Branch → Arbeit → Review → Merge → nächstes Ticket) aktiv
begleitet. Kein generisches Ticketsystem — sondern eines, das an die Art
angepasst ist, wie man tatsächlich mit Claude arbeitet.

Zielgruppe v1: Einzelentwickler / kleine Teams, die direkt mit Claude Code
arbeiten. Verteilung über die Claude Code Plugin-Marketplace.

---

## 2. Kernprinzipien

1. **Sprint-Lock**: Ist ein Sprint aktiv, kommen keine neuen Tickets hinein.
   Alles Neue geht ins Backlog, unabhängig davon, wie dringend es wirkt.
2. **Passiv/Aktiv-Meldung**:
   - Taucht während eines laufenden Tickets ein Nebenthema auf, das **nichts**
     mit dem aktuellen Ticket zu tun hat → **passiv**: stillschweigend als
     Backlog-Ticket anlegen, keine Unterbrechung.
   - Überschneidet sich das Nebenthema **fachlich** mit dem laufenden Ticket
     (gleiche Datei, gleiche Komponente, blockiert die aktuelle Aufgabe)
     → **aktiv**: sofort melden, ggf. direkt mitnehmen.
3. **Ein Branch pro Ticket**, Naming-Konvention `feature/T-<id>-<slug>`.
4. **Merge-Freigabe liegt beim User** — Claude merged nie automatisch ohne
   explizite Freigabe. Konkret läuft das über eine **echte Pull/Merge
   Request** auf der Plattform (`gh pr create` bei GitHub, `glab mr create`
   bei GitLab), nicht über einen lokalen Merge im Terminal — Review passiert
   dort, wo ohnehin schon Diff-Ansicht, Kommentare und CI-Checks vorhanden
   sind. Freigabe = PR wird approved/gemerged, kein separates "du kannst
   mergen" im Chat nötig.
5. **Sprints sind keine Zeiträume**, sondern feste Ticket-Sets, die gemeinsam
   geplant wurden. Ende = alle Tickets im Sprint sind gemerged.
6. **Token-Effizienz vor Gesprächigkeit**: Claude wird nur für Aufgaben
   eingesetzt, die echtes Urteilsvermögen brauchen (Feature-Zuschnitt,
   Priorisierung, passiv/aktiv-Entscheidung). Alles Mechanische — Status
   setzen, Branch-Namen parsen, Board rendern — läuft über Skripte, ohne
   Claude dafür zu involvieren. Ziel: minimaler Kontext-Verbrauch bei
   maximaler Ergebnisqualität dort, wo es auf Urteilsvermögen ankommt.
7. **Ein aktives Ticket, dringende Fälle pausieren statt blockieren**:
   Normalerweise ist genau ein Ticket `in_progress`. Kommt ein dringender
   Fall dazwischen (Hotfix o. ä.), wird das laufende Ticket auf `paused`
   gesetzt statt es abzubrechen — Branch und Kontext bleiben erhalten, das
   neue Ticket startet regulär. `/ticket-resume` nimmt danach das zuletzt
   pausierte Ticket wieder auf.
8. **Review-fokussierte Zusammenarbeit**: Der Kontrollpfad (User prüft und
   merged) funktioniert nur, wenn PRs überschaubar bleiben. Deshalb:
   - Ticket-Zuschnitt orientiert sich von Anfang an an einem überschaubaren
     Diff, nicht nur an fachlicher Logik. Wächst der Scope während der
     Arbeit erkennbar über das hinaus, wird ein Folge-Ticket abgespalten
     statt alles in einen PR zu packen.
   - Am Ende jedes Tickets liefert Claude vor der Review-Anfrage eine kurze
     Zusammenfassung: was geändert wurde, warum, und welche Stellen gezielt
     geprüft werden sollten (unsichere Annahmen, Edge Cases, Bereiche mit
     erhöhtem Fehlerrisiko) — damit begrenzte Review-Zeit dort ankommt, wo
     sie am meisten bringt.
9. **Standup-Äquivalent statt stillem Wiedereinstieg**: Claude-Code-Sessions
   sind zustandslos — ohne Hilfe müsste der User bei jeder neuen Session
   selbst rekonstruieren, wo alles steht. Zu Sessionbeginn (per `/standup`
   oder automatisch, falls technisch möglich) liefert Scraude daher eine
   kurze Lagemeldung: was seit der letzten Session passiert ist, was gerade
   läuft oder pausiert ist, was als Nächstes ansteht, und ob etwas blockiert.
10. **Definition of Ready / Definition of Done**: Zwei feste Checklisten
    statt Bauchgefühl.
    - **Ready** (Voraussetzung für `/ticket-start`): Beschreibung ist
      eigenständig verständlich, Ticket ist nicht durch offene `blockiert_von`
      blockiert, Größe grob geschätzt.
    - **Done** (Voraussetzung für die Review-Anfrage): keine offenen
      TODO-Kommentare im Diff, Diff passt zur geschätzten Größe (siehe
      Kernprinzip 8), Review-Zusammenfassung liegt vor. Bei Spike-Tickets
      (siehe Datenmodell) ersetzt "Erkenntnisse dokumentiert" das übliche
      Done-Kriterium.
11. **Bullet-Listen statt Absätze für alles, was der User lesen/prüfen muss**:
    Überall dort, wo eine Antwort eine Aktion des Users erfordert oder von
    ihm geprüft werden soll — Review-Zusammenfassung, Standup, Sprint-
    Vorschlag, Mini-Retro — wird in kurzen, knackigen Bullet-Punkten
    ausgegeben, nicht in Fließtext-Absätzen. Ziel: schnelles Erfassen statt
    Lesen-müssen. Reine Erklärungen ohne Handlungsbezug dürfen weiterhin
    Fließtext sein.

---

## 3. Datenmodell

Alles lebt in einer Datei im Repo: `.claude/board.json`.

**Nicht versioniert** (Entscheidung nach dem End-to-End-Test, siehe README):
die Datei ändert sich bei fast jeder Aktion und würde versioniert jeden
Branch-Wechsel blockieren, jeden PR mit Board-Rauschen füllen und bei jedem
Merge im selben File kollidieren. `/board-init` trägt sie deshalb in die
`.gitignore` ein. Für die Zielgruppe von v1 — Einzelentwickler — ist das
Board Arbeitsstand, nicht Projektinhalt. `SCRAUDE_BOARD` überschreibt den
Pfad, falls das Board später doch geteilt werden soll.

```json
{
  "tickets": {
    "T-014": {
      "title": "Login-Formular: Client-seitige Validierung",
      "beschreibung": "Kontext + konkrete Aufgabe, ausreichend detailliert um direkt starten zu können",
      "status": "backlog",
      "typ": "feature",
      "groesse": "M",
      "herkunft": "manuell",
      "prioritaet": 3,
      "sprint_id": null,
      "branch": null,
      "pr_url": null,
      "ueberschneidet_mit": [],
      "blockiert_von": [],
      "erstellt_waehrend": null,
      "erstellt_am": "2026-08-12T10:00:00Z",
      "notizen": []
    }
  },
  "sprints": {
    "S-03": {
      "status": "planning",
      "tickets": [],
      "erstellt_am": "2026-08-12T10:00:00Z",
      "abgeschlossen_am": null
    }
  },
  "aktueller_sprint": "S-03",
  "aktuelles_ticket": null,
  "pausierte_tickets": []
}
```

**Ticket-Status-Werte**: `backlog` → `sprint` → `in_progress` → `paused` (optional, zurück zu `in_progress`) → `review` → `done`

**Sprint-Status-Werte**: `planning` → `active` → `closed`

**`typ`**: `feature` | `bug` | `chore` | `spike`. Ein `spike` ist ein reines
Recherche-Ticket ohne festen Code-Deliverable — zeitlich statt inhaltlich
begrenzt, "done" heißt hier "Erkenntnisse dokumentiert", nicht "gemerged".

**`groesse`**: `S` | `M` | `L`, grobe Schätzung statt Story Points. Dient als
messbarer Auslöser für Kernprinzip 8: wächst der tatsächliche Diff erkennbar
über die geschätzte Größe hinaus, ist das das Signal zum Splitten.

`blockiert_von`: Liste von Ticket-IDs, die zuerst fertig sein müssen. Wird bei
`/ticket-start` geprüft — ein blockiertes Ticket wird nicht als "nächstes"
vorgeschlagen, solange die Blocker nicht `done` sind.

`pr_url`: Wird gesetzt, sobald der Status auf `review` wechselt — Claude
pusht den Branch und erstellt die PR/MR per `gh pr create` bzw.
`glab mr create` (Kernprinzip 4). Kein Plattform-Zugang konfiguriert? Dann
Fallback auf lokalen Merge nach Chat-Freigabe, `pr_url` bleibt `null`.

---

## 4. Workflow / State Machine

**Session-Einstieg** (Kernprinzip 9): `/standup` fasst zusammen, was seit der
letzten Session passiert ist, was aktuell läuft/pausiert ist und was blockiert
— bevor es in den eigentlichen Zyklus geht.

```
Design/Anforderung eingereicht
        │
        ▼
Feature-Tickets erstellt (Backlog, priorisiert)
        │
        ▼
Sprint geplant (Tickets fixiert, Status → active)
        │
        ▼
Ticket in Arbeit (Branch erstellt, Status → in_progress)
   │         ↑
   │         │ (nächstes Ticket im Sprint)
   ▼         │
Review & Merge (User gibt frei, Status → done)
        │
        ▼ (wenn alle Sprint-Tickets done)
Sprint abgeschlossen (Status → closed)
        │
        └──► zurück zu "Sprint geplant" (neuer Sprint aus Backlog)
```

Während "Ticket in Arbeit": neue Themen werden passiv oder aktiv behandelt
(siehe Kernprinzip 2), landen aber **immer im Backlog**, nie im aktiven Sprint.

Kommt während der Arbeit ein dringender Fall dazwischen, wird das laufende
Ticket auf `paused` gesetzt (siehe Kernprinzip 7), statt den Zyklus zu
unterbrechen — nach Erledigung des dringenden Falls geht es an genau der
Stelle weiter.

**Vor der Review-Anfrage** (Kernprinzip 8): kurze Zusammenfassung statt
nacktem Diff — was geändert wurde, warum, und welche Stellen gezielt
gegengeprüft werden sollten. Ziel: der Diff selbst bleibt so klein, dass er
ohne diese Hilfe schon prüfbar wäre; die Zusammenfassung lenkt zusätzlich auf
die riskanteren Stellen.

**Mini-Retro bei Sprint-Ende**: `/sprint-close` liefert automatisch eine
kurze Zusammenfassung, generiert aus `board.json` (kein Claude-Aufruf nötig):
Anzahl abgeschlossener Tickets, wie viele davon passiv bzw. aktiv entstanden
sind, und das Alter des ältesten offenen Backlog-Tickets — als Entscheidungs-
grundlage für die nächste Sprint-Planung.

**Backlog Refinement**: Kein eigener Command, sondern ein kurzer Schritt zu
Beginn von `/sprint-plan` — offensichtliche Duplikate zusammenführen, nicht
mehr relevante Tickets zum Schließen vorschlagen, bevor priorisiert wird.
Reduziert die Wahrscheinlichkeit, dass das Backlog nur wächst statt gepflegt
zu werden.

---

## 5. Plugin-Architektur

```
scraude/
├── .claude-plugin/
│   ├── plugin.json          # Metadaten (name: "scraude", Version, Beschreibung)
│   └── marketplace.json     # Für die Marketplace-Auflistung
├── skills/
│   ├── board-management/    # Kernlogik: wann/wie Tickets angelegt werden
│   ├── board-init/          # /board-init — Board initialisieren
│   ├── standup/             # /standup — Lagemeldung zu Sessionbeginn
│   ├── board/               # /board — aktuellen Stand anzeigen
│   ├── ticket-new/          # /ticket-new — manuell Ticket anlegen
│   ├── ticket-start/        # /ticket-start — Branch erstellen, Ticket starten
│   ├── ticket-resume/       # /ticket-resume — pausiertes Ticket fortsetzen
│   ├── ticket-review/       # /ticket-review — Definition of Done, PR erstellen
│   ├── sprint-plan/         # /sprint-plan — Refinement + Sprint planen
│   └── sprint-close/        # /sprint-close — Sprint abschließen, Mini-Retro
├── scripts/
│   ├── board-store.js       # Zugriffsschicht auf board.json
│   ├── board-render.js      # Markdown-Tabelle aus board.json generieren
│   ├── post-merge-check.js  # Git-Hook-Logik: Ticket nach Merge auf done
│   └── install-git-hook.js  # installiert .git/hooks/post-merge
└── README.md
```

**Commands sind Skills.** `${CLAUDE_PLUGIN_ROOT}` wird laut Plugin-Referenz
nur in Skill- und Agent-Inhalten ersetzt, nicht in `commands/*.md` — ein
Command könnte die gebündelten Skripte also gar nicht adressieren. Da Custom
Commands ohnehin in Skills aufgegangen sind (`commands/x.md` und
`skills/x/SKILL.md` erzeugen beide `/x`), liegt jeder Command als Skill vor.
Nebeneffekt: über `allowed-tools` laufen die Skripte ohne Permission-Prompt.

Die Command-Skills tragen `disable-model-invocation: true` — sie haben
Seiteneffekte und sollen nur der User auslösen. `board-management` ist
umgekehrt `user-invocable: false`: reines Hintergrundwissen.

## 6. Skill: `board-management`

Der zentrale Skill, der Claude während jeder Session daran erinnert:

- Beim Erkennen eines Nebenthemas: prüfen, ob es sich mit dem aktuellen
  Ticket (`aktuelles_ticket` in board.json) überschneidet → aktiv/passiv
  entscheiden.
- Vor dem Anlegen eines Tickets: Beschreibung so formulieren, dass sie
  eigenständig verständlich ist (kein "das von vorhin") — aber kompakt in
  Stichpunkten statt Prosa. Genug Kontext zum Starten, nichts Überflüssiges.
- Bei `/board` und routinemäßigen Sprint-Übersichten nur Titel, Status und
  Priorität in den Kontext laden, nicht die vollen Beschreibungen — die
  werden erst beim tatsächlichen Start eines Tickets vollständig gebraucht.
- Nie Tickets in einen `active`-Sprint schieben, auch nicht auf Zuruf,
  sondern nachfragen: "Soll das ins Backlog, oder brichst du den Sprint-Lock
  bewusst?"
- Vor dem Vorschlagen eines "nächsten Tickets": `blockiert_von` prüfen.
  Sind Blocker noch nicht `done`, wird das Ticket übersprungen und das
  nächste priorisierte, unblockierte Ticket vorgeschlagen.
- Bei `/sprint-plan`: älteste offene Backlog-Tickets (nach `erstellt_am`)
  kurz hervorheben, damit passiv entstandene Tickets nicht endlos liegen
  bleiben, ohne dass Claude sie aktiv nachverfolgen muss — reiner
  Hinweis, keine automatische Priorisierung.
- Während der Arbeit an einem Ticket: laufend im Blick behalten, ob der
  Diff noch überschaubar ist. Wird der Scope erkennbar größer als
  ursprünglich geschnitten, aktiv melden und ein Folge-Ticket vorschlagen,
  statt einfach weiterzumachen.
- Vor jeder Review-Anfrage: kurze Zusammenfassung liefern (Was, Warum,
  worauf besonders achten) statt den User direkt vor den rohen Diff zu
  setzen.
- Vor `/ticket-start`: Definition of Ready prüfen (Kernprinzip 10) —
  Beschreibung eigenständig verständlich, keine offenen Blocker, Größe
  geschätzt. Fehlt etwas, erst nachschärfen statt trotzdem zu starten.
- Vor der Review-Anfrage zusätzlich: Definition of Done prüfen — bei
  `typ: "spike"` zählt dokumentierte Erkenntnis statt fertigem Code als
  Abschluss.
- Zu Beginn von `/sprint-plan`: kurzer Refinement-Blick übers Backlog
  (offensichtliche Duplikate, nicht mehr relevante Tickets), bevor
  priorisiert wird.
- Formatregel (Kernprinzip 11): Review-Zusammenfassung, Standup, Sprint-
  Vorschlag und Mini-Retro immer als kurze Bullet-Punkte ausgeben, nie als
  Absatz-Text — der User soll es überfliegen können, nicht lesen müssen.

---

## 7. Slash Commands (v1)

Neun statt der ursprünglich geplanten acht: `/ticket-review` kam dazu, weil
der Übergang `in_progress → review` samt Definition of Done und PR-Erstellung
sonst in keinem Command ein Zuhause hatte.

| Command | Zweck |
|---|---|
| `/board-init` | Initialisiert `board.json` (inkl. `.gitignore`-Eintrag), installiert den post-merge-Hook, prüft die Branch-Namenskonvention. Heißt nicht `/init` — das ist ein eingebauter Claude-Code-Command |
| `/standup` | Lagemeldung: was seit letzter Session passiert ist, was läuft/pausiert, was blockiert |
| `/board` | Zeigt aktuellen Board-Stand als Markdown-Tabelle |
| `/ticket-new "<Titel>"` | Legt manuell ein Ticket im Backlog an (inkl. Typ, grobe Größe) |
| `/sprint-plan` | Kurzes Backlog Refinement, dann priorisierte Tickets für neuen Sprint vorschlagen (inkl. Hinweis auf älteste Tickets), User bestätigt |
| `/ticket-start T-014` | Prüft Definition of Ready, erstellt Branch, setzt Status auf `in_progress`. Läuft bereits ein Ticket, wird dieses auf `paused` gesetzt |
| `/ticket-resume` | Nimmt das zuletzt pausierte Ticket wieder auf |
| `/ticket-review` | Prüft Definition of Done, liefert die Review-Zusammenfassung, pusht den Branch und erstellt PR/MR |
| `/sprint-close` | Prüft, ob alle Sprint-Tickets `done` sind, schließt Sprint, liefert Mini-Retro |

---

## 8. Hooks

**post-merge Hook**: Ein echter Git-Hook (`.git/hooks/post-merge`), den
`/board-init` installiert — kein Claude-Code-Hook. Der native post-merge
feuert exakt dann, wenn ein Merge stattgefunden hat, egal ob lokal gemerged
oder nach `git pull` einer auf der Plattform gemergten PR. Ein
PostToolUse-Hook auf Bash würde dagegen nach jedem einzelnen Bash-Aufruf
feuern, um fast immer nichts zu tun. Läuft komplett als deterministisches
Skript, ohne Claude-Aufruf — reines Parsen und JSON-Update, kein
Token-Verbrauch:
- Setzt Ticket-Status auf `done`
- Leert `aktuelles_ticket`
- Prüft: nächstes Ticket im aktiven Sprint vorhanden? → schlägt automatisch
  `/ticket-start` für das nächstpriorisierte vor (kein Auto-Start ohne
  Bestätigung, siehe Kernprinzip 4)

Einschränkung: `${CLAUDE_PLUGIN_ROOT}` ändert sich bei einem Plugin-Update,
der installierte Hook zeigt dann auf den alten Pfad. `/board-init` muss danach
einmal erneut laufen; der Hook meldet das von selbst.

**PR-Erstellung**: Beim Übergang auf `review` pusht Claude den Branch und
erstellt die PR/MR über die vorhandene `gh`/`glab` CLI (kein eigener
API-Client nötig, keine zusätzliche Auth-Konfiguration — nutzt die ohnehin
vorhandene Anmeldung des Users). `pr_url` wird in `board.json` gespeichert
und taucht in `/board` als Link auf.

**board-render.js**: Generiert die Markdown-Tabelle für `/board` direkt aus
`board.json` per Skript. Claude wird für die reine Anzeige nicht involviert —
nur wenn der User zusätzlich eine Einschätzung oder Empfehlung dazu will.

---

## 9. Verteilung / Marketplace

- `plugin.json`: Name `scraude`, Version, Beschreibung, Keywords (z. B.
  "scrum", "kanban", "ticket", "workflow" — wichtig für Auffindbarkeit)
- `marketplace.json`: Auflistung für eigene oder die offizielle Marketplace
- Versionierung über Git-Tags/SHA, damit Updates kontrolliert ausgerollt
  werden können

---

## 10. Rollout-Phasen

**v1 (MVP)** — komplett selbstständig, keine externen Abhängigkeiten außer
optional vorhandenem `gh`/`glab`:
- `board.json` im Repo, Markdown-Rendering über `/board`
- Alle 8 Commands, post-merge Hook, Skill für passiv/aktiv-Logik, Pause/Resume,
  Mini-Retro, Standup, Definition of Ready/Done, Backlog Refinement
- Echte PR/MR-Erstellung bei Review-Übergang (`gh pr create` / `glab mr
  create`), mit lokalem Merge als Fallback ohne Plattform-CLI

**v2** — optionale Integrationen:
- MCP-Adapter für GitHub Issues (Sync statt Ersatz — `board.json` bleibt
  Quelle der Wahrheit, Issues werden gespiegelt; PR-Erstellung selbst läuft
  schon seit v1 nativ über `gh`/`glab`)
- Gleiches Muster optional für GitLab/Jira, nur bei Bedarf

**v3** — bessere Visualisierung:
- Eigene kleine Web-Oberfläche (lokaler Server) statt reinem
  Markdown-Rendering, falls das MVP-Feedback das rechtfertigt

---

## 11. Offene Punkte

- ~~Wie genau erkennt der post-merge Hook, welcher Branch zu welchem Ticket
  gehört?~~ Geklärt: feste Naming-Konvention, strikt erzwungen —
  `feature/T-<id>-*`. `/ticket-start` erstellt den Branch immer in diesem
  Format, der Hook parst die Ticket-ID direkt aus dem Branch-Namen.
- ~~Was passiert, wenn während `/sprint-plan` das Backlog leer ist?~~ Geklärt:
  dann sind wir fertig — es werden keine weiteren Aufgaben gemacht, bis neue
  Anforderungen reinkommen.
- ~~Soll `/ticket-start` bei mehreren offenen Tickets im Sprint eine Reihenfolge
  vorschlagen (Priorität) oder freie Wahl lassen?~~ Geklärt: nach Priorität —
  `/ticket-start` ohne Ticket-ID startet automatisch das höchstpriorisierte
  offene Ticket im aktiven Sprint.
- ~~Konfliktfall: User will Sprint-Lock bewusst brechen — braucht es einen
  expliziten Override-Command wie `/sprint-break-lock T-020`, um das nicht
  versehentlich zuzulassen?~~ Geklärt: kein eigener Override-Command nötig.
  Das Ticket wird ganz normal angelegt und als hohe Priorität markiert — der
  Sprint-Lock selbst bleibt bestehen (es rutscht nicht in den aktiven Sprint),
  ist damit aber automatisch ganz oben für die nächste Sprint-Planung
  vorgemerkt.

---

## 12. Implementierungsplan

Reihenfolge nach Abhängigkeiten — jede Stufe baut auf der vorherigen auf,
nicht auf Zuruf oder Lust, sondern weil spätere Teile ohne die früheren
nicht sinnvoll getestet werden können.

**1. Datenmodell + Zugriffsschicht**
Fundament, auf das alles andere zugreift: `board.json`-Struktur plus kleine,
getestete Funktionen zum Lesen/Schreiben (Ticket anlegen, Status ändern,
Sprint wechseln). Fehler hier pflanzen sich sonst durch alles andere fort.

**2. Deterministische Skripte**
`board-render.js`, Blocker-Check, Alters-Berechnung — die reinen Funktionen
ohne Claude-Beteiligung (Kernprinzip 6). Isoliert bau- und testbar, bevor
irgendein Command sie aufruft.

**3. Commands, in aufsteigender Komplexität**
- `/init` zuerst — ohne den geht nichts los
- `/board`, `/ticket-new`, `/standup` — reine Lese-/einfache Schreiboperation
- `/ticket-start`, `/ticket-resume` — brauchen schon Git-Interaktion, plus
  Definition-of-Ready-Prüfung
- `/sprint-plan`, `/sprint-close` — komplexeste Logik (Refinement,
  Priorisierung, Blocker-Check, Definition of Done, Retro), kommt zuletzt,
  weil sie auf allem anderen aufbaut
- PR-Erstellung (`gh`/`glab`) direkt an den Review-Übergang anschließen,
  sobald `/ticket-start` und Definition of Done stehen

**4. Hook (post-merge)**
Ergibt erst Sinn, wenn Commands stabil laufen — der Hook reagiert auf
Zustände, die die Commands erzeugen.

**5. Skill (`board-management`)**
Bewusst zuletzt. Der Skill ist die "Wann mache ich was"-Ebene für Claude
selbst (passiv/aktiv, Scope-Kontrolle, Review-Zusammenfassung) — ergibt erst
Sinn, wenn die Werkzeuge, die er orchestriert, schon funktionieren.

**6. End-to-End-Testlauf**
Den Use Case von Abschnitt 1 komplett durchspielen — Design rein, Tickets
raus, Sprint planen, Ticket starten, pausieren, fortsetzen, mergen, Retro.
In einem Test-Repo, nicht im echten Projekt.

**7. Packaging & stiller Release**
`marketplace.json` bauen, erstmal in einer eigenen, privaten Marketplace zum
Selbsttest — bevor es öffentlich sichtbar wird.

**Dogfooding-Hinweis**: Sobald `/ticket-new` und `/board` laufen (Ende von
Stufe 3), können die restlichen Baustellen (Hook, Skill, Packaging) direkt
als Tickets im eigenen Board landen. Scraude entwickelt sich damit ein Stück
weit selbst.
