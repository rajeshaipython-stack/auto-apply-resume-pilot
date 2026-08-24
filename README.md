# ResumePilot MCP

A scalable **Universal Job Application MCP** server for Claude Desktop.

You give Claude **one master resume**. ResumePilot then parses it, builds a
reusable profile, analyzes job descriptions against it, computes job-specific
ATS/match scores, generates **tailored resumes that never invent information**,
tracks every application in a local database, and produces a final PDF report
with per-application tracking pages.

> **Phase 1 (this release)** is a complete, tested, fully-local foundation. You
> paste a job description and the entire pipeline runs end-to-end — no external
> job site required. Global job search, application automation and email tracking
> are later phases that slot into the same adapter architecture. See
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## What it will not do

- ❌ Never invents skills, experience, education, certifications or metrics.
- ❌ Never stores LinkedIn/Naukri/other passwords or OTPs.
- ❌ Never bypasses CAPTCHA, 2FA, bot protection or authentication.
- ❌ Never auto-submits to arbitrary websites (Phase 1 prepares; you submit).

If a required skill can't be verified from your material, ResumePilot reports
_"Required skill not verified from the user's profile."_ — it will not add it.

## Requirements

- Node.js ≥ 18.18
- Claude Desktop (for MCP usage)

## Install & build

```bash
git clone <your-fork-url> resumepilot-mcp
cd resumepilot-mcp
npm install
npm run build
cp .env.example .env    # optional — sensible defaults otherwise
```

## Try it without Claude (offline demo)

Runs the full pipeline through the same tools Claude calls, in a temp folder:

```bash
npm run demo
```

You'll see original→optimized ATS scores, a generated PDF report and HTML
tracking pages.

## Run the tests

```bash
npm test
```

40 tests cover parsing, scoring, the "never invent" guarantee, optimization,
tracking, reporting and the end-to-end tool pipeline.

## Install into Claude Desktop

Two options — full walkthrough in **[`docs/INSTALL.md`](docs/INSTALL.md)**:

- **One-click Desktop Extension:** `npm run bundle` produces `resumepilot.mcpb`;
  drag it into **Claude Desktop → Settings → Extensions**, set your data folder,
  toggle On. (The bundle embeds a native SQLite binary, so build it on your own
  OS — one command — for macOS/Windows.)
- **Manual MCP config:** build from source and add a `mcpServers` entry.

## Connect to Claude Desktop (manual config)

1. Build: `npm run build` (produces `dist/src/index.js`).
2. Open your Claude Desktop config file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
3. Add the server (see [`docs/claude_desktop_config.example.json`](docs/claude_desktop_config.example.json)), using **absolute paths**:

   ```json
   {
     "mcpServers": {
       "resumepilot": {
         "command": "node",
         "args": ["/ABSOLUTE/PATH/TO/resumepilot-mcp/dist/src/index.js"],
         "env": {
           "RESUMEPILOT_DATA_DIR": "/ABSOLUTE/PATH/TO/your-private-data",
           "ATS_TARGET_SCORE": "90"
         }
       }
     }
   }
   ```
4. Fully quit and reopen Claude Desktop. ResumePilot's tools appear under the
   tools (🔌) menu.

## Use it

Just say:

> **“Start my ResumePilot job application process.”**

Claude understands the workflow and will:

1. Ask for your **master resume** → `upload_master_resume` (give it the file path).
2. Parse it and ask only for **missing info** → `analyze_master_resume` → `setup_user_profile`.
3. Take a **job description** you paste → `analyze_job` (shows original ATS + gaps).
4. Build a **tailored resume** → `optimize_resume_for_job` (original vs optimized ATS, PDF + DOCX).
5. Prepare the **application** → `generate_application_profile` → `prepare_application`.
6. Record it → `apply_to_job` (Phase 1: you submit; Claude marks it APPLIED on your confirmation).
7. **Track** it → `update_application_tracking` / `search_application_emails`.
8. Produce the **final report** → `generate_application_report` (PDF + tracking pages).

### Example prompts

- "Here's my resume: `/Users/me/Documents/resume.pdf`. Set up my profile."
- "Analyze this job against my resume: _\<paste JD\>_"
- "Optimize my resume for application 1 and show me the before/after ATS score."
- "What changed, and what couldn't you verify?"
- "Generate my application report."

## Configuration (`.env`)

| Variable | Default | Meaning |
|----------|---------|---------|
| `RESUMEPILOT_DATA_DIR` | `./data` | Where your private data lives (git-ignored) |
| `ATS_TARGET_SCORE` | `90` | Target ATS score (never guaranteed, never stuffed) |
| `MATCH_SCORE_THRESHOLD` | `60` | Min match score to recommend applying |
| `JOB_SEARCH_MAX_JOBS` | `1000` | (Phase 2+) max jobs per run |
| `JOB_SEARCH_CONCURRENCY` | `10` | (Phase 2+) bounded worker concurrency |
| `RESUMEPILOT_LOG_LEVEL` | `info` | `error`\|`warn`\|`info`\|`debug` (stderr only) |

## Security & privacy

- Your data stays on your machine under `RESUMEPILOT_DATA_DIR` (git-ignored).
- No third-party passwords or OTPs are ever stored; future integrations use
  official OAuth/session flows with tokens kept out of logs.
- Logs go to **stderr only** and redact secret-looking values.
- Delete your data any time by removing the data directory.

## Project layout

```
src/
├── index.ts, server.ts          # MCP stdio server + tool registration
├── context.ts                   # composition root
├── tools/                       # 17 MCP tools (thin, Zod-validated)
├── services/                    # parsing, scoring, optimization, tracking, reports
├── providers/                   # jobs / applications / email adapters (+ registries)
├── database/                    # SQLite schema + repository
├── models/                      # Zod schemas & types
└── utils/                       # config, logger, text/keyword processing, ids
tests/                           # vitest suite (40 tests)
docs/                            # ARCHITECTURE.md, Claude Desktop config
scripts/demo.ts                  # offline end-to-end demo
```

## Roadmap

Phase 2: generic search adapter, worker pool, dedup, ranking, ≤1,000 jobs ·
Phase 3: supported job-source integrations · Phase 4: application adapters ·
Phase 5: Gmail tracking (OAuth) · Phase 6: hosted tracking UI + packaging.

## License

MIT — see [LICENSE](LICENSE).
