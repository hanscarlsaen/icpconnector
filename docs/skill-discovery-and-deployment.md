# Skill Discovery & DO Deployment — Noworkr

**Dato:** 2026-03-29
**Status:** Deployed og kørende på DO droplet

---

## Udgangspunkt

Vi havde en Telegram-bot (@Noworkr_bot) der kørte lokalt via ClaudeClaw + Claude Agent SDK. Brugeren kunne chatte med Claude via Telegram. Et Python-baseret lead generation skill (Apify → Google Sheets) lå klar i `skills/lead_generation/`, men Claude brugte **web search** i stedet for skill'et.

### Hvorfor det ikke virkede

Claude Code spawnes med `cwd=agents/noworkr/` og `settingSources: ['project', 'user']`. Det betyder Claude kun kan se filer i/under `agents/noworkr/`. Skill-koden lå i `skills/lead_generation/` på project root — helt udenfor Claudes synsfelt. Der var ingen SKILL.md, ingen instruktioner, intet der fortalte Claude at skill'et eksisterede.

Derudover havde `agents/noworkr/agent.yaml` hardcodede macOS-stier til Google credentials, hvilket ville fejle på en Linux-server.

---

## Hvad vi byggede

### 1. `scripts/run-skill.sh` — Universel skill-wrapper

Standardiseret invokation for alle skills. Claude kalder altid:

```bash
$PROJECT_ROOT/scripts/run-skill.sh <skill_name> '<json_input>'
```

Wrapperen:
- Læser `manifest.json` i skill-mappen for handler-type (`py`, `node`, `bash`)
- Sætter `SKILL_INPUT` env var med JSON input
- Kalder den rigtige handler (f.eks. `python3 handler.py`)
- Returnerer JSON til stdout som Claude parser

**Fordel:** Samme kommando virker lokalt og på en DO droplet — kun `PROJECT_ROOT` env var ændrer sig.

### 2. `skills/lead_generation/SKILL.md` — Skill-beskrivelse for Claude

Følger eksisterende pattern fra `skills/gmail/SKILL.md`. Indeholder:
- Frontmatter med `name`, `description`, `allowed-tools`
- Hvad skill'et kan (B2B lead search via Apify + Google Sheets export)
- Input-format (JSON schema med alle filtre: job titles, locations, industry, size, etc.)
- Invokationseksempler
- Workflow: parse brugerens naturlige sprog → bekræft kriterier → kør

Claude Code loader automatisk SKILL.md som system context via `settingSources: ['project']`.

### 3. Auto-symlink ved startup — `src/index.ts`

Kernen i skill discovery. Ved agent-start læser `index.ts` `skills`-listen fra `agent.yaml` og opretter symlinks:

```
agents/noworkr/.claude/skills/lead_generation/SKILL.md
    → skills/lead_generation/SKILL.md (absolut symlink)
```

Claude Code scanner `.claude/skills/` i sin CWD og finder SKILL.md uden at skill-koden behøver at ligge i agent-mappen.

**Access control:** Kun skills listet i agentens `agent.yaml` bliver symlinket. Kunde A kan have `[lead_generation]`, kunde B kan have `[lead_generation, email_outreach]`.

Koden injicerer også `PROJECT_ROOT` i `process.env` så Claude Code og `run-skill.sh` kan finde project root.

### 4. Relative stier i `src/agent-config.ts`

`skill_env` i agent.yaml understøtter nu tre typer værdier:

| Type | Eksempel | Resolution |
|------|----------|------------|
| Env var reference | `APIFY_API_TOKEN: NOWORKR_APIFY_TOKEN` | Opslås i `.env` |
| Relativ filsti | `GOOGLE_CREDENTIALS_PATH: google_credentials.json` | Resolves til `agents/noworkr/google_credentials.json` |
| Literal værdi | `LEADS_DRIVE_FOLDER_ID: 1DlsIM...` | Bruges as-is |

Prioritet: env var → relativ filsti → literal. Bruger `??` i stedet for `||` for korrekt håndtering af tomme strings.

### 5. `agents/noworkr/agent.yaml` — Relative stier

Ændret fra:
```yaml
GOOGLE_CREDENTIALS_PATH: /Users/jacobslotpetersen/lead_generation/agents/noworkr/google_credentials.json
```

Til:
```yaml
GOOGLE_CREDENTIALS_PATH: google_credentials.json
```

Agent.yaml er nu portabel — ingen hardcodede macOS-stier.

### 6. `.gitignore` — Beskyttelse af secrets og genererede filer

Tilføjet:
```
agents/*/google_credentials.json
agents/*/google_token.json
agents/*/.claude/
```

### 7. Deploy-scripts

**`scripts/deploy-agent.sh <AGENT_ID> <DROPLET_IP>`** — fuld provisioning:
1. Installerer Node 20, Python 3, build-essential, Claude Code CLI
2. Opretter `claudeclaw` bruger
3. Rsync repo (ekskl. secrets og build artifacts)
4. Kopierer secrets separat (.env, agent.yaml, Google credentials)
5. `npm install`, `pip3 install --break-system-packages`, `npm run build`
6. Installerer og starter systemd service

**`scripts/update-agent.sh <DROPLET_IP> <AGENT_ID>`** — kode-opdatering:
- Rsync kode (bevarer secrets på remote)
- Reinstaller deps + rebuild
- Restart systemd service

Begge scripts bruger `SSH_KEY` env var (default: `~/.ssh/claudeclaw_do`).

---

## Problemer vi stødte på undervejs

