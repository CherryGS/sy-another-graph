---
target: Graph workbench
total_score: 26
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
target_identity: "file:E:\\Project\\sy-another-graph\\apps\\siyuan-plugin\\src\\workbench\\ui\\ExplorePage.tsx"
target_fingerprint: "sha256:d3810183040ee48978c7fe15fc971fec18ace24a1f5b84c09114ebd2679993c1"
target_path: "E:\\Project\\sy-another-graph\\apps\\siyuan-plugin\\src\\workbench\\ui\\ExplorePage.tsx"
timestamp: 2026-10-07T11-47-14Z
slug: src-workbench-ui-explorepage-tsx
---

Method: dual-agent (A: /root/critique_design · B: /root/critique_evidence)

# Another Graph: workbench critique

Target: `src/workbench/ui/ExplorePage.tsx`, including toolbar, filter editor,
inspectors, settings and feedback. Surface mode: Operate. Reviewed current source
and the deployed workbench at the configured local SiYuan test origin. Assessment
A completed before Assessment B findings entered synthesis. No implementation was
changed by this review.

## Design health

| #     | Heuristic                           | Score | Main evidence                                                                                |
| ----- | ----------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| 1     | Visibility of system status         | 3     | Clear progress, counts and diagnostics; bounded search has no limit cue.                     |
| 2     | Match between system and real world | 3     | Useful relationship language; initial scope needs a native ID.                               |
| 3     | User control and freedom            | 2     | Useful exits and reset; ordinary editor exits discard unapplied drafts.                      |
| 4     | Consistency and standards           | 3     | Cohesive primitives; immediate, applied and saved states need interpretation.                |
| 5     | Error prevention                    | 2     | Input constraints help; draft-loss exits lack a local consequence cue.                       |
| 6     | Recognition rather than recall      | 2     | Rich evidence context; scoping requires carrying an ID.                                      |
| 7     | Flexibility and efficiency          | 3     | Search, gestures, presets and category collapse support experts.                             |
| 8     | Aesthetic and minimalist design     | 3     | Restrained graph-centered composition; narrow-host overlays and incidental wrapping compete. |
| 9     | Error recovery                      | 3     | Observed diagnostic names impact and recovery; other failures were not triggered.            |
| 10    | Help and documentation              | 2     | Contextual hints and external guides; no obvious complete-help entry in the workbench.       |
| Total |                                     | 26/40 | Acceptable: focused usability improvements needed.                                           |

All ten heuristics apply. Scores are qualitative review judgments, not a measured
accessibility certification.

## Design specificity and strengths

The Graph Workbench is a credible, product-specific direction. Persistent graph
exploration, directional neighborhoods, chosen/inspected distinctions, provenance
and reopenable acquisition diagnostics are specific to local SiYuan relationships.
The neutral control language suits an operational surface.

1. Evidence is a first-class destination. A node's relationships lead into actual
   source/target provenance (`NodeRelations.tsx:90`, `EdgeInspector.tsx:145`).
2. Acquisition feedback explains affected identities, omissions and recovery.
   Toasts have a reopenable diagnostic entry (`ReadDiagnostics.tsx:38,64,101`).
3. Compact ordinary-width controls support exploration without a settings detour.
   Categories and collapsible inspector sections disclose advanced tools.

## Priority issues

### P1: ordinary editor exits can discard unapplied work

Closing the editor or returning to presets unmounts locally held exclusion and
grouping drafts. Existing documentation explicitly describes discard. This is
source/documentation-confirmed behavior; neither assessment entered a draft to
reproduce its loss during the bounded browser pass.

Evidence: `FilterPresetMenu.tsx:343,370`,
`modules/content-exclusions/ui/ContentExclusions.tsx:61`,
`GraphFiltersPanel.tsx:287`, and `../../docs/mouse-keyboard_zh_CN.md:102`.

Impact: composing several rules is meaningful work, while close/back looks like
ordinary navigation. Make the consequence clear before exit. An Apply / Discard /
Keep editing exit or session draft retention is a possible direction; retention
changes the current lifecycle and needs a design ruling.
Suggested commands: `impeccable harden`, `impeccable clarify`.

### P2: left filtering and right inspection overlap in a narrow host

At 520×720 the 360px filter editor and roughly 250px inspector overlap and obscure
filter controls and supporting copy. At 700px they leave little central graph.
Observed independently in Assessment A.

Evidence: `FilterPresetMenu.tsx:355`, `styles/styles.css:119,214`.

Coordinate overlay priority at narrow embedded widths, preserving graph viewport
dimensions and existing drafts. A visible panel switch or automatic content-rail
collapse is an option requiring settled interaction behavior.
Suggested command: `impeccable adapt`.

### P2: narrow toolbar clips the Settings action

At 360×740 the display-controls group was 367.22px wide, with its right edge at
375.22px. Settings starts at x=343.22px with a 32px target; 15.22px is beyond the
viewport. Root overflow prevents horizontal recovery. Observed DOM geometry and
a control-only capture support this finding.

Evidence: `styles/styles.css:1,73,225`, `ExplorePage.tsx:177`.

