# Card Studio – a birthday card maker

Design a birthday card on a 3D desk: pick crayons, markers, a paint brush, glitter pens, washi tape (cut with scissors), stickers and text boxes, then save it to your private portfolio or download it as a picture or animated GIF.

**Stack:** React + Three.js (frontend) · ASP.NET Core 8 (backend) · MongoDB (database) · Docker Compose. No PHP, everything free and open source.

## Run it (only Docker is needed)

```bash
cp .env.example .env        # then put a long random string in JWT_KEY (an .env is already generated for you)
docker compose up -d --build
```

Open <http://localhost:3000>. Stop with `docker compose down` (add `-v` to also erase the database).

## Test it

```bash
docker build --target test backend     # ASP.NET unit tests (age rule, profanity filter)
docker build --target test frontend    # React unit tests (tape cutting, text fitting, moderation…)
scripts/smoke-test.sh                  # end-to-end API checks against the running stack
```

GitHub Actions (`.github/workflows/ci.yml`) runs the same three steps on every push.

## How to use the app

| Do this | By doing this |
| --- | --- |
| Draw | Press on a pen on the left of the desk and drag straight onto the card (or click it, then draw). Thickness, transparency and "line shape" (wobbly → ruler-straight) are in the panel at the bottom. |
| Erase drawing | Pick up the pink eraser. It removes only what was drawn; stickers, tape and text can only be removed with Undo. |
| Cut tape | Click a tape roll, drag on the card to pull tape out, release. The roll waits at the end of the tape; drag the scissors across the tape to cut it (the card is never cut in this mode). |
| Cut the card | Pick up the scissors on their own and drag along the cut (start outside the card to cut in from an edge). If the card splits, click the piece to keep. On a folded card only the layer you cut is cut (a hole in the back cover never shows on the front). Cut edges and holes get a soft shadow so you can see them. |
| Stickers / text | Click the sticker sheet or the "Aa" pad, choose, then click the card. The text preview shows exactly how it will look; the notepad stays out of the way. |
| Colours | Colour wheel for any colour, "Pick from card" (or the pipette on the desk) to copy a colour from the card, and 12 "My colours" slots: click an empty slot to put your current colour in it, click a filled slot to use its colour, double-click a filled slot to replace it with your current colour, right-click to empty it. Every project has its own palette: a new card starts empty, a saved design remembers its colours. |
| Reset rotation | "🎯 Reset rotation" at the top puts the card back flat, the way it started. |
| Pick up and turn the card | With no tool in hand, click the card. Drag to turn it (Shift = diagonal); click it or the desk to put it down. "Turn card" at the top turns it on three axes: vertical, longitudinal, diagonal. Both sides can be decorated. |
| Card size | Menu → Card size, at any time; the design is scaled to fit and Undo brings the old size back. |
| Background colour | "Background" at the top: pastel list or "Any colour…". |
| Undo / Erase all | Undo keeps up to 150 steps. "Erase all" asks for confirmation in the app, then clears both sides, tape, stickers, text and cuts (it can be undone too). |
| Put a tool down | Click anywhere on the desk (not the card) to leave it there. If the card later covers it (opened, turned or resized over it), the tool rolls out to the nearest free spot. "Put it back", Esc or right-click returns it to its usual place. |
| Open / close the card | The card starts folded on its front cover. Drag it sideways to open or close it – from the front or the back, in any rotation: the sheet nearest to you turns towards you. While you hold the card (a drag turns it), use "Open card" / "Close ←" / "Close →" at the top or the O key, which work in any position. |

## Rules from the project brief and where they live

| Rule | Implementation |
| --- | --- |
| Marks can never leave the card, background can't be drawn on | Drawing happens on canvases mapped onto the card; pointer hits are raycast against the card only, and cut-away paper is ignored (`frontend/src/scene/Card.jsx`). Text boxes are scaled and clamped inside the card (`placeTextBox`). |
| Stickers can't be written over, tape can | A hidden "protect" mask is filled by stickers and cleared by tape (`engine/paper.js`). |
| Eraser removes drawing only | Each side has separate layers: objects (tape, stickers, text) and ink (drawing). The eraser only touches ink. |
| Every tool behaves differently | `engine/brushes.js` (crayon grain + multiply blending, marker transparency, highlighter layering, uneven brush bristles, glitter sparkles). |
| Tape cut is a straight line, irregular rectangles only | `cutTapeStrip` in `engine/geometry.js` (unit-tested). |
| Card cuts: any shape, choose the piece to keep | `finishCut` + `labelPieces` (`engine/pieces.js`, unit-tested). |
| Account only for 14+ | Checked in the form **and** on the server (`backend/CardApi/Rules.cs`, tested). |
| Portfolio: private, 20 slots, one slot per design | `backend/CardApi/Program.cs`; saving again updates the same slot. Both sides, cuts and layers are saved. |
| No vulgar drawings or curse words | Text: client + server profanity filter (also on titles and names). Drawings: in-browser NSFW image model (`imageModeration.js`) checks both sides before save/export. |
| Exports use the current background colour | `export/layouts.js` (6 picture + 6 animation layouts, inside or outside, GIF via `gifenc`). |

## Project layout

```
backend/    ASP.NET Core 8 minimal API + xUnit tests (+ Dockerfile with a `test` stage)
frontend/   React + react-three-fiber app, Vitest tests, nginx (+ Dockerfile with a `test` stage)
scripts/    smoke-test.sh
docs/       architecture, CI/CD & deployment, marketing, Instagram
.github/    CI and release workflows
```

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/CI-CD-AND-DEPLOYMENT.md](docs/CI-CD-AND-DEPLOYMENT.md) · [docs/MARKETING.md](docs/MARKETING.md) · [docs/INSTAGRAM.md](docs/INSTAGRAM.md)

## Known limits (honest list)

- The image check is a general-purpose NSFW classifier, so it catches explicit imagery but not every rude doodle. Text is checked with a word list, which can be dodged with creative spelling. Add reporting/human review before a public launch.
- Glitter sparkles twinkle live but are not stored with a saved design (the glitter texture is).
- Text boxes stay inside the card's rectangle; if part of the card has been cut away, text over the missing paper is simply not shown.
- The sign-up/login endpoints allow 20 requests per minute per IP, so running `scripts/smoke-test.sh` several times in a row can hit that limit (wait a minute).
