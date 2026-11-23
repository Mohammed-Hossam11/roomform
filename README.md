# Roomform — Bedroom Layout Designer

A local bedroom planner built with React, TypeScript, Vite, Tailwind CSS, SVG, and React Three Fiber. It uses one centimeter-based project model for the 2D plan, 3D preview, saved layouts, and exports.

## Run

```powershell
npm install
npm run dev
```

Open the Local URL printed by Vite (usually `http://127.0.0.1:5173/`). Run `npm test` for geometry regression tests, `npm run build` for a production build, and `npm run preview` to inspect that build.

## Project structure

| File | Purpose |
| --- | --- |
| `src/model.ts` | Project and furniture types, catalog, appearance presets, sample layouts, saved project migration |
| `src/geometry.ts` | Rotated bounds, interior wall boundary, collision, door clearance, wall snapping |
| `src/generator.ts` | Deterministic collision-aware layout ideas |
| `src/FloorPlan.tsx` | Interactive 2D editor with pan, zoom, drag, grid, and dimensions |
| `src/Room3D.tsx` | 3D room and furniture using the shared model |
| `src/export.ts` | High-resolution floor plan PNG, 3D screenshot PNG, project JSON |
| `src/App.tsx` | Inspector, layout management, history, import, save, and navigation |
| `src/style.css` | Tailwind entry and application styling |
| `tests/geometry.test.mjs` | Boundary, rotation, rug, and import regression tests |

## Working with layouts

- Drag furniture from the library into the plan, or click an item to add it automatically.
- Select an item to edit its size, center position, rotation, name, height, and finish. Drag it to move it, drag a corner handle to resize it, or use the floating toolbar to rotate, duplicate, or delete it. The Delete key also removes the selected item.
- Furniture is constrained to the inner faces of the walls in both views. Rotating and resizing can move it inward; a footprint too large to fit is rejected. Overlap and door circulation warnings remain advisory.
- The rug can be rectangular or circular and sits below furniture without causing overlap warnings. The shoe organizer has editable dimensions and a choice of finishes.
- **Room Appearance** changes wall colors, individual accent walls, floor materials, base color, and plank direction for the current layout. These settings travel with that layout.
- Use **Layout Options** to create, duplicate, rename, switch, delete, and generate arrangements.
- Changes save automatically to this browser's local storage. Use **Export → Project JSON** for a portable backup, then **Import JSON** to restore it.
- Use **Export → Floor plan PNG** for a 2400 × 1700 image with furniture and room dimensions. Open 3D before using **3D screenshot PNG**.

## Measurements and assumptions

The room is fixed at 520 × 320 cm. The top wall has 368 cm of wall, a 90 cm opening with the hinge on its right side, then 62 cm of wall. Wall geometry is 9 cm thick, centered on that outline, leaving a 4.5 cm inset as the usable floor boundary. The window is part of the left wall boundary. The default ceiling height is 280 cm and is editable. The window and AC start with editable approximate positions because their dimensions and the referenced image were not included in the supplied attachment. The 3D view leaves the door opening full height because no door height was supplied.

Projects are stored only in the browser in which they were created. A JSON export is needed to move a project to another browser or computer. Older saved layouts load with appearance defaults and furniture positions adjusted inside the wall. Imported items that are too large to fit are rejected. The 3D preview uses simple furniture geometry and browser WebGL, so its screenshots are limited by the current canvas resolution.

## Mobile use

On screens up to 820 px wide Roomform switches to a mobile layout: the plan or 3D view fills the screen, and a bottom toolbar opens **Furniture** (library drawer), **Room** (room settings), **Edit** (properties of the selected item) and toggles **2D / 3D**. The ☰ menu holds My Rooms, New Room, Save, Undo/Redo, design management, export and import.

- 2D: tap to select, drag to move, drag corner handles to resize, pinch to zoom, two fingers to pan, tap empty space to deselect. Tap a library card to add an item, then drag it into place.
- 3D: one finger orbits, two fingers zoom and pan, tap a door to open or close it. In **Inside Room**, use the on-screen arrows to walk.

Saved designs live in each browser separately. To move work between a laptop and a phone, use **Export → Entire project as JSON** on one device and **Import → Complete project** on the other (imports always add copies).

## Deploying to GitHub Pages

1. Push this project to the `main` branch of the GitHub repository (`node_modules/` and `dist/` are ignored; keep `package-lock.json` committed because the workflow uses `npm ci`).
2. In the repository, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`, which installs dependencies, builds with Vite and publishes `dist/` to `https://<user>.github.io/<repo>/`. You can also start it manually from the **Actions** tab (*Run workflow*).

Repository: https://github.com/Mohammed-Hossam11/roomform — live site: https://mohammed-hossam11.github.io/roomform/

Production builds use the base path `/roomform/` (see `vite.config.ts`). If the repository is renamed, set `VITE_BASE` (for example `VITE_BASE=/new-name/`) in the workflow's Build step. Built files have content-hashed names and there is no service worker, so a refresh always loads the latest deployment. Deployments never touch browser storage, so saved rooms and designs survive updates.
