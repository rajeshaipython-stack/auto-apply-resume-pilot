# ResumePilot MCP — Architecture

ResumePilot is designed from day one as a **scalable Universal Job Application
MCP**, not a one-off ATS checker. Phase 1 ships a complete, working, local
foundation; every later phase slots into the same architecture without rewrites.

## 1. Design principles

1. **Never invent.** No skill, experience, education, certification or metric is
   ever added unless it is verifiably present in the user's own resume/profile.
   Unverifiable requirements are surfaced as gaps, never silently satisfied.
2. **Immutable master.** The master resume is stored once and never modified.
   Every application gets its own immutable, versioned resume.
3. **Provider/adapter everywhere.** Job sources, application automation and email
   are all pluggable behind interfaces so new integrations never touch the core.
4. **Deterministic core.** Parsing, scoring and optimization are pure,
   reproducible functions — unit-tested, and identical for 1 job or 1,000.
5. **Human-in-the-loop for anything sensitive.** CAPTCHA, OTP, 2FA, identity
   verification and legal declarations always pause for the user. Authentication
   uses official flows; passwords and OTPs are never stored.

## 2. Layered architecture

```
          ┌───────────────────────────────────────────────┐
Claude    │                MCP Server (stdio)              │  src/server.ts, index.ts
Desktop ──▶│   17 tools with strict Zod schemas + validation│
          └───────────────┬───────────────────────────────┘
                          │ calls
          ┌───────────────▼───────────────┐
          │           Tools layer          │  src/tools/*  (thin, validated)
          └───────────────┬───────────────┘
                          │ orchestrates
   ┌──────────────────────▼───────────────────────┐
   │                 Services layer                 │  src/services/*  (pure logic)
   │  ResumeParser · JobAnalyzer · ATSAnalyzer ·    │
   │  ResumeOptimizer · JobRanker · ProfileService ·│
   │  ApplicationTracker · ReportGenerator ·        │
   │  ResumeDocumentGenerator                       │
   └───────┬───────────────────────┬────────────────┘
           │ uses                   │ uses
   ┌───────▼────────┐      ┌────────▼─────────────────────────┐
   │  Providers     │      │  Data layer                       │
   │  (adapters)    │      │  SQLite (tracking) + filesystem   │  src/database/*
   │  jobs/apps/email│     │  (immutable resume versions)      │
   └────────────────┘      └───────────────────────────────────┘
```

The **composition root** is `src/context.ts` (`ResumePilotContext`) — it wires
config, DB, services and provider registries into one object shared by all tools.

## 3. Provider / adapter architecture

### Job sources (`src/providers/jobs`)

```
JobSourceAdapter (interface)
  ├── ManualJobSourceAdapter          ← Phase 1 (paste a JD)
  ├── LinkedInAdapter    (Phase 3)
  ├── IndeedAdapter      (Phase 3)
  ├── NaukriAdapter      (Phase 3)
  ├── CompanyCareerAdapter (Phase 3)
  └── … public job APIs / ATS pages
```

Each adapter declares `capabilities` (`canSearch`, `requiresAuth`,
`usesOfficialApi`, …) so the pipeline reasons about what a source may legally and
technically do. Adapters respect authentication, robots/terms, rate limits and
anti-bot protections, and prefer official APIs.

### Application automation (`src/providers/applications`)

```
ApplicationAdapter (interface)
  ├── ManualApplicationAdapter        ← Phase 1 (human-in-the-loop)
  ├── GenericATSAdapter   (Phase 4)
  ├── LinkedInEasyApply   (Phase 4)
  └── CompanyCareerAdapter (Phase 4)
```

`prepare()` computes the autofill map + known/unknown questions from the verified
profile. `submit()` only auto-submits where supported and **always pauses** for
human-only steps.

### Email (`src/providers/email`)

```
EmailProvider (interface)
  ├── MockEmailProvider   ← Phase 1 (offline, deterministic, for tests/demo)
  └── GmailProvider       (Phase 5, OAuth read-only)
```

## 4. Data model

### SQLite (`src/database/schema.ts`) — queryable tracking

| table            | purpose                                                    |
|------------------|------------------------------------------------------------|
| `meta`           | counters (next application number), ingest timestamps      |
| `profile`        | the single Master Profile (JSON)                           |
| `jobs`           | structured jobs + dedup `fingerprint`                       |
| `applications`   | one row per application, scores, resume paths, status       |
| `status_history` | timestamped status transitions (the timeline source)       |

