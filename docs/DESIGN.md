---
version: alpha
name: Sumi / scad-live
description: >
  scad-live project overrides for the shared Sumi design system. The
  canonical templates live at ~/.dotfiles/agent/common/designs/sumi/DESIGN.md
  (dark = Sumi) and ~/.dotfiles/agent/common/designs/kinari/DESIGN.md
  (light = Kinari). This file records only scad-live's accent, viewport
  colors, and domain components for live STL inspection.
colors:
  # --- Project primary accent: inspection lime ---
  # Unsuffixed = Kinari (light), -dark = Sumi (dark).
  # Kinari uses an olive drafting ink so white-on-accent remains 6.6:1.
  # Sumi uses the fluorescent face of the same hue against dark chrome.
  accent: "#526400"
  accent-subtle: "rgba(82, 100, 0, 0.10)"
  accent-dark: "#d7ef52"
  accent-subtle-dark: "rgba(215, 239, 82, 0.15)"
  # The pale Sumi accent is for focus, rules, and active text. Filled
  # primary controls use this deeper value with white text (5.46:1).
  accent-strong-dark: "#637000"
  # --- 3D scene data colors (not UI chrome) ---
  model: "#899936"
  model-dark: "#dbe955"
  grid-major: "#9f9789"
  grid-major-dark: "#626b52"
  grid-minor: "#d4ccbf"
  grid-minor-dark: "#292d25"
---

# scad-live — Sumi Project Overrides

## Overview

**scad-live follows the shared Sumi design system, pairing Sumi (dark)
with Kinari (light).** The canonical sources are
`~/.dotfiles/agent/common/designs/sumi/DESIGN.md` for shared structure,
interaction, typography, spacing, and dark-theme tokens, and
`~/.dotfiles/agent/common/designs/kinari/DESIGN.md` for the warm
screen-first light palette. Shared rules are not repeated here. For common
chrome the templates win; for STL inspection semantics this document wins.

scad-live does not use Washi. It is a WebGL inspection tool used from phone
and laptop screens, not an e-paper reader. Sumi is the design-first theme;
Kinari follows `prefers-color-scheme: light`. There is no in-app theme toggle.

The interface is a **machinist's inspection bench**: a model occupies the
whole field while one compact instrument panel reports only what is needed
to answer “did the part render, and is its shape right?” It should feel
precise, quiet, and immediately usable over SSH-adjacent workflows—not like a
general CAD editor. It does not expose modeling, slicing, or fabrication
controls.

Primary accent: **inspection lime** (`#526400` Kinari / `#d7ef52` Sumi).
It recalls a high-visibility layout marker without turning the interface into
safety signage. It marks focus, the active model, and the live inspection
rule. In Sumi, filled controls use `accent-strong-dark` rather than the pale
accent so their white text keeps AA contrast.

No secondary accent is declared. Connection and render state are written as
text and shape, not encoded as a second decorative “online green.” Errors use
the inherited danger token.

Kinari spends its accent-sprinkle allowance in exactly two places: the thin
top rule of the inspector and the selected/focused model control. The 3D
scene remains an inspection surface, not a cream card decorated with tints.

## Domain model

- **An STL is the inspected artifact.** The browser renders files already
  present in `dist`; it never edits geometry or promises source-level CAD
  operations.
- **One model is inspected at a time.** Model paths are stable identities.
  The last selection is remembered locally and restored when it still exists.
- **Z is up.** The camera, ground grid, orbit behavior, and dimension order
  must agree with OpenSCAD's coordinate system.
- **Live refresh protects spatial context.** When the selected STL changes,
  its mesh and dimensions update only after the write is complete, while the
  camera target, orbit, pan, and zoom remain unchanged. Selecting a different
  model fits the camera to that model.
- **Dimensions are evidence, not decoration.** Show the axis-aligned bounding
  box as `X × Y × Z mm`, to one decimal place. Never infer tolerances, print
  time, volume, or manufacturability.
- **Server state is observable.** Scanning, loading, ready, updated,
  reconnecting, empty, and failed states are expressed in concise text. Color
  may reinforce a state but never carries it alone.

## Scene colors

The WebGL scene is domain content, so its material and grid colors are
separate from chrome tokens. Components must still source them from CSS
custom properties rather than scattering literals through JavaScript.

- **Model** (`#899936` / `#dbe955`): the inspected solid. It shares the
  accent's lime family intentionally, but uses a separate token because
  material color describes scene content rather than interaction state.
