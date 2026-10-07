---
name: Another Graph
description: A compact graph workbench for exploring local SiYuan notes.
colors:
  paper-white: "oklch(1 0 0)"
  ink-gray: "oklch(0.145 0 0)"
  ink-surface: "oklch(0.205 0 0)"
  soft-white: "oklch(0.985 0 0)"
  soft-paper: "oklch(0.97 0 0)"
  muted-ink: "oklch(0.556 0 0)"
  muted-paper: "oklch(0.708 0 0)"
  raised-ink: "oklch(0.269 0 0)"
  paper-border: "oklch(0.922 0 0)"
  ink-border: "oklch(1 0 0 / 10%)"
  ink-input: "oklch(1 0 0 / 15%)"
  destructive-light: "oklch(0.577 0.245 27.325)"
  destructive-dark: "oklch(0.704 0.191 22.216)"
  night-blue: "#11121a"
  chosen-surface: "#122737ed"
  chosen-border: "#c1e5f1"
  chosen-text: "#effaff"
  spotlight-surface: "#332818ed"
  spotlight-border: "#e5b777"
  spotlight-text: "#ffe0af"
typography:
  body:
    fontFamily: '"Geist Variable", sans-serif'
    fontSize: "13px"
    lineHeight: "1.5"
  title:
    fontFamily: '"Geist Variable", sans-serif'
    fontSize: "16px"
    fontWeight: 500
    lineHeight: "1.375"
  control:
    fontFamily: '"Geist Variable", sans-serif'
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  compact-control:
    fontFamily: '"Geist Variable", sans-serif'
    fontSize: "0.8rem"
    fontWeight: 500
  label:
    fontFamily: '"Geist Variable", sans-serif'
    fontSize: "12px"
    lineHeight: "16px"
  summary:
    fontFamily: '"Geist Variable", sans-serif'
    fontSize: "11px"
    lineHeight: "1.5"
rounded:
  xs: "0.25rem"
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
spacing:
  1: "4px"
  2: "8px"
  2.5: "10px"
  3: "12px"
  4: "16px"
components:
  button-primary-light:
    backgroundColor: "{colors.ink-surface}"
    textColor: "{colors.soft-white}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-primary-dark:
    backgroundColor: "{colors.paper-border}"
    textColor: "{colors.ink-surface}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  card-light:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ink-gray}"
    rounded: "{rounded.xl}"
    padding: "16px"
  card-dark:
    backgroundColor: "{colors.ink-surface}"
    textColor: "{colors.soft-white}"
    rounded: "{rounded.xl}"
    padding: "16px"
  chosen-label:
    backgroundColor: "{colors.chosen-surface}"
    textColor: "{colors.chosen-text}"
    height: "auto"
    padding: "3px 6px"
---

# Design System: Another Graph

## Overview

**Creative North Star: "The Graph Workbench"**

The Graph Workbench keeps the graph central and its tools compact and restrained. Controls support exploration rather than competing with the graph. Paper White and Ink Gray name the existing neutral interface palette; Night Blue names the separate canvas surface.

The owner confirmed this language on 2026-10-07. This document records the incumbent implementation, not a redesign. The owner wants to explore translucent overlay materials in a later refinement; current inspector and canvas-control surfaces remain opaque.

**Key Characteristics:**

- Graph-centered composition with overlay inspectors.
- Compact, restrained controls with moderate rounded corners.
- Neutral interface surfaces with separate semantic graph colors.
- Evidence and feedback close to the current exploration task.

Source authority for this extraction is `src/workbench/styles/theme.css`,
`src/workbench/styles/styles.css`, `src/adapters/cosmograph/canvas.css` and
the existing primitives under `src/shared/ui/`. The component preset is Base UI
Nova with neutral semantic tokens and Lucide icons. Product and logical behavior
remain governed by the sources linked in PRODUCT.md.

## Colors

### Primary

The interface primary role is neutral: Ink Surface on paper and Paper Border on
ink, with the corresponding high-contrast foreground. It identifies primary
actions without claiming a graph-state meaning.

### Neutral

Paper White and Ink Gray define the two theme backgrounds. Cards and popovers
use Paper White in the light theme and Ink Surface in the dark theme. Soft Paper
and Raised Ink supply secondary, muted and active-control surfaces. Muted Ink
and Muted Paper supply supporting text; Paper Border, Ink Border and Ink Input
supply fine outlines. The current rendered workbench is dark; the token file
also defines a light palette.

### Graph semantics

Night Blue is the canvas backdrop. Chosen labels use a cyan-tinted surface,
border and foreground; discovery spotlight labels use amber equivalents.
These role-specific literals are incumbent implementation facts, not a new
global brand accent. Node palettes are separately owned by
`src/workbench/presentation/palette.ts` and `node-colors.ts`; selection,
search rings and relationship highlights must retain their existing meanings.

**The State Meaning Rule.** Graph-state colors communicate graph state; neutral
interface tokens communicate control hierarchy.

## Typography

Geist Variable is bundled locally for the interface. Chinese text uses the
available sans-serif fallback. The same family supports headings, controls and
body text; this workbench has no display-heading role.

The frontmatter records the observed type hierarchy: base workbench body,
card/dialog titles, ordinary and compact controls, small labels and the footer
summary. Compact card titles use the ordinary text size. Inputs use a larger
base size below the component's medium breakpoint and ordinary text size above
it. Long graph labels truncate or wrap according to their role, rather than
increasing the surrounding panel width.

