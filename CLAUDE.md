# Roomform — instructions for Claude Code

Local project: `C:\Users\Mohammed Abbas\OneDrive\Desktop\Engezhaly\Websites\RoomForm`

Roomform is a React + TypeScript + Vite interior-design studio (2D SVG plan +
React Three Fiber 3D) that runs entirely in the browser and is published to
GitHub Pages. These rules apply to **every** change, not only the one that
introduced them. `AGENTS.md` carries the same rules for other coding agents —
keep the two files in sync.

## Permanent requirements

1. **Design every feature for both mobile and desktop.** Phones (320–430 px),
   tablets, laptops and desktops must all be usable. Desktop keeps the
   three-column layout; at ≤ 820 px the sidebars become bottom sheets driven by
   the bottom toolbar (`panel` state in `App.tsx`).
2. **No mouse-only interactions.** Every pointer interaction needs a touch
   equivalent: use Pointer Events (not mouse/touch events), keep
   `touch-action: none` on the canvases, support pinch/two-finger gestures
   where zoom/pan exist, size touch targets ≥ 40 px on coarse pointers, and
   never rely on hover or HTML5 drag-and-drop alone (tap-to-add must work).
3. **All dialogs are custom, responsive React dialogs** from `src/ui.tsx`
   (`Modal`, `ConfirmDialog`, `InputDialog`, `useDialogs()`, `Toast`). They
   must handle focus, Enter, Escape, backdrop clicks and small screens.
4. **Never use native browser dialogs** (`window.prompt`, `window.confirm`,
   `window.alert`) for application UI. Use `await dialogs.prompt(...)` /
   `await dialogs.confirm(...)`, and a toast (`setNotice`) for plain success
   messages.
5. **Preserve existing LocalStorage data and saved designs.** Never clear,
   reset or overwrite `roomform-studio` (or the legacy `roomform-project`)
   during updates. New fields must be optional with defaults applied in
   `normalizeProject` / `normalizeStudio`; unreadable data is backed up, never
   discarded. Imports always add copies; they never replace rooms.
6. **Keep 2D/3D geometry centimeter-accurate.** 1 plan unit = 1 cm; 3D uses
   `m = cm / 100` everywhere. All placement goes through `src/geometry.ts`
   (`clampInside`, `inside`, `areaFor`, `mountOnWall`, `fitOpenings`) — no
   ad-hoc boundary checks.
7. **Keep furniture manipulation consistent across devices.** Mobile selection
   starts in Move mode, with resize handles shown only in Resize mode so small
   objects stay easy to drag. Keep Move, Resize, exact dimensions, Rotate,
   Duplicate and Delete accessible without covering the plan. Preserve desktop
   corner handles and keep Undo/Redo visible in the mobile toolbar.
8. **Everything must work on GitHub Pages.** Production builds use the base
   path `/roomform/` (`vite.config.ts`); the live site is
   https://mohammed-hossam11.github.io/roomform/.
9. **Never break asset paths**: no absolute `/…` URLs to app assets, no
   `localhost` URLs. Import assets through Vite or generate them procedurally
   (current textures are procedural canvases). The app has no client-side
   router; do not add one without a Pages-compatible fallback.
10. **Stay lightweight and responsive**: procedural geometry/textures, no large
    binary assets, reduced shadow/reflection resolution on coarse pointers,
    no per-frame React re-renders for animation (use refs + `useFrame`).
11. **Preserve existing functionality** (rooms, designs, walls, doors,
    windows, furniture, modular sofas, mirrors, undo/redo, exports) unless the
    user explicitly asks to change it.
12. **No paid APIs, services or dependencies without the user's approval.** No
    backend: storage is LocalStorage + JSON export/import. Do not claim that
    designs sync between devices.

## Working notes

- Dev server: `npm run dev` → http://127.0.0.1:5173/ (reuse a running one).
- The user tests manually: do not run Playwright, browser automation, automated
  tests or `npm run build` unless asked. `npx tsc --noEmit -p tsconfig.json`
  is a safe static check.
- When testing is requested, check touch drag, deliberate resize, undo/redo,
  pinch, pan, dialogs and 3D on phones/tablets plus desktop. Automate in
  isolated browser storage; never clear the owner's saved rooms.
- Deployment: `.github/workflows/deploy.yml` builds and publishes on every push
  to `main` (see "Publishing every change" below).
- Key files: `model.ts` (data + migration), `geometry.ts` (placement rules),
  `FloorPlan.tsx` (2D editor, pointer/pinch handling), `Room3D.tsx` (3D),
  `PlanArt.tsx` (shared 2D drawing, also used by PNG export), `Rooms.tsx`
  (room management), `ui.tsx` (dialogs, toasts, form controls),
  `style.css` (desktop styles first, then the `@media (max-width:820px)` mobile
  section at the end).

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