### Filesystem — immutable artifacts (per the product spec)

```
data/                                # RESUMEPILOT_DATA_DIR (git-ignored)
├── resumepilot.sqlite
├── master-resume/
│   ├── master.<ext>                 # original, never modified
│   └── parsed.json                  # structured parse (ground truth)
├── applications/
│   └── application-001/
│       ├── job.json
│       ├── original-ats.json
│       ├── optimized-ats.json
│       ├── customized-resume.pdf
│       ├── customized-resume.docx
│       ├── profile.json
│       ├── application.json
│       └── tracking.json
└── reports/
    ├── resumepilot-report-<ts>.pdf
    └── tracking/{index.html, application-001.html, …}
```

### Core TypeScript models (`src/models`)

`ParsedResume`, `MasterProfile`, `StructuredJob`, `ATSAnalysis`
(`ScoreBreakdown`, `KeywordMatch`, `Gap`), `OptimizationResult`,
`ApplicationRecord` (`StatusHistoryEntry`, `EmailUpdate`). All are Zod schemas
with inferred types.

## 5. ATS scoring model (deterministic)

`ATSAnalyzer` builds a **verified keyword set** from the resume text + profile,
then scores a focused set of skill-like job terms:

- `keywordMatch` — average *prominence* (0 absent · 0.5 buried · 1 in skills/summary)
- `skillMatch` — fraction of required skills verifiably present
- `experienceMatch` — required years vs profile/estimated years
- `qualificationMatch` — education + certification coverage
- `locationMatch` — work mode / location vs preferences
- `formatting` — ATS-parseability (sections, contact, length)

`atsScore = 0.5·keyword + 0.3·skill + 0.1·qualification + 0.1·formatting`
`matchScore = 0.35·skill + 0.25·keyword + 0.2·experience + 0.1·qualification + 0.1·location`

**Optimization lever:** surfacing a *buried but verified* keyword into the skills
section raises its prominence 0.5→1.0, which legitimately raises the ATS score —
without inventing anything. A truly absent required skill (e.g. Rust) stays a
gap and drags the score down honestly.

## 6. MCP tools (17)

| Tool | Purpose |
|------|---------|
| `upload_master_resume` | Register the immutable master resume (PDF/DOCX/TXT/text) |
| `analyze_master_resume` | Parse it, seed the profile, list missing info |
| `setup_user_profile` | Apply answers to the missing-info questionnaire |
| `get_user_profile` / `update_user_profile` | Read / correct the profile |
| `connect_job_source` | Inspect/connect a job-source adapter |
| `search_jobs` | (Phase 2+) search connected sources; honest in Phase 1 |
| `analyze_job` | Ingest a JD, extract structure, score original ATS/match, create application |
| `rank_jobs` | Rank analyzed applications by match score |
| `optimize_resume_for_job` | Build the tailored resume (PDF+DOCX), original vs optimized ATS |
| `generate_application_profile` | Autofill map + known/unknown questions |
| `prepare_application` | Ready-to-apply checklist + resume to attach |
| `apply_to_job` | Submit where supported; else pause; record APPLIED on confirm |
| `get_application_status` | Status/scores/timeline for one or all |
| `search_application_emails` | Find + classify recruiter emails, update status |
| `update_application_tracking` | Manual status/email updates |
| `generate_application_report` | Final PDF report + HTML tracking pages |

## 7. Multi-agent / concurrency (Phase 2+)

Search is designed for configurable, *bounded* concurrency
(`JOB_SEARCH_CONCURRENCY`, default 10; `JOB_SEARCH_MAX_JOBS`, default 1000) — a
worker pool where each worker searches, opens/reads details, extracts structure
and returns to a central pipeline, followed by fingerprint **deduplication**
(`JobRanker.dedupe`) before analysis. No uncontrolled browser processes.

## 8. Phase roadmap

- **Phase 1 (this release):** full local foundation — parse, profile, analyze,
  score, optimize, generate resume, SQLite tracking, PDF report, tests, Claude
  Desktop config. Manual JD input so the whole pipeline runs offline.
- **Phase 2:** generic job-source adapter, worker pool, dedup, ranking, ≤1,000.
- **Phase 3:** supported job-source integrations (official APIs / permitted).
- **Phase 4:** application adapters (autofill/attach/submit where supported).
- **Phase 5:** Gmail tracking via OAuth.
- **Phase 6:** hosted tracking web UI + production packaging.
