# Card Studio – read me first

Before working on this project, read `PROJECT_NOTES.txt` (same folder). It lists everything already
implemented, how it works, where it lives, how to run/test it, the user's preferences, and the change log.
Update it after every round of changes.

- Run: `docker compose up -d --build` (app at http://localhost:3000). Frontend-only rebuild: `docker compose up -d --build web`.
- Tests: `docker build --target test frontend`, `docker build --target test backend`, `scripts/smoke-test.sh`.
- Never use `window.confirm()` (blocked in the user's browser) – use `useStore.getState().ask(...)`.
- Don't commit the user's screenshots (`*.png` in the root) or `MSA_Lab_requirements.txt` unless asked.
