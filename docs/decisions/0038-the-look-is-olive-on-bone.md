# 0038. The look is "Olive on bone", and ui-rules.md is its source of truth

- **Status** accepted
- **Date** 2026-11-16

## Context

Every screen was ported from `design/mockup.html`: a near-black page, a
lavender-blue accent, thin display weights, uppercase tracked labels at 11px,
a 12px-and-16px radius ladder, assembled from four website analyses
(`docs/design/DESIGN-*.md`: Linear, Raycast, Stripe, Notion). In daily use it
read as small and dim -- much of the text at 11 to 13px in grey on black --
with stock white scrollbars on a dark page and the nav pushing the page
sideways on a narrow window.

The check-in (ADR 0037) is about to be rebuilt, mostly for the phone, and the
next screens will be built by agents. They need one written set of rules for
how anything looks, not a mockup to eyeball.

The user chose a look from three dealt by the `design-taste-frontend`
(taste-skill) design skill: the palette "olive-on-bone", Host Grotesk with
JetBrains Mono, and the "sharp" radius scale.

## Decision

**The app's look is "Olive on bone", and `docs/design/ui-rules.md` is the
source of truth for colour, type, radius, controls and motion.**
`app/globals.css` implements it; every UI change follows it.

- **`design/mockup.html` is no longer the visual source of truth.** Layout
  and what a card shows still come from what is built; the mockup's colours
  and type are history, and so are `docs/design/DESIGN-*.md`.
- **Light only.** One bone ground, one olive ink for every word, a muted
  olive only for labels and meta, the same olive as the one filled button
  and the focus ring. No violet, no dark theme.
- **State colours are quiet and for state only**, each 4.5:1 or better on a
  card and on its own soft background. A chart's parts of a whole use a
  neutral ramp of the ink, not the state colours.
- **Type**: Host Grotesk and JetBrains Mono, **self-hosted** under
  `app/fonts/` with their OFL licences and loaded with `next/font/local`: the
  server rebuilds on every restart and must work offline, so no font is
  fetched at build or at runtime. Read text is 16px, labels 13px at 500 in
  sentence case, nothing under 13px, no uppercase.
- **Controls**: 44px targets (40 only in a dense row, listed in the rules),
  one filled button per view, one secondary, one link look, a 2px focus ring
  in the accent that is never removed.
- **Token names are kept** (`--canvas`, `--surface-1..4`, `--ink-*`,
  `--primary*`), so components did not change to take the look; only their
  values and the rules using them did.
- **From taste-skill, only what fits an app**: its system, motion
  (hover, press, focus) and copy rules. Its website parts -- heroes,
  photographs, sections, moments, scroll effects, the gate and scripts -- are
  not used, and its files are not copied into the repository.

## Consequences

- An agent doing UI work reads one short file. A new colour is a token with
  its derivation and contrast, never a literal.
- The palette's own muted (`#5d683a`) measures 4.49:1 on a card, so text
  uses `--ink-subtle` (`#525d2e`), nudged toward the ink. Do not "restore"
  the dealt value for text.
- A few controls stay under 40px on purpose (heat-map cells, a tag's ×,
  citation chips, the habit up/down pair, a table row's disclosure); the
  rules list them. Do not raise them without a layout that has room.
- The two Finances panels (an account, a movement) each keep their own filled
  button: they head separate sections a screen apart. If they ever share a
  viewport, one of them becomes the secondary.
- The mockup goes stale in colour and type. It is not updated to match; the
  rules are.
