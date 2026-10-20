# Architecture

```
Browser (React + Three.js)
   │  same-origin /api/*  (nginx proxy)
   ▼
nginx (static files + reverse proxy)  ──►  ASP.NET Core API  ──►  MongoDB
```

## Frontend (`frontend/`)
- **Scene** (`scene/`): react-three-fiber. A transparent WebGL canvas sits on a CSS background, so the pastel background colour is exactly the colour used for exports. Tools are low-poly meshes built from primitives (no downloaded assets).
- **Paper engine** (`engine/paper.js`): the card has two faces (inside spread, outside covers). Each face has an `objects` layer (tape, stickers, text), an `ink` layer (drawing – the only thing the eraser touches) and a `protect` mask (stickers can't be drawn over). A shared `cut` mask holds the paper's shape (mirrored for the outside). Strokes are re-rendered from their points while dragging, which is what makes the "line shape" slider (wobbly ↔ ruler) possible. Undo stores only the changed rectangle of each layer, so 150 steps fit in memory; Erase all and resizing store full snapshots.
- **Card cutting** (`engine/pieces.js`): after a cut, connected regions of paper are labelled; if there are several, the user clicks the one to keep.
- **Card orientation**: three angles (vertical, longitudinal, diagonal) turned into one quaternion; when the card is put down it snaps flat, face up or face down.
- **Brushes** (`engine/brushes.js`): one render function per tool and a blend mode (multiply for crayon/highlighter, normal for marker/brush/glitter).
- **State**: zustand (`store.js`). The 3D tools read a mutable `pointer` object each frame instead of React state, to stay at 60 fps.
- **Export** (`export/`): layouts are plain 2D canvas drawings looped over 3 seconds; GIFs are encoded in the browser with `gifenc`. Nothing is uploaded for export.
- **Moderation**: `moderation.js` (word list) and `imageModeration.js` (nsfwjs, lazy-loaded).

## Backend (`backend/CardApi`)
- Minimal API, JWT bearer auth, `PasswordHasher` (PBKDF2) for passwords, rate limiting on `/api/auth/*`, 12 MB body limit.
- Collections: `users` (unique email index), `designs` (indexed by `userId`). A design stores a flattened PNG, the editable layers (`layers`: inObjects, inInk, inProtect, outObjects, outInk, outProtect, cut – only the used ones), a JPEG thumbnail, the typed texts (so the server can moderate them), card size and background.
- Every design query filters by the JWT's user id, so portfolios are private. Slot limit = 20 per user.

## Decisions worth defending
| Decision | Why |
| --- | --- |
| Images as data-URLs inside MongoDB documents | Simplest for a small app (documents stay far below the 16 MB limit). Move to object storage (e.g. S3-compatible free tier) if you grow. |
| Canvas texture on 3D planes instead of drawing in 3D | Pixel-accurate strokes, easy undo, trivial export. |
| Client-side image moderation | Free, private, no API keys. Trade-off: a determined user can bypass it, so the server should also gate content before you go public. |
| nginx proxy for `/api` | One origin → no CORS headaches, cookies/JWT simple, one port to expose. |
