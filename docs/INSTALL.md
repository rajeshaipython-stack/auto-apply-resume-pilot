# Installing ResumePilot into Claude Desktop

Two ways to install. **Path A** (Desktop Extension) is the one-click, "authorize
in the UI" experience. **Path B** (manual config) is the classic MCP setup.

> ### Native module note (read once)
> ResumePilot uses `better-sqlite3`, a native module. A packed `.mcpb` bundle
> contains a binary for the OS/CPU it was packed on. The bundle shipped in
> Releases is **Linux x64**. On macOS or Windows, build your own bundle in one
> command (Path A, step 1) — it compiles the right binary for your machine.
> Path B (from source) always builds the correct binary via `npm install`.

---

## Path A — Install as a Claude Desktop Extension (recommended)

### Step 1 — Get a `.mcpb` bundle for your OS

**macOS / Windows (build your own — correct native binary):**

```bash
git clone https://github.com/<your-username>/resumepilot-mcp.git
cd resumepilot-mcp
npm install
npm run bundle          # builds + packs -> resumepilot.mcpb
```

**Linux x64:** download `resumepilot.mcpb` from the repo's Releases, or run the
same `npm run bundle`.

### Step 2 — Install it in Claude Desktop

1. Open **Claude Desktop → Settings → Extensions**.
2. Drag `resumepilot.mcpb` onto the window (or **Install Extension… → pick the file**).
3. Claude shows the extension's name, description and the **17 tools** it exposes.
4. Configure when prompted:
   - **Data folder** — a private folder for your resume/profile/reports (e.g. `~/ResumePilot`).
   - **Target ATS score** (default 90), **Apply threshold** (default 60).
5. Click **Install**, then toggle the extension **On**.

### Step 3 — Authorize / enable

The extension runs locally under your account — there's no third-party login to
approve for Phase 1. Just make sure the toggle is **On**; Claude will ask to
allow each tool the first time it's used. That's the only "authorize" step.

---

## Path B — Manual MCP config (from source)

```bash
git clone https://github.com/<your-username>/resumepilot-mcp.git
cd resumepilot-mcp
npm install
npm run build           # produces dist/src/index.js
npm test                # optional: 40 tests
```

Open your config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add (use **absolute** paths — see `docs/claude_desktop_config.example.json`):

```json
{
  "mcpServers": {
    "resumepilot": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/resumepilot-mcp/dist/src/index.js"],
      "env": {
        "RESUMEPILOT_DATA_DIR": "/ABSOLUTE/PATH/your-private-data",
        "ATS_TARGET_SCORE": "90"
      }
    }
  }
}
```

Fully quit and reopen Claude Desktop.

---

## Verify it works

In a new Claude Desktop chat, say:

> **Start my ResumePilot job application process.**

Then, when asked, give the path to your resume (e.g. `/Users/you/resume.pdf`),
answer the few missing-profile questions, paste a job description, and ask Claude
to optimize and generate a report. You should get original vs optimized ATS
scores, a customized resume (PDF + DOCX) in your data folder, and a PDF report.

## Troubleshooting

- **Tools don't appear:** fully quit Claude Desktop (not just close the window)
  and reopen. Check **Settings → Extensions** (Path A) or the config JSON is
  valid (Path B).
- **"Cannot find module better-sqlite3" / native error:** you're on macOS/Windows
  with a Linux bundle. Rebuild with `npm run bundle` on your machine (Path A) or
  use Path B.
- **See the logs:** Claude Desktop exposes MCP server logs (stderr). ResumePilot
  logs there; set `RESUMEPILOT_LOG_LEVEL=debug` for more detail.
- **Node too old:** needs Node ≥ 18.18. Check with `node -v`.
