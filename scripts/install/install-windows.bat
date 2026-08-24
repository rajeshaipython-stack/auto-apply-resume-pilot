@echo off
REM ResumePilot installer for Windows.
REM Double-click this file. It clones/updates the repo, builds it, and prints
REM the Claude Desktop config you need.
setlocal
title ResumePilot installer (Windows)
color 0b
set REPO=https://github.com/rajeshaipython-stack/auto-apply-resume-pilot.git
set DEST=%USERPROFILE%\auto-apply-resume-pilot

where git >nul 2>nul || (echo [!] Install Git for Windows: https://git-scm.com/download/win & pause & exit /b 1)
where node >nul 2>nul || (echo [!] Install Node.js 18+: https://nodejs.org & pause & exit /b 1)

if exist "%DEST%\.git" ( git -C "%DEST%" pull --ff-only ) else ( git clone --depth 1 %REPO% "%DEST%" )
cd /d "%DEST%" || (echo [!] Could not open %DEST% & pause & exit /b 1)

call npm install || (echo [!] npm install failed & pause & exit /b 1)
call npm run build || (echo [!] build failed & pause & exit /b 1)

echo.
echo ============================================================
echo  Build complete.  Add this to Claude Desktop config:
echo    %%APPDATA%%\Claude\claude_desktop_config.json
echo ------------------------------------------------------------
echo  {
echo    "mcpServers": {
echo      "resumepilot": {
echo        "command": "node",
echo        "args": ["%DEST%\dist\src\index.js"],
echo        "env": { "RESUMEPILOT_DATA_DIR": "%USERPROFILE%\ResumePilot" }
echo      }
echo    }
echo  }
echo ============================================================
echo  Then fully quit and reopen Claude Desktop.
echo.
pause
