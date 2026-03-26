# Workspace3D — Architectural Map Builder

A browser-based 3D scene editor for building interactive floor plans and architectural maps. Built with Three.js, no build tools required.

---

## Quick Start

Open `index.html` in **Chrome or Firefox**.

> ⚠️ For GLB/GLTF model uploads to work, serve from a local server:
> ```bash
> npx serve .
> # or
> python3 -m http.server 8080
> ```
> Then open `http://localhost:8080`

---

## Login

| Role  | Username | Password     |
|-------|----------|--------------|
| Admin | `admin`  | `@dmin_pass` |
| Guest | —        | (no login)   |

**Admin** — full create, edit, delete, save/load access.  
**Guest** — view-only: can navigate the scene and open Info Point popups.

---

## File Structure

```
workspace3d/
├── index.html              Main entry point & DOM
│
├── css/
│   ├── theme.css           Design tokens, CSS variables, reset
│   ├── layout.css          Login screen, topbar, viewport, notifications
│   ├── sidebar.css         Left sidebar, tabs, create panel, scene tree
│   ├── inspector.css       Right inspector panel
│   └── overlays.css        Info popup, tooltip, modal dialog
│
├── js/
│   ├── core/
│   │   ├── state.js        Global state object (W3D) + genId + notify
│   │   ├── renderer.js     Three.js init, camera, lighting, animation loop, raycast helpers
│   │   ├── history.js      Undo / Redo (up to 60 steps)
│   │   ├── saveload.js     Save to .w3d / Load from .w3d
│   │   └── main.js         App entry point, auth, keyboard shortcuts, event routing
│   │
│   ├── objects/
│   │   ├── factory.js      All object creators (wall, zone, info point, lights, GLB…)
│   │   └── demo.js         Demo office scene built on first launch
│   │
│   ├── tools/
│   │   ├── select.js       Object picking, highlight, delete, duplicate
│   │   └── draw.js         Interactive drawing modes (wall, zone, floor line)
│   │
│   └── ui/
│       ├── sidebar.js      Left sidebar tab system + create button wiring
│       ├── inspector.js    Right inspector panel (live property editing)
│       ├── scenetree.js    Scene object tree list
│       ├── modal.js        Modal dialog utility
│       └── infopoint.js    Info point tooltip + click popup
│
└── README.md
```

---

## Controls

### Navigation
| Action       | Input                          |
|--------------|-------------------------------|
| Orbit        | Left mouse drag                |
| Pan          | Right drag / Middle drag       |
| Zoom         | Scroll wheel                   |
| Focus object | `F`                            |

### Keyboard Shortcuts
| Action        | Shortcut      |
|---------------|---------------|
| Select/Move   | `V`           |
| Rotate        | `R`           |
| Scale         | `S`           |
| Focus         | `F`           |
| Toggle Grid   | `G`           |
| Undo          | `Ctrl+Z`      |
| Redo          | `Ctrl+Y`      |
| Duplicate     | `Ctrl+D`      |
| Save          | `Ctrl+S`      |
| Delete        | `Delete`      |
| Cancel draw   | `Escape`      |
| Deselect      | `Escape`      |

---

## Features

### Creating Objects
All creation is in the **Create** tab on the left sidebar.

- **Wall** — click-to-draw: click start point, click end point
- **Zone / Room** — polygon draw: click multiple corners, double-click or re-click first point to close
- **Floor Line** — multi-point path: click points, double-click to finish
- **Primitives** — box, cylinder, sphere, cone, plane (spawned at origin)
- **Architecture** — floor, ceiling, door frame, window frame, staircase, column
- **Info Points** — interactive markers with label, description, file attachments
- **3D Labels** — canvas-rendered text floating in 3D space
- **3D Models** — upload `.glb` / `.gltf` files (auto-scaled on import)
- **Lights** — point light, spot light (with visual helpers)

### Inspector (right panel, admin only)
Select any object to edit live:
- **Name** — rename
- **Transform** — position, rotation (degrees), scale (X/Y/Z)
- **Color** — color picker
- **Opacity** — for zones, windows, image planes
- **Dimensions** — rebuilds geometry live (width, height, depth, radius)
- **Info Point** — label, description, file attachments
- **Light** — intensity, distance
- **Visibility** — hide without deleting
- **Actions** — Focus, Duplicate, Delete

### Info Points
- **Hover** → tooltip with label
- **Click** → full popup with title, description, and downloadable attachments
- Any file type can be attached (PDF, image, Word doc, etc.)
- Works for **both** Admin and Guest users

### Save / Load
- **💾 Save** — exports `<scene-name>.w3d` (JSON)
- **📂 Load** — imports a `.w3d` file, replaces current scene
- All transforms, colors, names, info point data, and file attachments are preserved
- GLB models are **not** embedded (re-upload after loading)

### Undo / Redo
- Up to 60 steps of transform history
- `Ctrl+Z` / `Ctrl+Y`

---

## Collaboration (Multi-User Workflow)

Since this is a pure client-side app (no server), here are recommended workflows for team collaboration:

### Option A — Git (Recommended)
1. Put the project in a **Git repository** (GitHub, GitLab, Bitbucket)
2. Each team member edits different JS/CSS files in separate branches
3. Use **pull requests** to review and merge changes
4. Scene files (`.w3d`) can also be committed to the repo

**Who edits what:**
- `css/theme.css` → designer / theming
- `js/objects/factory.js` → new object types
- `js/ui/inspector.js` → inspector fields
- `js/objects/demo.js` → demo/starter scene
- `js/core/main.js` → event wiring

### Option B — Live Server Share (Quick)
Use **VS Code Live Share** extension:
1. Host opens the project with Live Server
2. Share the Live Share link
3. Collaborators can co-edit files in real time

### Option C — Scene File Handoff
For non-developers:
1. Admin builds scene, saves `.w3d` file
2. Shares file via email / cloud storage
3. Recipient opens the app and loads the file

---

## Extending the App

### Add a new object type
1. Add a creator function in `js/objects/factory.js`
2. Add a button in `index.html` under the appropriate section
3. Wire the button in `js/ui/sidebar.js`
4. Add a `case` in `factory.js → reconstruct()` for save/load support
5. Optionally add dimension fields in `js/ui/inspector.js → _buildDimensionFields()`

### Change the color theme
All colors are CSS variables in `css/theme.css` under `:root { }`. Change `--accent` and `--yellow` to retheme the whole app instantly.

### Add a new inspector field
In `js/ui/inspector.js`:
1. Add HTML in the `build()` method
2. Bind the change event in `_bind()`

---

## Notes
- GLB models: binary data is not serialized into `.w3d` files. Re-upload after loading a saved scene.
- File attachments in Info Points **are** saved as base64 — keep file sizes under ~2MB each for performance.
- The app is single-file per session; multiple browser tabs do **not** share state.