**The Content Integrity Rule.** Localize interface copy while preserving note
titles, source passages and user-authored preset names.

## Layout

The workbench fills its host and stacks a wrapping toolbar, graph stage and
summary footer. The graph receives the remaining space. Tool groups use an
observed compact spacing rhythm; toolbar padding is 10px vertically and 12px
horizontally, with 10px row gaps and 16px between groups. Ordinary group gaps
are 8px; icon-action groups use 4px.

Inspectors overlay the upper-right graph area with 12px outer offsets, a
320px width and 80px lower clearance. The narrow-width rules reduce inspector
width and move it into a bottom overlay below 440px. Search and scope, neighborhood
exploration, then display and maintenance follow their DOM order and wrap naturally;
no CSS ordering moves keyboard focus between visual rows. Toolbar groups preserve
control reachability in narrow hosts. Below
760px, expanded filter content temporarily hides the mounted inspector; collapse
or close restores it without changing the graph viewport or inspection state.
Below 440px, bottom inspection leaves clearance for an open collapsed category rail.

The filter editor overlays the left of the graph below the toolbar. Its
category rail combines icons with vertical labels, retains drafts while
switching categories and supports collapse. Fixed actions accompany a
scrollable content area. Search, legend and preset popovers size against the
available viewport and anchor to the toolbar through Base UI positioners. The
filter sheet portals into the graph stage. Close, Back and Escape with unapplied
exclusion or grouping drafts open a consequence prompt; cancel retains the editor
and focus, while discard completes the requested destination. Applied filters and
unsaved preset changes are retained.

## Elevation & Depth

Ordinary controls are flat, with neutral tonal states and fine outlines.
Floating inspectors already use structural soft shadows; canvas controls
already share an opaque card surface, border and low shadow. Popovers use the
primitive's medium shadow and a fine ring. Dialogs and sheets use lightly
dimmed overlays. Exact non-schema shadow values live in the sidecar.

**The Context Rule.** An inspector stays above the graph without reallocating
the graph viewport.

The owner selected a future exploration of translucent materials. Opacity,
blur and fallback behavior are unresolved implementation choices; this record
does not claim that glass surfaces already ship or prescribe an unmeasured
blur cost for a moving graph.

## Shapes

Moderate rounding unifies controls. The frontmatter radius scale derives from
the current 10px base radius at the default 16px root size. Cards use the larger
step; badges and switch tracks use the 4px extra-small step, with 3px switch thumbs.
Avoid full capsule shapes for labels and controls, as requested by the owner.
Inspectors use the base radius plus 4px. Ordinary
graph labels, chosen labels and canvas tooltips have smaller role-specific
corners; these differences are current facts to assess during refinement.

## Components

### Buttons and segmented controls

Use the existing default, outline, secondary, ghost, destructive and link
variants. Ordinary buttons and toggles are 32px high; compact variants are
28px, extra-small buttons 24px and large controls 36px. Icons inherit component
sizing, with 16px ordinary and 14px compact icons. Focus uses the existing
semantic ring, disabled states lower opacity, and primary hover lowers fill
opacity. An active toggle changes its tonal surface.

### Inputs

Inputs share the ordinary control height and radius, a semantic outline and
compact padding. Focus changes the border and adds a ring. Invalid states use
the destructive role; disabled fields preserve a visible surface distinction.
Search composes the existing input-group primitives.

### Cards, inspectors and evidence

Cards use the semantic card surface, a fine foreground ring and 16px spacing;
compact cards use 12px spacing. Titles, descriptions and actions form distinct
header roles. The inspector hosts scrolling node/edge details and source
preview actions. Nested evidence cards exist today, but their nesting is not
a reusable design rule.

### Badges and feedback

Badges are 20px high, with compact text and 4px corners. Secondary badges
communicate counts and scope; destructive variants communicate problems.
Unapplied local rules and applied-but-unsaved preset changes remain distinct:
category badges say Not applied; preset badges say Preset not saved. The save area
explains that only applied filters are saved, without applying local drafts.
Loading uses text with a spinner, acquisition issues use a reopenable diagnostic
entry, and short action feedback uses the existing toast component.

### Popovers, dialogs and sheets

Popovers use compact padding, semantic surfaces, fine rings and short
fade/scale entrances. Dialogs use a larger radius and a close action; sheets
use directional movement and scrolling content. Current transition durations
are recorded in the sidecar as observations, not a newly approved motion scale.

### Graph labels

Ordinary labels use the popover surface and truncate at their current maximum
width. Chosen labels remain in a separate overlay so normal density limits do
not remove them; they can wrap and accept pointer interaction. Spotlight
labels use their separate amber roles. Keep label drag behavior intact.

## Do's and Don'ts

### Do

- Do keep React presentation in Tailwind utilities, shared variants and semantic
  theme tokens. Keep only base resets and documented library/cross-portal bridges
  in global layered CSS; renderer styles remain inside their adapter.
- Do use the existing semantic theme roles and component variants for ordinary controls.
- Do keep graph state meanings distinct when changing appearance.
- Do use the existing compact control scale and readable localized labels.
- Do preserve overlay inspection and the filter rail's collapse/draft behavior.

### Don't

- Don't use graph node colors as a new interface brand palette.
- Don't treat the requested translucent-material experiment as already implemented.
- Don't copy note titles or private workspace content into public design examples.
- Don't turn current layout defects or nested evidence cards into prescribed reusable patterns.