### 1. Claude brugte web search i stedet for skill

**Problem:** Selv efter symlinks var oprettet, brugte Claude stadig web search.

**Årsag:** System prompt fra `agent.yaml` injiceres kun ved **nye sessioner** (`bot.ts:439`: `if (agentSystemPrompt && !sessionId)`). Den eksisterende session var oprettet før skill'et blev tilføjet.

**Fix:** Send `/newchat` til botten for at starte en ny session. SKILL.md filer loades via `settingSources` på hver turn, men system prompten gør ikke.

**Lærdom:** Efter ændringer i skills eller system prompt, ALTID send `/newchat`.

### 2. Case sensitivity: macOS vs Linux

**Problem:** `agent.yaml` refererede til `Lead_generation` (capital L), men mappen hed `lead_generation` (lowercase). Virkede lokalt på macOS (case-insensitive filsystem), men fejlede på Ubuntu (case-sensitive).

**Fix:** Ændrede alle referencer til `lead_generation` (lowercase).

**Lærdom:** Brug altid lowercase for skill-navne. Test på Linux-target, ikke kun macOS.

### 3. SSH key ikke standard navngivet

**Problem:** `deploy-agent.sh` brugte default SSH key, men den hed `claudeclaw_do` i stedet for `id_ed25519`.

**Fix:** Tilføjede `SSH_KEY` env var og `SSH_OPTS` til begge deploy-scripts.

### 4. PEP 668 på Ubuntu 24.04

**Problem:** `pip3 install` nægter at installere globalt på Ubuntu 24.04 (externally managed environment).

**Fix:** Bruger `--break-system-packages` da det er en dedikeret single-purpose droplet. Ved skala: brug venv.

### 5. Host key verification failed

**Problem:** Ny droplet, ukendt host key.

**Fix:** `ssh-keyscan -H <IP> >> ~/.ssh/known_hosts` før deploy. Scripts bruger nu også `StrictHostKeyChecking=accept-new`.

---

## Filer der blev ændret/oprettet

| Fil | Type | Beskrivelse |
|-----|------|-------------|
| `scripts/run-skill.sh` | Ny | Universel skill-wrapper |
| `skills/lead_generation/SKILL.md` | Ny | Skill-beskrivelse for Claude Code |
| `src/index.ts` | Ændret | Auto-symlink creation + PROJECT_ROOT injection |
| `src/agent-config.ts` | Ændret | Relativ sti-resolution, `||` → `??` fix |
| `agents/noworkr/agent.yaml` | Ændret | Relative stier, lowercase skill-navn |
| `.gitignore` | Ændret | Tilføjet Google creds + .claude/ |
| `scripts/deploy-agent.sh` | Ny | DO droplet provisioning |
| `scripts/update-agent.sh` | Ny | Kode-opdatering til droplet |

---

## Nuværende deployment

| | Detalje |
|---|---------|
| **Droplet** | `noworkr-lead-gen` (ID: 561654452) |
| **IP** | 159.65.125.143 |
| **Region** | Frankfurt 1 (fra1) |
| **Spec** | 1 vCPU, 1GB RAM, 25GB disk ($6/md) |
| **OS** | Ubuntu 24.04 LTS |
| **Service** | `claudeclaw-noworkr` (systemd) |
| **Bot** | @Noworkr_bot |
| **Chat ID** | 7443677800 |

### Drift-kommandoer

```bash
# Status
ssh -i ~/.ssh/claudeclaw_do root@159.65.125.143 systemctl status claudeclaw-noworkr

# Logs (live)
ssh -i ~/.ssh/claudeclaw_do root@159.65.125.143 journalctl -u claudeclaw-noworkr -f

# Restart
ssh -i ~/.ssh/claudeclaw_do root@159.65.125.143 systemctl restart claudeclaw-noworkr

# Push kode-opdatering
./scripts/update-agent.sh 159.65.125.143 noworkr
```

---

## Dataflow

```
Bruger (Telegram)
    │
    ▼
@Noworkr_bot (grammY)
    │
    ▼
src/bot.ts → henter session fra SQLite, prepender system prompt (kun ny session)
    │
    ▼
src/agent.ts → query() via Claude Agent SDK
    │           cwd: agents/noworkr/
    │           settingSources: ['project', 'user']
    │           env: { PROJECT_ROOT, APIFY_TOKEN, GOOGLE_CREDENTIALS_PATH, ... }
    │
    ▼
Claude Code subprocess
    │  ser: agents/noworkr/.claude/skills/lead_generation/SKILL.md (symlink)
    │  ser: system prompt fra agent.yaml (i conversation context)
    │
    ▼
Bash: $PROJECT_ROOT/scripts/run-skill.sh lead_generation '{...}'
    │
    ▼
Python: skills/lead_generation/handler.py
    │  → Apify API (Apollo scraper)
    │  → Google Sheets API (opretter sheet, tilføjer leads)
    │
    ▼
JSON stdout: { status, leads_count, sheet_url }
    │
    ▼
Claude → formaterer svar med sheet-link → Telegram
```

---

## Næste skridt

- **Rotér secrets:** `clients/connectia.json` havde tokens committed i git history
- **Google OAuth:** Publicér consent screen så refresh tokens ikke udløber efter 7 dage
- **Nye skills:** Email outreach, LinkedIn — opret `skills/<navn>/SKILL.md` + `manifest.json` + handler, tilføj til kundens `agent.yaml`
- **Ny kunde:** Opret `agents/<id>/agent.yaml`, kør `deploy-agent.sh <id> <ip>`