Wrap or progressively disclose display controls so every action remains
reachable. Test embedded widths rather than assuming full-window desktop space.
Suggested commands: `impeccable adapt`, `impeccable layout`.

### P2: search silently caps its results at 30

A broad query returned 30 buttons without count/limit feedback. Results can match
IDs while the displayed title appears unrelated. The list is bounded by source
order; users may mistake it for complete matches.

Evidence: `graph-lookups.ts:79`, `GraphSearch.tsx:113`.

Keep the performance bound and disclose it, for example, “Showing up to 30
matches — refine the title or ID.” Identify ID matches when helpful. Ranking or
pagination would be separate behavior changes.
Suggested command: `impeccable clarify`.

### P2: initial scope requires recalling or obtaining a raw ID

The scope editor accepts a native block/document ID without an in-editor title
lookup or “use inspected node” action. Host context-menu entry remains a valid
alternative, so the capability is available but carries context-switching cost.

Evidence: `ScopeFilters.tsx:17,53`.

A human-readable picker or use-inspected-node action can store the same native ID;
retain direct ID entry for experts and settle the interaction before implementation.
Suggested commands: `impeccable clarify`, `impeccable shape`.

## Cognitive load

The default graph view is reasonably focused. Load rises in advanced filters and
combined overlays: single-focus, chunking, minimal-choice and working-memory
checks weaken in those workflows. Six filter categories, 16 node-type choices and
eight force parameters are relevant review signals, not a rule that every group
must have four choices. The ID scope field adds memory cost; panel overlap adds
management cost. Ordinary grouping and progressive disclosure generally work.

## Emotional journey

Arrival offers immediate capability. Search, neighborhood highlighting and
relationship evidence form the useful peak. Source diagnostics provide
reassurance. Raw-ID scoping, hidden search bounds, compressed panel combinations
and draft/apply/save distinctions create valleys. Relationship close and clear
selection worked predictably in the observed pass; discarding unapplied drafts
can make a configuration session end badly.

## Persona red flags

- Alex, power user: the silent search bound and toolbar relocation interrupt fast
  exploration; draft/apply/save distinctions need extra attention. Existing
  keyboard support is real, though additional global accelerators are limited.
- Jordan, first-timer: the scope label does not help obtain an ID, vertical filter
  labels require deliberate scanning, and invisible ID matches can look unrelated.
  A complete-help entry is hard to discover.
- Sam, keyboard/screen-reader user: ordinary buttons, fields, segmented controls
  and search results have meaningful names. The graph canvas itself is not a
  keyboard focus stop and has no spatial keyboard handlers
  (`adapters/cosmograph/CosmographCanvas.tsx:623,664`). Search mitigates node
  selection, but does not establish equivalent pan/zoom/group dragging.
  Actual screen-reader output, full keyboard-only completion and 200% zoom were
  not tested; further accessibility review is needed.

## Minor observations and false-positive filtering

- Desktop legend wraps into an isolated second toolbar row. At 700px, A observed
  a toolbar approximately 173px high. Plan a deliberate wrapping rhythm.
- The footer is 11px and gesture hints disappear below 760px. This is a
  discoverability issue; it is not evidence of low contrast.
- B observed meaningful control names and a visible 3px keyboard focus ring.
  Compact 32px toolbar and 28px canvas targets exceed 24 CSS px; no minimum-target
  failure was established.
- B measured no text-contrast failure; muted neutral footer text has approximately
  7.6:1 contrast against the body surface.
- Disabled preset operations are explained limitations of the standalone URL's
  missing host-storage handshake. Native preview and durable preset operations
  were not verified in this pass.
- English user-authored preset names are preserved content, not translation bugs.
- Inspector shadows and grouped canvas controls already exist. The historical UI
  report must not be applied as if those improvements were still absent.
- Translucent overlays remain an owner-requested future exploration; readability,
  graph-context interference and performance need measurement before shipping.

## Evidence synthesis

Assessment B ran one bundled scan over 22 TSX workbench files: exit 0, full result
`[]`, zero findings and no detector false positives. This scan does not cover
every rendered usability concern. Independent browser/source assessment confirmed
responsive clipping and corroborated the wrapping concerns, while avoiding
incorrect claims about names, focus, muted contrast and standalone presets.

Browser mutation preflight succeeded through the supported CDP capability. The
live detector helper failed to start, so detector-overlay injection and console
assessment were unavailable. Manual DOM dimensions, computed styles,
accessibility snapshots and bounded screenshots supplied the fallback evidence.
No visible detector overlay was produced.

## Questions to consider

- Can the inspected node become the easiest route to scope?
- Which panel deserves priority when a desktop host becomes narrow?
- Should a normal close/back action erase unapplied work?

## Confirmed next direction

The owner chose compact, restrained existing controls and the Graph Workbench
description; Paper White / Ink Gray / Night Blue name the current palette.
Future refinement should explore translucent materials. The stored workflow
default is direct code/browser iteration.

After this critique, the owner selected a subsequent Base UI migration phase:
preserve existing appearance and behavior while migrating the shadcn component
foundation, verify it, then perform visual refinement. This critique does not
implement or approve any particular draft-lifecycle or panel-priority change.
