---
version: alpha
name: Sumi / scad-live
consulted: Sumi + Kinari @ 2026-08-11
description: >
  Self-contained design contract for scad-live. Sumi is the dark default and
  Kinari is the screen-first light theme. The inspection-lime accent, WebGL
  scene colors, and full-viewport model inspector are specific to this tool.
colors:
  primary: '#526400'
  accent: '#526400'
  accent-subtle: 'rgba(82, 100, 0, 0.10)'
  surface: '#faf6ef'
  surface-raised: '#fffdf8'
  on-surface: '#3a2f28'
  muted: '#6f6257'
  border: '#e3d9c9'
  danger: '#9c2b1d'
  model: '#899936'
  grid-major: '#9f9789'
  grid-minor: '#d4ccbf'
typography:
  title:
    fontFamily: system-ui
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: system-ui
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: system-ui
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: 6px
  md: 8px
  full: 9999px
spacing:
  sp-1: 4px
  sp-2: 8px
  sp-3: 12px
  sp-4: 16px
  sp-5: 24px
components:
  inspector:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.md}'
    padding: 18px
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.sm}'
    padding: 8px
---

# scad-live design contract

## Overview

scad-live is a read-only WebGL inspection tool for STL files produced by an
OpenSCAD workflow. Its interface is a machinist's inspection bench: the model
occupies the field while a compact instrument panel answers two questions — did
the part render, and is its shape right?

The personality is precise, quiet, and immediately usable beside a terminal.
The model is the product; interface chrome recedes. The application does not
offer browser-side modeling, slicing, fabrication settings, or log viewing.
This root document is the project's sole ongoing design authority. The
templates named by `consulted` are provenance only and are not merged with it.

Two themes have fixed roles:

- **Sumi is the dark default.** It uses ink-black surfaces and a fluorescent
  inspection-lime accent.
- **Kinari is the light theme for ordinary screens.** It follows the operating
  system preference and uses warm cream surfaces with an olive form of the
  same accent.
- There is no in-application theme toggle. A color-scheme change reloads the
  WebGL scene so its CSS-derived colors remain coherent.

The primary accent means active inspection and keyboard focus. It is not a
generic decoration or an “online” color. Connection and rendering states are
always written as text; color only reinforces them.

## Domain model

- **An STL is the inspected artifact.** The browser renders files already
  present in the served `dist` directory and never edits geometry.
- **One model is inspected at a time.** Its stable identity is the URL
  pathname `/{posix-relative-stl}`, which maps the served `dist` tree onto
  `/`. `/` is the dist root, not a stored last-model. Grid pitch is not part
  of the URL and stays the 1 mm default on load.
- **The address bar is the selection.** A user choice writes that relative
  path with `history.pushState`. `popstate` reselects from the URL. After a
  successful selection the address bar shows that relative path. Reloading
  the page, including a live STL rewrite that forces a refresh, restores the
  model named by the pathname. `localStorage` is not the source of truth;
  `/` must not secretly restore a nested last-model.
- **A selected path survives its file.** The URL is the intent, not a report
  of what is on disk: a rebuild that empties `dist` before writing it again
  must not move the selection. While the selected path is absent from the
  model list the viewer keeps the last good mesh and dimensions and writes
  `Missing: <path>` to the State line, the same contract as `Failed: <path>`.
  When that same path returns it is re-read with the camera preserved. Only
  a URL that names nothing — `/`, or a reserved, non-STL, or malformed path —
  falls back to the first publishable model.
- **Only a user choice writes history.** Every automatic address-bar write
  uses `replaceState`, so history is never polluted; `pushState` belongs to
  an explicit selection alone. Automatic writes happen in exactly two cases:
  the fallback above, and normalizing the selected model's own pathname to
  the canonical encoding (`/a+b.stl` → `/a%2Bb.stl`), which changes the
  spelling and never the model.
- **Reserved first path segments keep their server meaning** and cannot name
  a model in the viewer URL: `api`, `models`, `events`, and `static`. An STL
  whose first path segment is one of those names is omitted from the
  inspectable model list so a selection always has a publishable pathname.
  Do not introduce a `/view/` prefix. A request that is not an embedded
  frontend asset and that is an STL (the same `*.stl` rule as the server)
  returns the SPA `index.html`. Missing `/static/*` stays 404. `/api`,
  `/models/{*path}`, and `/events` stay as they are.
- **Z is up.** Camera orientation, the ground grid, orbit behavior, and the
  `X × Y × Z` dimension order agree with OpenSCAD coordinates.
- **Live refresh protects spatial context.** A successful update of the
  selected STL replaces its mesh while retaining camera position, target, pan,
  and zoom. Selecting a different model fits the camera to that model.
- **Dimensions are evidence.** Show the axis-aligned bounding box as
  `X × Y × Z mm` to one decimal place. Do not infer tolerances, volume, print
  time, or manufacturability.