- **Major grid** (`#9f9789` / `#626b52`): primary measurement plane lines.
- **Minor grid** (`#d4ccbf` / `#292d25`): subordinate plane lines.
- **Scene background:** use the inherited `surface` / `surface-dark` token.
  Fog, when present, resolves to the same color so geometry fades without a
  visible horizon seam.
- Lighting stays neutral. Do not add colored rim lights, environment maps,
  glossy showroom reflections, gradients, or animated scan effects.

If axis helpers are added later, their X/Y/Z colors are functional 3D data,
not project accents. Use the conventional red/green/blue mapping, pair it
with visible `X`, `Y`, and `Z` labels, and verify it in both themes.

## Layout

The template's reader-oriented list/detail grid does not apply. scad-live is
a single, full-viewport inspection canvas with a compact overlay:

- **Viewport:** fills `100dvw × 100dvh`; the document itself never scrolls.
  The canvas owns drag, pinch, and two-finger pan gestures via
  `touch-action: none`.
- **Inspector panel:** anchored to the top-left with 12px mobile and up to
  30px desktop inset; width is at most 430px and never exceeds the viewport
  minus 24px. It uses `surface-raised` at high opacity, a 1px border, and the
  template's 8px card radius. It floats by position only—no drop shadow.
- **Panel header:** product name on the left and sync state on the right,
  separated from controls by a hairline. A 4px accent rule along the top is
  the project's sole persistent identity mark.
- **Controls:** one model selector followed by a two-column readout for
  dimensions and state. Labels use caption typography; values use body-sm.
  Long paths ellipsize visually but remain available as the native select
  option text/title.
- **Gesture hint:** bottom-right on wide screens, caption-muted, containing
  “Drag: orbit · Pinch: zoom · Two-finger drag: pan”. Hide it at 560px and
  below, where it would compete with the model and duplicate familiar touch
  gestures.

The panel must not grow into a generic toolbar. New read-only facts belong in
the readout; a feature that changes geometry, slicing, or printer settings
belongs in another tool.

## Components

- **Model selector:** the only selection control. It lists relative STL paths
  in deterministic order, uses the inherited input recipe, and has a visible
  label. Disable it when no models exist. Changing it loads and camera-fits
  the chosen model.
- **Sync state:** compact text with a small non-glowing status mark. Ready and
  updated use `muted`; active loading may use the inherited accent spinner;
  reconnecting and failures include explicit wording and use `danger` only
  when action or attention is required. The text container is an appropriate
  `aria-live` region without announcing every render-frame change.
- **Dimension readout:** tabular numerals where the platform font supports
  them. Preserve the exact `X × Y × Z mm` order. Use an em dash while no
  geometry is available.
- **3D viewport:** exposes an accessible label describing it as an interactive
  STL view. Pointer motion or model refresh must not steal keyboard focus from
  the selector.
- **Empty state:** keep the viewport and panel visible; disable the selector,
  show `—` for dimensions, and state that no STL files were found. Do not
  replace the application with an onboarding screen.
- **Load failure:** retain the last successfully displayed mesh when safe,
  state which model could not be loaded, and allow the next filesystem event
  or model selection to recover without a page reload.

## Motion and interaction

- Orbit damping is functional feedback and may continue while the camera is
  settling. No ambient camera movement, autorotation, pulsing live indicator,
  scanline overlay, or decorative entrance animation.
- A changed selected STL swaps only after successful parsing. Preserve the
  camera; do not flash the canvas or replay an entrance transition.
- Honor `prefers-reduced-motion`: disable nonessential panel transitions and
  reduce or disable orbit damping where it would prolong movement.
- Keep renderer pixel ratio capped for mobile thermals and battery life. The
  design goal is a modest always-on tool, not maximum GPU utilization.

## Do's and Don'ts

- Do keep the model visually dominant; the inspector is an instrument, not
  the product.
- Do preserve camera position through live rebuilds so shape differences can
  be compared in place.
- Do use the shared Sumi/Kinari tokens for all chrome and these project tokens
  for scene data.
- Don't add a second accent just to make “live” look active; write the state.
- Don't use shadows, glass spectacle, glowing dots, scanlines, or faux-HUD
  ornament. Precision comes from alignment and restraint.
- Don't use emoji or text glyphs as controls. Any future reset-camera or fit
  action uses a monochrome inline SVG and an accessible label.
- Don't expose watch/render logs in the viewport by default. Operational logs
  belong in the terminal; the browser reports only the current user-relevant
  state.
- Don't add edit, slice, export, or printer controls. scad-live previews the
  artifact and does that one job well.
