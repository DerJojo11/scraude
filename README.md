<div align="center">

**Deutsch** · [English](README.en.md)

<img src="assets/logo.svg" width="112" height="112" alt="">

# Scraude

**Scrum für die Arbeit mit Claude Code.**
Aufgaben rein, Tickets raus, ein PR pro Ticket — und kein Nebenthema geht mehr verloren.

[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-D97757)](https://code.claude.com/docs/en/plugins)
[![Version](https://img.shields.io/badge/version-0.3.0-blue)](.claude-plugin/plugin.json)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-green)](LICENSE)
![Sprache: Deutsch](https://img.shields.io/badge/Sprache-Deutsch-lightgrey)

[Installation](#installation) · [Schnellstart](#schnellstart) · [So funktioniert's](#so-funktionierts) · [Befehle](#befehle) · [Konfiguration](#konfiguration) · [FAQ](#faq)

</div>

---

## Das Problem

Claude Code schreibt zuverlässig Code. Was fehlt, ist alles drumherum: der
Überblick, der Zuschnitt, die Disziplin über mehrere Sessions hinweg.

| | Ohne Board | Mit Scraude |
|---|---|---|
| **Nebenthema fällt auf** | landet im selben Riesen-PR oder ist nach der Session vergessen | wird als Backlog-Ticket notiert, ohne dich zu unterbrechen |
| **Neue Session** | „Wo war ich? Was ist offen?" | der Board-Stand liegt beim Start im Kontext |
| **Umbenennen in 40 Dateien** | dasselbe große Modell wie für eine Race Condition | mechanische Tickets laufen auf einem kleineren Modell |
| **Review** | der rohe Diff, so gründlich wie die Zeit gerade reicht | ein zweiter Agent prüft vorher gegen die Ticket-Beschreibung |
| **Scope** | wächst, bis der PR nicht mehr prüfbar ist | Tickets sind auf reviewbare Diffs geschnitten, Scope-Zuwachs wird gemeldet |

Nichts davon ist ein Claude-Problem. Es ist das, was in einem Team sonst das
Board erledigt — und genau das fehlt, wenn man allein mit einem Agenten
arbeitet.

## Die Lösung

Scraude bringt einen schlanken Scrum-Ablauf direkt in Claude Code, ohne
externes Tool, ohne Account, ohne Server:

| | |
|---|---|
| 🧩 **Ein Einstieg** | `/scraude "<Aufgabe>"` zerlegt die Aufgabe in Tickets mit Abhängigkeiten und schlägt den ersten Sprint vor. Du bestätigst einmal. |
| 🔒 **Sprint-Lock** | Läuft ein Sprint, kommt nichts Neues mehr hinein. Alles Neue landet im Backlog, egal wie dringend es wirkt. |
| 🪝 **Nebenthemen auffangen** | Hat es mit dem laufenden Ticket nichts zu tun, wird es still als Backlog-Ticket notiert. Betrifft es das laufende Ticket, meldet Claude es sofort. |
| 🌿 **Ein Branch, ein PR pro Ticket** | `feature/T-<id>-<slug>`, PR über `gh` oder `glab`. Die Tickets sind von Anfang an so geschnitten, dass der Diff reviewbar bleibt. |
| 🧠 **Das passende Modell** | Jedes Ticket trägt eine Komplexität. Einfache Tickets übernimmt ein Subagent mit einem kleineren Modell, schwierige bleiben im Dialog mit dir. |
| 🔍 **Vor-Review durch einen zweiten Agenten** | Bevor du den Diff siehst, prüft ein eigener Agent ihn gegen die Ticket-Beschreibung. Mechanisch Eindeutiges behebt er in einem eigenen Commit, den Rest meldet er dir. |
| ☀️ **Standup bei Sessionbeginn** | Ein Hook legt den Board-Stand automatisch in den Kontext. Claude weiß sofort, wo es weitergeht. |
| 🧵 **Mehrere Repos, frische Chats** | Ein Koordinator-Chat verteilt den Sprint auf je einen Chat pro Repo — pro Sprint neu gestartet, mit einem Briefing aus dem Board statt eines langen Verlaufs. |
| 🎨 **Design vor Code** | Ändert ein Ticket etwas Sichtbares, entsteht der Entwurf zuerst im Design-Board und wird mit dir abgestimmt. Das festgelegte Fundament — Farben, Textstile, Komponenten — liegt in jedem Briefing. |
| ✅ **Du behältst die Kontrolle** | Claude merged nie selbst. PRs, Merges und das Schließen eines Sprints brauchen immer deine Freigabe. |

---

## Installation

Scraude wird als eigener Plugin-Marketplace direkt aus diesem Repo
installiert. In einer Claude-Code-Session:

```
/plugin marketplace add DerJojo11/scraude
/plugin install scraude@scraude-marketplace
```

Oder im Terminal:

```bash
claude plugin marketplace add DerJojo11/scraude
```

```bash
claude plugin install scraude@scraude-marketplace
```

### Voraussetzungen

- [Claude Code](https://code.claude.com)
- **Node.js** — die gebündelten Skripte laufen mit `node`, ohne
  npm-Abhängigkeiten
- **Git** — Scraude arbeitet mit Branches und einem `post-merge`-Hook
- *optional:* [`gh`](https://cli.github.com) oder
  [`glab`](https://gitlab.com/gitlab-org/cli), angemeldet, für echte
  Pull/Merge Requests. Fehlen beide, merged Scraude lokal, sobald du im
  Chat zustimmst.

---

## Schnellstart

**1. Board im Projekt anlegen**

```
/scraude:board-init
```

Legt `.claude/board.json` an, trägt sie in die `.gitignore` ein und
installiert den `post-merge`-Hook.

**2. Aufgabe hereingeben**

```
/scraude "Notizen-Feature: Datenmodell, REST-API und Editor im Frontend, offline-fähig"
```

Statt eines Pfads oder Links zu einem Design geht auch Freitext. Claude
zerlegt die Aufgabe, setzt Abhängigkeiten und Prioritäten und legt dir
Ticket-Schnitt **und** Sprint-Vorschlag in einer Liste vor.

**3. Bestätigen — der Rest läuft**

Nach deiner Bestätigung startet das erste Ticket auf einem eigenen Branch.
Ab jetzt ist Scraude ein **Modus**: Du arbeitest normal mit Claude, und der
Ablauf greift von selbst, auch in der nächsten Session.

**4. Board ansehen**

```
/scraude:board
```

```markdown
## BACKLOG (1)

| ID    | Titel                       | Typ     | Prio | Größe | A/K          | Alter  |
|-------|-----------------------------|---------|------|-------|--------------|--------|
| T-005 | Dark Mode für Einstellungen | feature | 4    | S     | sehr_niedrig | 0 Tage |

## SPRINT S-01 (active) — 0/4 fertig

| ID    | Titel                         | Status      | PR |
|-------|-------------------------------|-------------|----|
| T-001 | Datenmodell für Notizen       | sprint      | —  |
| T-002 | Spike: Sync-Strategie offline | in_progress | —  |
| T-003 | REST-Endpunkte für Notizen    | sprint      | —  |
| T-004 | Notiz-Editor im Frontend      | sprint      | —  |
```

---

## So funktioniert's

```mermaid
flowchart TD
    A["Aufgabe / Design"] -->|/scraude| B["Tickets + Sprint-Vorschlag"]
    B -->|"✋ du bestätigst"| C["Sprint aktiv"]
    C --> D["Ticket startet<br/>Branch feature/T-id-slug"]
    D --> E{"Komplexität?"}
    E -->|"sehr niedrig / niedrig"| F["ticket-implementer<br/>kleineres Modell"]
    E -->|"mittel / hoch / sehr hoch"| G["Hauptthread<br/>im Dialog mit dir"]
    F --> H["Vor-Review<br/>ticket-reviewer"]
    G --> H
    H --> I["Review-Zusammenfassung + PR"]
    I -->|"✋ du mergst"| J["post-merge-Hook:<br/>Ticket → done"]
    J -->|"nächstes Ticket"| D
    J -->|"Sprint fertig"| K["/sprint-close<br/>Mini-Retro"]
    K -->|/sprint-plan| C
```

### Was automatisch läuft und was nicht

Ob etwas automatisch läuft, hängt nicht davon ab, wie wichtig es ist,
sondern davon, ob man es **rückgängig machen kann** und ob es **nach außen
sichtbar** ist.

| Läuft ohne Rückfrage | Braucht deine Bestätigung |
|---|---|
| Ticket starten, Branch anlegen | Ticket-Schnitt beim Intake |
| Nebenthemen als Tickets erfassen | PR / MR erstellen |
| Statuswechsel auf dem Board | Merge (macht Claude nie selbst) |
| Vor-Review samt Korrektur-Commit | Sprint schließen |
| Definition of Ready / Done prüfen | Scope aufteilen, Folge-Ticket abspalten |
| Nach dem Merge mit dem nächsten Ticket weitermachen | Sprint-Lock brechen |

### Modellwahl nach Komplexität

Jedes Ticket hat zwei getrennte Schätzungen: `groesse` (wie viel Diff,
also wie viel Review-Aufwand) und `komplexitaet` (wie schwer die Aufgabe
gedanklich ist). Ein Feld in 40 Dateien umzubenennen ist *groß, aber
trivial*. Eine Race Condition zu beheben ist *klein, aber heikel*.

| `komplexitaet` | Modell (Vorgabe) | Effort | Wer setzt um |
|---|---|---|---|
| `sehr_niedrig` | haiku | low | Subagent `ticket-implementer` |
| `niedrig` | sonnet | low | Subagent `ticket-implementer` |
| `mittel` | sonnet | medium | Hauptthread |
| `hoch` | opus | high | Hauptthread, Hinweis auf `/model` |
| `sehr_hoch` | opus | xhigh | Hauptthread, Hinweis auf `/model` |

Stellt sich ein Ticket als schwerer heraus als geschätzt, **bricht der
Implementer ab und meldet es**, statt sich durchzumogeln. Die Bewertung wird
im Ticket korrigiert, und die Arbeit geht im Hauptthread weiter.

Die Zuordnung steht im Board unter `modelle` und lässt sich pro Projekt
anpassen, ohne das Plugin anzufassen.

### Vor-Review ohne Freifahrtschein

Der `ticket-reviewer` hat den Implementierungsverlauf nicht gesehen, und
genau das ist gewollt. Er prüft, was ein generischer Code-Review nicht
prüfen kann:

- Deckt der Diff die Ticket-Beschreibung ab?
- Ist Scope hineingekrochen?
- Passt der Umfang zur geschätzten Größe?

Er gibt **bewusst kein Urteil** ab: kein „sieht gut aus“, keine Freigabe.
Sein Bericht soll deinen Review gezielter machen, nicht ersetzen.

### Mehrere Repos: frische Chats statt langer Verläufe

Hat ein Projekt mehrere Repos (App, Backend, Web), hält ein
**Koordinator-Chat** das Board und verteilt die Arbeit auf **je einen Chat
pro Repo**. Diese Chats laufen nicht über Sprints hinweg weiter — sie werden
pro Sprint neu gestartet, weil ein langer Verlauf in jeder neuen Runde
mitgelesen wird und irgendwann teurer ist als die Arbeit selbst.

Damit ein frischer Chat ohne den alten Verlauf auskommt, baut Scraude sein
Briefing aus dem Board: Repo, Base-Branch, die Tickets mit Beschreibung,
vereinbarte Schnittstellen, deine Projektregeln, das Meldeformat — und den
Befehl, mit dem der Chat den Board-Stand selbst liest.

- Das Modell folgt der Komplexität des schwersten Tickets im Bündel.
- Höchstens `config.maxParallelChats` Chats laufen gleichzeitig (Standard 2);
  blockierte Tickets warten, auch wenn ein Platz frei wäre.
- Bricht ein Chat ab, briefet der Nachfolger auf demselben Branch weiter —
  den Stand liest er aus `git status`, nicht aus dem verlorenen Verlauf.
  Uncommittete Arbeit wird nie verworfen.
- Gemergte Tickets führen zum Archivieren ihres Chats, nach deiner
  Bestätigung. Mit `config.chatAbschlussSofort` passiert das ohne Rückfrage,
  sobald alle Tickets eines Chats erledigt sind. Wenn du `config.chatAbschluss` auf `loeschen` stellst, wird er
  stattdessen gelöscht — endgültig, deshalb nicht der Standard.

Durchgespielt an einem Beispiel mit zwei Repos:
[`examples/zwei-repos.md`](examples/zwei-repos.md).

### Design vor Code

Optional und standardmäßig aus. Erst wenn `config.design.tool` gesetzt ist,
kommt Design in Scraude überhaupt vor.

Der Kern ist `config.design.fundament`: die Zeilen, an die sich jedes Ticket
hält — aus welchem Token-Set Farben kommen, welche Textstile es gibt, welche
Komponenten verwendet werden. Sie stehen im Board und landen in jedem
Briefing, auch bei einem Repo-Chat ohne Zugang zum Design-Tool. Der Grund ist
nicht Ordnungsliebe: ein zweites Orange und ein zweiter Button-Radius
entstehen in fünf Minuten und sind danach in jedem Screen.

Ein Ticket, das etwas Sichtbares ändert, bekommt `design: true`. Damit ist es
so lange nicht startbar, bis der Entwurf steht:

```bash
node scripts/board-store.js check-ready T-001
# { "ready": false, "fehlt": ["Design noch nicht abgestimmt — design.board nicht gesetzt"] }
```

Das ist kein Mangel am Ticket, sondern die Reihenfolge: Entwurf im
Design-Board aus den vorhandenen Komponenten, als Bild in den Chat, deine
Anmerkungen als Kommentare ins Board — und erst dann Code.

```bash
node scripts/board-store.js update-ticket T-001 \
  '{"design":{"board":"03 Screens / Login","stand":"abgestimmt"}}'
```

Beim Review wird gegen den abgestimmten Stand und das Fundament geprüft; ist
`config.design.export_pfad` gesetzt, wandert ein Bild davon mit in den PR.
Ein Reviewer, der erst das Design-Tool öffnen muss, prüft das Design nicht.

---

## Befehle

Der Einstieg ist `/scraude`. Alle anderen Befehle lassen sich qualifiziert
(`/scraude:board`) oder kurz (`/board`) aufrufen. Die Kurzform geht, solange
kein anderes Plugin denselben Namen belegt.

| Befehl | Zweck |
|---|---|
| `/scraude "<Aufgabe>"` | Aufgabe zerlegen, Abhängigkeiten setzen, ersten Sprint vorschlagen |
| `/scraude:board-init` | Board anlegen, `.gitignore` ergänzen, `post-merge`-Hook installieren |
| `/scraude:board` | Board als Markdown-Tabelle anzeigen |
| `/scraude:standup` | Lagemeldung: was läuft, was pausiert, was blockiert, was als Nächstes kommt |
| `/scraude:ticket-new "<Titel>"` | Einzelnes Ticket im Backlog anlegen |
| `/scraude:sprint-plan` | Backlog aufräumen und den nächsten Sprint planen |
| `/scraude:ticket-start [T-<id>]` | Ticket starten; ohne ID das wichtigste nicht blockierte |
| `/scraude:ticket-resume` | Zuletzt pausiertes Ticket wieder aufnehmen |
| `/scraude:ticket-review [T-<id>]` | Vor-Review, Definition of Done, Zusammenfassung, PR |
| `/scraude:sprint-close` | Sprint abschließen, Mini-Retro |

Du musst diese Befehle nicht kennen. Sobald ein Board existiert, startet,
pausiert und erfasst Claude Tickets von selbst. Die Befehle sind
Einstiegspunkte und Ansichten.

### Darunter: `board-store.js`

Jede Zustandsänderung am Board hat einen benannten Befehl in einem
deterministischen Node-Skript — kein Token wird dafür verbrannt. Claude ruft
sie selbst auf; du brauchst sie nur, wenn du von Hand nachsehen oder etwas
geradeziehen willst.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board-store.js" <befehl>
```

| Befehl | Zweck |
|---|---|
| `get-board` | das Board als JSON |
| `create-ticket '<json>'` · `create-tickets '<json-array>'` | Tickets anlegen; mehrere auf einmal lösen Abhängigkeiten untereinander auf |
| `update-ticket T-001 '<json>'` | Felder ändern |
| `check-ready T-001` | Definition of Ready, mechanischer Teil |
| `impact` | wie viele Tickets hängen an jedem — die Zahl hinter der Spike-Priorität |
| `model-for [T-001]` | Modell und Effort für dieses Ticket |
| `next-ticket` · `start-ticket` · `resume-ticket` | nächstes unblockiertes Ticket, starten, fortsetzen |
| `review-ticket T-001 [<pr-url>]` · `finish-ticket T-001` | in den Review, nach dem Merge auf `done` |
| `plan-sprint '["T-001"]'` · `close-sprint [--force]` · `retro [S-01]` | Sprint fixieren, schließen, Zahlen ansehen |

Für Projekte mit mehreren Repos kommen vier dazu:

| Befehl | Zweck |
|---|---|
| `config ['<json>']` | Einstellungen zeigen, mit Argument ändern |
| `briefing <repo\|T-001 …> [--uebergabe]` | fertiges Briefing samt Modellempfehlung für einen frischen Repo-Chat |
| `chats` | wer arbeitet woran, wie viele Plätze sind frei, was wartet |
| `chat <id> <repo> '["T-001"]'` · `chat <id> limit\|fehler\|archiviert\|geloescht` | Chat eintragen, als gescheitert oder abgeschlossen vermerken |

Ohne Argument aufgerufen listet das Skript alle Befehle auf.

---

## Konfiguration

Alles Einstellbare steht im Board selbst, nicht im Plugin — eine Zeile
bearbeiten statt ein Release abwarten.

| Schlüssel | Vorgabe | Wofür |
|---|---|---|
| `modelle` | siehe Tabelle oben | Komplexität → Modell und Effort für Subagenten |
| `config.repos` | `{}` | Repo-Name → `pfad`, `base_branch`, `merge_stil`, `schnittstellen` |
| `config.maxParallelChats` | `2` | wie viele Repo-Chats gleichzeitig laufen dürfen |
| `config.chatMessageLimit` | `400` | ab wann ein Chat sein Ticket abschließt und keins mehr beginnt |
| `config.chatAbschluss` | `archivieren` | was mit einem fertigen Chat passiert; `loeschen` ist endgültig |
| `config.chatAbschlussSofort` | `false` | fertige Chats sofort und ohne Rückfrage archivieren (nie löschen) |
| `config.chat_modelle` | Sonnet bis `mittel`, darüber `inherit` | Modellwahl für einen ganzen Repo-Chat |
| `config.chat_sonnet_groessen` | `["XS","S"]` | bis zu welcher Größe `mittel` noch auf Sonnet läuft |
| `config.koordinator_chat` | — | Session-ID, an die Repo-Chats melden |
| `config.projektregeln` | `[]` | Zeilen aus CLAUDE.md, die in jedes Briefing gehören |
| `config.design` | `{tool: null, …}` | Design-Tool, Datei, Seite, `fundament` (die festen Regeln) und `export_pfad`. Ohne `tool` kommt Design in Scraude nicht vor |

```bash
node scripts/board-store.js config '{"maxParallelChats": 3}'
```

---

## Prinzipien

- **Sprints sind Ticket-Sets, keine Zeiträume.** Ein Sprint ist fertig, wenn
  alle seine Tickets gemerged sind.
- **Priorität heißt Risiko und Wert, nicht Reihenfolge.** Die Reihenfolge
  ergibt sich aus `blockiert_von`. Ein Spike, an dem fünf Tickets hängen,
  gehört nach vorn, und `board-store.js impact` rechnet das aus.
- **Ein Ticket aktiv, Dringendes pausiert.** Ein Hotfix unterbricht nichts:
  Das laufende Ticket wird pausiert, Branch und Kontext bleiben erhalten.
- **Definition of Ready / Done** als feste Checklisten statt Bauchgefühl.
- **Mechanisches läuft über Skripte.** Status setzen, Board rendern,
  Blocker prüfen: Das erledigen deterministische Node-Skripte, keine
  Tokens. Claude wird nur dort eingesetzt, wo Urteilsvermögen gefragt ist.
- **Stichpunkte statt Fließtext**, überall dort, wo du etwas prüfen oder
  entscheiden sollst.

Die vollständige Begründung jeder Entscheidung steht in
[`scrum-board-plugin-plan.md`](scrum-board-plugin-plan.md).

---

## Deine Daten

- Das Board ist eine einzige JSON-Datei: `.claude/board.json` in deinem
  Repo.
- Sie ist **bewusst nicht versioniert**. `/board-init` trägt sie in die
  `.gitignore` ein, damit sie nicht in jedem PR und jedem Merge auftaucht.
- Scraude spricht mit keinem Dienst. PRs laufen über deine vorhandene
  `gh`- bzw. `glab`-Anmeldung.
- Mit der Umgebungsvariable `SCRAUDE_BOARD` lässt sich der Pfad
  überschreiben, etwa für ein Board außerhalb des Repos.

---

## FAQ

**Muss ich Scrum kennen?**
Nein. Scraude übernimmt nur das, was bei der Arbeit mit Claude hilft:
Tickets, Sprints als feste Pakete, Standup, Retro. Meetings, Story Points
und Rollen gibt es nicht.

**Funktioniert es mit GitLab?**
Ja, über `glab mr create`. Ohne `gh` und ohne `glab` merged Scraude lokal,
sobald du im Chat zustimmst.

**Was passiert in Repos ohne Board?**
Nichts. Die Hooks bleiben stumm, solange kein `.claude/board.json` existiert.

**Kann ich Scraude im Team nutzen?**
Version 1 ist für Einzelentwickler gedacht, das Board ist lokaler
Arbeitsstand. Über `SCRAUDE_BOARD` lässt sich ein gemeinsamer Pfad setzen;
eine Merge-Strategie für gleichzeitige Änderungen gibt es aber noch nicht.

**Warum ist alles auf Deutsch?**
Scraude ist auf Deutsch entstanden, und Befehle, Ausgaben und Feldnamen sind
deutsch. Eine englische Version ist denkbar. Wenn du sie brauchst, schreib
ein Issue.

---

## Bekannte Einschränkungen

- **Nach einem Plugin-Update** zeigt der `post-merge`-Hook noch auf den alten
  Plugin-Pfad. `/scraude:board-init` einmal erneut ausführen, dann stimmt es
  wieder. Der Hook meldet das selbst.
- Der Hook erkennt Tickets am Branch-Namen `feature/T-<id>-…` im
  Merge-Commit. Bei **Squash- oder Rebase-Merges** ohne diesen Namen in der
  Commit-Nachricht wird das Ticket nicht automatisch auf `done` gesetzt.

---

## Mitmachen

Issues und Pull Requests sind willkommen. Wie das Plugin aufgebaut ist und
wie man es lokal testet, steht in [`docs/ENTWICKLUNG.md`](docs/ENTWICKLUNG.md).

## Lizenz

[MIT](LICENSE) © Johannes Alecke