- **Server state is observable.** Scanning, loading, ready, updated,
  reconnecting, empty, missing, and failed states use concise text. The empty
  state keeps the inspector visible.

## Colors

Interface chrome and the semantic scene colors for background, model, and grid
are exposed as CSS custom properties on `:root`. The pair notation below is
**Kinari / Sumi**. Components and the viewer consume these properties instead
of repeating their values.

- **Surface:** `#faf6ef` / `#191919` — document and WebGL scene background.
- **Surface raised:** `#fffdf8` / `#232323` — inspector panel.
- **On-surface:** `#3a2f28` / `#e6e6e6` — primary text.
- **Muted:** `#6f6257` / `#9a9a9a` — labels, hints, and routine state.
- **Border:** `#e3d9c9` / `#333333` — the flat system's 1px separation line.
- **Accent:** `#526400` / `#d7ef52` — focus, the inspector's top rule, and an
  active loading mark. The subtle focus fill is
  `rgba(82, 100, 0, 0.10)` / `rgba(215, 239, 82, 0.15)`.
- **Danger:** `#9c2b1d` / `#ff6b6b` — reconnecting and failure text. Wording
  remains the primary signal.

The WebGL scene uses separate functional colors because model and grid data
are not interface chrome:

- **Model:** `#899936` / `#dbe955` — the inspected solid.
- **Major grid:** `#9f9789` / `#626b52` — primary measurement-plane lines.
- **Minor grid:** `#d4ccbf` / `#292d25` — subordinate plane lines.

Lighting remains neutral. Its white and gray light-source literals are renderer
parameters rather than theme colors. Do not add colored rim lights, gradients,
glossy showroom reflections, scanlines, or animated glow. If axis helpers are
added, the conventional red/green/blue colors are functional data and require
visible X, Y, and Z labels.

## Typography

Use the platform `system-ui` stack and no webfonts. The design has four roles:

- **Title:** 17px, weight 600, line-height 1.3 — product name only.
- **Body:** 16px, weight 400 — control text and primary prose.
- **Body small:** 14px, weight 400, line-height 1.5 — dimension and state
  values, with tabular numerals where supported.
- **Caption:** 12px, weight 400, line-height 1.4 — labels, sync state, and the
  desktop gesture hint. Labels may use uppercase with restrained tracking.

The current implementation explicitly realizes the complete title and label
recipes. Dimension values use 14px but inherit the browser's normal
line-height; sync state uses 12px with normal line-height; the gesture hint uses
`0.72rem` with normal line-height. Those observed values remain valid until a
separate UI change deliberately aligns them with the complete body-small or
caption recipe.

Prefer weight, spacing, or muted color over introducing another text size.
Long model paths ellipsize in the opener control. The picker dialog shows full
paths as plain text (match highlights use accent weight, never HTML injection).

## Spacing and shape

The reusable spacing scale is 4, 8, 12, 16, and 24px. The inspector is an
optically compact, product-specific composition: it currently uses 18px inner
padding, 13px below its header content, and 15px between its header rule and
the model label. These are not new global spacing tokens.

Small controls use a 6px radius; the inspector uses 8px. The tiny sync-state
mark may be circular, but controls must not become circular ornaments. The
system is flat: hierarchy comes from surface tone, borders, and placement, not
drop shadows or glass effects.

Interactive inspector controls are the model opener, the model picker dialog,
and the grid pitch slider. Each focus-visible state is a 2px accent outline
with 2px offset plus the subtle accent background where the control fills.
Never remove focus indication without an equivalent replacement.

## Layout

The document is a single, non-scrolling inspection surface:

- **Viewport:** fixed at `100dvw × 100dvh`. Its canvas fills the viewport and
  owns drag, pinch, and two-finger pan gestures through `touch-action: none`.
- **Inspector:** fixed at the top-left with an inset clamped from 12px to 30px.
  It is at most 430px wide and never wider than the viewport minus 24px. A 4px
  accent top rule is its sole persistent identity mark.
- **Header:** product name on the left and concise sync state on the right,
  separated from controls by a 1px hairline.
- **Readout:** the model opener and grid pitch control span the panel width.
  Dimensions and state form a two-column definition list beneath them.
- **Gesture hint:** fixed to the bottom-right on wide screens. Hide it at
  560px and below so it does not compete with the model or repeat familiar
  touch gestures. The same 560px boundary stacks the model picker columns
  (left full width, then right). The picker dialog stays about 80% of the
  viewport width at every width.

The inspector must not grow into a general toolbar. Additional read-only facts
belong in the readout; geometry editing, slicing, exporting, and printer
settings belong in another tool.

## Components

- **Model opener:** shows the current relative STL path, has a visible label,
  and is at least 44px high. Disable it when no model exists. Activating it
  opens the model picker dialog.
