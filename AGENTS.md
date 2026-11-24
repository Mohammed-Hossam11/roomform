# Roomform — instructions for coding agents (Codex and others)

Local project: `C:\Users\Mohammed Abbas\OneDrive\Desktop\Engezhaly\Websites\RoomForm`

Roomform is a React + TypeScript + Vite interior-design studio (2D SVG plan +
React Three Fiber 3D) that runs entirely in the browser and is published to
GitHub Pages. These rules apply to **every** change. `CLAUDE.md` contains the
same rules for Claude Code — keep both files in sync.

## Permanent requirements

1. Always design new features for **both mobile and desktop** (phones 320–430 px,
   tablets, laptops, desktops). At ≤ 820 px the sidebars are bottom sheets
   opened from the bottom toolbar; desktop keeps the three-column layout.
2. Never introduce **mouse-only interactions** without touch equivalents. Use
   Pointer Events, keep `touch-action: none` on canvases, support pinch /
   two-finger gestures for zoom and pan, keep touch targets ≥ 40 px, and do not
   depend on hover or HTML5 drag-and-drop alone.
3. All new dialogs must be **responsive custom React dialogs** built from
   `src/ui.tsx` (`Modal`, `ConfirmDialog`, `InputDialog`, `useDialogs()`,
   `Toast`) with focus management, Enter/Escape and backdrop handling.
4. Never use **native browser prompts** (`window.prompt`, `window.confirm`,
   `window.alert`) for application UI.
5. **Preserve existing LocalStorage data and saved designs.** Never clear or
   overwrite `roomform-studio` / `roomform-project`; add new fields as optional
   with defaults in `normalizeProject` / `normalizeStudio`; back up unreadable
   data instead of resetting; imports add copies and never replace rooms.
6. Maintain **centimeter-accurate 2D/3D geometry** (1 plan unit = 1 cm, 3D
   metres = cm / 100). Route all placement through `src/geometry.ts`.
7. Keep **furniture manipulation consistent across devices**. On mobile, selecting
   furniture starts in Move mode; resize handles appear only in Resize mode so
   small objects remain easy to drag. Keep Move, Resize, exact dimensions,
   Rotate, Duplicate and Delete accessible without covering the plan. Preserve
   desktop corner handles and keep Undo/Redo visible in the mobile toolbar.
8. Ensure new features **work on GitHub Pages** (built with base `/roomform/`,
   live at https://mohammed-hossam11.github.io/roomform/).
9. Avoid breaking **GitHub Pages asset paths**: no absolute `/…` asset URLs, no
   `localhost`, no client-side routes without a Pages fallback.
10. Keep the application **lightweight and responsive** (procedural assets,
    reduced render cost on touch devices, no per-frame React state updates).
11. **Preserve existing functionality** unless explicitly asked otherwise.
12. Do not introduce **paid APIs, services or dependencies** without approval;
    there is no backend and designs do not sync between devices.

## Workflow

- Develop with `npm run dev` (http://127.0.0.1:5173/).
- Static check: `npx tsc --noEmit -p tsconfig.json`. The owner tests manually;
  do not run browser automation or builds unless asked.
- For relevant changes, verify touch drag, deliberate resize, undo/redo, pinch,
  pan, dialogs and 3D at phone/tablet sizes as well as desktop. Use isolated
  browser storage during automation; never clear the owner's saved rooms.
- Deployment is automatic via `.github/workflows/deploy.yml` on pushes to
  `main` (see "Publishing every change" below).

## Publishing every change (permanent rule)

**After completing ANY future code change, automatically commit and push all
intended project changes to GitHub's `main` branch without asking again.**
Repository: https://github.com/Mohammed-Hossam11/roomform (remote `origin`).
Pushing to `main` deploys https://mohammed-hossam11.github.io/roomform/ via
`.github/workflows/deploy.yml`.

- Commit only intended project files (never `node_modules/`, `dist/`, secrets,
  `.env*`, or local settings — `.gitignore` covers these). Use a clear commit
  message describing the change.
- Before pushing, `git fetch origin` and integrate remote changes with a normal
  (non-destructive) pull/rebase if needed. **Never force-push, never rewrite
  published history, never overwrite remote changes.**
- If the push fails or the remote has diverged in a way that cannot be merged
  cleanly, stop and report the problem instead of forcing anything.
- Every pushed update must work on both desktop and mobile, keep the GitHub
  Pages base path `/roomform/` working, and must never delete or reset saved
  room data in LocalStorage.
- Report the commit hash and whether the deployment could be verified.
