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
- **One model is inspected at a time.** A relative STL path is its stable
  identity. The last selection is stored locally and restored only while that
  path still exists.
- **Z is up.** Camera orientation, the ground grid, orbit behavior, and the
  `X × Y × Z` dimension order agree with OpenSCAD coordinates.
- **Live refresh protects spatial context.** A successful update of the
  selected STL replaces its mesh while retaining camera position, target, pan,
  and zoom. Selecting a different model fits the camera to that model.
- **Dimensions are evidence.** Show the axis-aligned bounding box as
  `X × Y × Z mm` to one decimal place. Do not infer tolerances, volume, print
  time, or manufacturability.
- **Server state is observable.** Scanning, loading, ready, updated,
  reconnecting, empty, and failed states use concise text. The empty state
  keeps the inspector visible.

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
Long model paths ellipsize in the control, while native option text preserves
the full path.

## Spacing and shape

The reusable spacing scale is 4, 8, 12, 16, and 24px. The inspector is an
optically compact, product-specific composition: it currently uses 18px inner
padding, 13px below its header content, and 15px between its header rule and
the model label. These are not new global spacing tokens.

Small controls use a 6px radius; the inspector uses 8px. The tiny sync-state
mark may be circular, but controls must not become circular ornaments. The
system is flat: hierarchy comes from surface tone, borders, and placement, not
drop shadows or glass effects.

The only interactive control is the model selector. Its focus-visible state is
a 2px accent outline with 2px offset plus the subtle accent background. Never
remove focus indication without an equivalent replacement.

## Layout

The document is a single, non-scrolling inspection surface:

- **Viewport:** fixed at `100dvw × 100dvh`. Its canvas fills the viewport and
  owns drag, pinch, and two-finger pan gestures through `touch-action: none`.
- **Inspector:** fixed at the top-left with an inset clamped from 12px to 30px.
  It is at most 430px wide and never wider than the viewport minus 24px. A 4px
  accent top rule is its sole persistent identity mark.
- **Header:** product name on the left and concise sync state on the right,
  separated from controls by a 1px hairline.
- **Readout:** the selector spans the panel width. Dimensions and state form a
  two-column definition list beneath it.
- **Gesture hint:** fixed to the bottom-right on wide screens. Hide it at
  560px and below so it does not compete with the model or repeat familiar
  touch gestures.

The inspector must not grow into a general toolbar. Additional read-only facts
belong in the readout; geometry editing, slicing, exporting, and printer
settings belong in another tool.

## Components

- **Model selector:** the sole selection control. It lists relative STL paths
  in deterministic order, has a visible label, and is at least 44px high.
  Disable it when no model exists. A new selection loads and camera-fits that
  model.
- **Sync state:** compact text with a small, non-glowing outlined mark. Loading
  spins the accent border; reconnecting and failures use danger text. Its
  polite live region announces state changes without reporting render frames.
- **Dimension readout:** preserves `X × Y × Z mm` and uses an em dash when no
  geometry is available.
- **3D viewport:** has an accessible label identifying it as an interactive
  STL model view. Pointer motion and live refresh never take keyboard focus
  from the selector.
- **Empty state:** retains viewport and inspector, disables the selector, shows
  an em dash for dimensions, and explicitly says that no STL files were found.
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
  visible states, responsive hint, and reduced-motion CSS.
- `client/src/lib/model-state.svelte.js` owns the model list, current
  selection, dimensions, and visible status.
- `client/src/lib/three-viewer.js` reads scene colors from CSS, establishes
  Z-up camera and grid behavior, caps pixel ratio, and preserves or refits the
  camera according to the load reason.
- The selection storage key is `scad-live:model`. No theme preference is
  stored because the application follows the operating system.

## Verification

Run the document-policy check after editing this contract:

```sh
npm run test:docs
```

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
3. The selector is at least 44px high, has a visible focus ring, and retains
   focus and camera context through a live update.
4. Ready, updated, reconnecting, empty, and failed states remain readable
   without color; the empty state keeps the inspector present.
5. Reduced-motion mode disables prolonged decorative movement and orbit
   damping, while the renderer pixel ratio never exceeds 2.

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
- Don't make this document depend on an external design file. When shared
  guidance is reconsidered, explicitly adapt the relevant rule here.