- **Model picker:** a native modal dialog about 80% of the viewport width
  (never wider than the viewport minus gutters). The header stays full
  width. The content row is two columns of about 30% / 70% of that row,
  separated by one gap from the 8–16px spacing scale. Below the existing
  560px breakpoint the columns stack — left full width, then right — so a
  30% pane is not ~77px. There is no breadcrumb trail; the left column owns
  directory navigation.

  The left column is the directory filter. It lists the dist root (label
  `dist`) and every directory prefix implied by the current model list, in
  stable path order. Its initial scope is the parent directory of the
  URL-selected model, or the dist root when that model sits at the root.
  Changing the scope updates the right column immediately and reapplies the
  current query. The current scope is marked with the existing selected /
  accent-subtle treatment, not a new accent.

  The right column is the fzf search field and the file list. Candidates
  are every STL under the left scope recursively, not only immediate
  children. An empty query still lists those files as full paths, so the
  list is never an empty prompt to start typing. Empty-query and non-empty
  query are not mutually exclusive modes. A non-empty query ranks fuzzy
  matches on top; non-matches stay visible, dimmed, below, in stable path
  order. Dimmed rows use the muted text color and the same reduced opacity
  already used for disabled controls (`0.62`); do not invent a new accent
  or token. Keyboard Arrow/Enter walks only non-dimmed matches. A dimmed
  row remains visible and a pointer click still selects it. Enter does
  nothing when no non-dimmed match exists. Choosing a file loads and
  camera-fits that model and `pushState`s its relative path.

  Keyboard: the search field is focused when the dialog opens; type to
  filter; arrows move among non-dimmed matches; Enter chooses the active
  match; Escape dismisses and returns focus to the opener. File rows stay
  out of the tab order. The left-column directory filter remains keyboard
  operable with the same 2px accent focus ring.
- **Grid pitch:** a stepped range control (0.5 / 1 / 2 / 5 / 10 mm, default
  1 mm) with an always-visible text readout of the minor cell size. The ground
  plane stays a fixed 400 mm square; major lines are every ten minor cells.
  Pitch is a viewing aid only and is not persisted.
- **Sync state:** compact text with a small, non-glowing outlined mark. Loading
  spins the accent border; reconnecting and failures use danger text. Its
  polite live region announces state changes without reporting render frames.
- **Dimension readout:** preserves `X × Y × Z mm` and uses an em dash when no
  geometry is available.
- **3D viewport:** has an accessible label identifying it as an interactive
  STL model view. Pointer motion and live refresh never take keyboard focus
  from the model opener when it already holds focus.
- **Empty state:** retains viewport and inspector, disables the model opener,
  shows an em dash for dimensions, and explicitly says that no STL files were
  found.
- **Load failure:** retains the last successfully parsed mesh when possible,
  names the failed model, and permits recovery from a later filesystem event
  or selection without reloading the page.

Future icon controls use monochrome inline SVG with an accessible name. Emoji
and text glyphs are not controls. A new status must remain distinguishable by
wording or shape without relying on color.

## Motion and interaction

Orbit damping is functional feedback and may continue only while the camera is
settling. There is no ambient camera movement, autorotation, pulsing live
indicator, decorative entrance, or model-swap transition.

A changed selected STL swaps only after successful parsing. Refresh preserves
the camera and selector focus. Selecting another model intentionally refits the
camera. The renderer caps device pixel ratio at 2 for mobile thermals and
battery life.

With `prefers-reduced-motion: reduce`, CSS animation durations collapse and
orbit damping is disabled. Keyboard focus remains visible, text contrast must
meet WCAG AA in both themes, and every state conveyed by color also has text or
shape.

## Implementation mapping

- `client/src/app.css` owns the global Sumi tokens on `:root` and overrides
  them with Kinari values under `prefers-color-scheme: light`.
- `client/src/App.svelte` owns the full-viewport layout, inspector styles,
  visible states, grid pitch control, responsive hint, and reduced-motion CSS.
- `client/src/lib/router.js` owns viewer URL identity: parsing the POSIX
  pathname against the reserved first segments `api`, `models`, `events`,
  and `static`; `pushState` for user selection; `replaceState` for every
  automatic write, whether it falls back from a URL that names no model or
  only canonicalizes the selected model's own pathname; and `popstate`
  reselection. `resolveRoute` reads only the URL, so a path the current list
  lacks stays selected. Writing the pathname the address bar already shows is
  a no-op. Grid pitch is not written to the URL.
- `src/server.rs` keeps `/api`, `/models/{*path}`, and `/events`. It serves
  embedded frontend assets, including `/static/*`. A non-asset path that
  matches the server `*.stl` rule returns `index.html` so the SPA can boot
  at that pathname. Missing `/static/*` stays 404.
- `client/src/lib/ModelPicker.svelte` owns the model opener and the
  two-column picker dialog.
- `client/src/lib/model-tree.js` and `client/src/lib/fuzzy.js` own pure
  directory-prefix derivation, recursive scoping, and filter ranking used
  by the picker. Unmatched scoped paths remain in the list; ranking does
  not drop them from the UI. There is no breadcrumb helper and no
  match-only ranker beside `rankFiles`.
- `client/src/lib/model-state.svelte.js` owns the model list, current
  selection, dimensions, and visible status. Selection identity is the
  router pathname, not `scad-live:model`. That storage key is not an
  authority and must not restore a model.
- `client/src/lib/three-viewer.js` reads scene colors from CSS, establishes
  Z-up camera and grid behavior (including settable minor pitch), caps pixel
  ratio, and preserves or refits the camera according to the load reason. It
  also owns which read still counts: a read the caller has disowned, or that a
  newer read has superseded, throws its own geometry away and never reaches
  the scene, so the mesh and dimensions on screen outlive a vanished file.
- `client/src/lib/grid-pitch.js` owns the discrete pitch table and division
  math for the fixed 400 mm plane.
- No theme preference is stored because the application follows the
  operating system. Selection is not stored in `localStorage`.

## Verification

Review this contract for meaning and valid references after editing it.

The existing Playwright suite exercises the primary flow in Chromium, including
theme resolution, responsive overflow, minimum selector height, state changes,
focus and camera retention, reduced motion, and renderer pixel ratio:

```sh
npm run test:e2e
```

It does not directly assert every design detail below. These are the standing
visual and interaction acceptance checks; changes touching an item must verify
it in a real browser and extend the automated suite where practical:

1. At desktop and phone widths, the canvas fills the viewport, the inspector
   remains within its bounds, and the document does not scroll.
2. Sumi and Kinari resolve to the color pairs in this contract, including the
   WebGL background, model, and grids.
3. The model opener is at least 44px high, has a visible focus ring, and
   retains focus and camera context through a live update. The picker dialog
   and grid pitch control remain keyboard operable with visible focus.
4. Ready, updated, reconnecting, empty, missing, and failed states remain
   readable without color; the empty state keeps the inspector present.
5. Reduced-motion mode disables prolonged decorative movement and orbit
   damping, while the renderer pixel ratio never exceeds 2.
6. Reload and `popstate` restore the model named by the pathname. Visiting
   `/` when models exist `replaceState`s to a concrete model path and does
   not revive a leftover `scad-live:model` value. After a user selection
   the address bar pathname is that relative STL path; Back returns to the
   previous model path. Deleting and rewriting the whole `dist` tree leaves
   the pathname and the selection alone: State reads `Missing: <path>` while
   the file is gone, the previous mesh and dimensions stay on screen, the
   returning file is re-read with the camera preserved, and a reload after
   that still opens the same model. A usable but non-canonically encoded
   pathname keeps its own model and only `replaceState`s the canonical
   spelling. An automatic write must not leave an unusable path on the
   history stack, and must never be a `pushState`.
7. Above 560px the picker content row is two columns of about 30% / 70%.
   At 560px and below the columns stack left-then-right at full content
   width, and the dialog remains about 80% of the viewport width. The
   left column's initial scope is the parent of the URL-selected model.
   An empty query lists every STL under that scope. Fuzzy matches sit
   above dimmed unmatched rows; Arrow/Enter skip dimmed rows; a click on
   a dimmed row still selects.
8. Grid pitch remains `1 mm` on a fresh load and is absent from the URL.
   `/api`, `/models/{*path}`, and `/events` keep their current responses.
   A missing `/static/*` asset stays 404. A non-asset `*.stl` pathname
   returns the SPA document.

## Do's and Don'ts

- Do keep the model visually dominant and the inspector quiet.
- Do source chrome, scene background, model, and grid colors from their CSS
  properties.
- Do preserve camera context through live rebuilds.
- Do write connection and render state; do not encode it only as a colored
  dot.
- Do keep the design contract aligned with observed behavior and verify UI
  claims in a real browser.
- Don't add shadows, glass effects, glowing dots, scanlines, or faux-HUD
  ornament.
- Don't expose watch or render logs in the viewport by default.
- Don't add edit, slice, export, or printer controls; scad-live previews the
  artifact and does that one job well.
- Don't persist selection in `localStorage` or treat `scad-live:model` as
  an authority.
- Don't hide unmatched picker rows, require a non-empty query before
  filenames appear, or keep empty-filter directory browsing and non-empty
  flat search as mutually exclusive modes.
- Don't restore a breadcrumb trail once the left column owns directory
  scope, and don't introduce a `/view/` prefix or put model identity under
  a reserved first segment.
- Don't make this document depend on an external design file. When shared
  guidance is reconsidered, explicitly adapt the relevant rule here.
