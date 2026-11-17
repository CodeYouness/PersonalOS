# UI rules

Every UI change follows this file. It is the source of truth for colour,
type, radius, controls and motion (ADR 0038); `app/globals.css` implements
it. Layout and what a card shows come from what is built, not from
`design/mockup.html`, which is history for the look. So are
`docs/design/DESIGN-*.md`: the dark Linear/Raycast/Stripe/Notion sources of
the first look.

## The look: Olive on bone

A bone page with every word in one olive green; the one filled button is the
same olive. The interface is 90 to 95% neutral, with one accent. Never violet
or lavender (nothing in OKLCH hue 270 to 330). Light only: `color-scheme:
light`, no dark theme.

| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#ecebe7` | the page ground (bone) |
| `--surface-1`, `--surface-elevated` | `#e1dfd9` | cards, panels, the capture bar |
| `--surface-2` | `#d6d5cc` | surface + 6% ink: fields, inner rows, hover |
| `--surface-3` | `#cecec4` | surface + 10% ink: selected, hover on a field |
| `--surface-4` | `#c7c8bb` | surface + 14% ink: chosen, pressed |
| `--ink` | `#38450f` | every word, large or small |
| `--ink-muted` | `#4b572a` | ink 88%: secondary text still read |
| `--ink-subtle`, `--ink-tertiary` | `#525d2e` | labels, dates, meta only |
| `--muted` | `#5d683a` | the palette's muted as dealt; 4.49:1 on a card, so text uses `--ink-subtle` |
| `--primary`, `--primary-focus` | `#38450f` | the filled button, the focus ring, links |
| `--primary-hover` / `--primary-press` | `#2c370a` / `#222b06` | accent + 14% / 26% black |
| `--primary-ink` | `#ecebe7` | words on the accent |
| `--hairline` / `-strong` / `-tertiary` | ink at 14 / 22 / 32% | rules, borders, stronger steps |
| `--series-1/2/3` | ink, surface + 60%, + 35% ink | parts of a whole in a chart |

Prefer a token to a literal, always. A new colour is a new token with its
derivation and its contrast in a comment, never a hex in a rule.

## State colours

For state only (overdue, done, warning, error, estimated), never decoration
or categories. Each is 4.5:1 or better on the ground, on a card and on its
own soft background.

| Token | Value | Soft background |
| --- | --- | --- |
| `--success` | `#12603a` | `--success-soft`, 12% |
| `--warning` | `#744c00` | `--warning-soft`, 12% |
| `--danger` | `#9a2e25` | `--danger-soft`, 12% |
| `--info` | `#3b5770` | `--info-soft`, 12% |

Colour follows the metric, never the sign. A low mood or energy is neutral.

## Type

- **Host Grotesk** (400, 500, 600) for everything, **JetBrains Mono** (400,
  500) for times, ids and counts. Both self-hosted in `app/fonts/` (OFL,
  licences beside them), loaded with `next/font/local` in `app/layout.js`.
  Nothing is fetched at build or at runtime.
- Text people read is **16px**, line height 1.5. Body is 16px.
- Headings at **500**, tracking **-0.035em**; display sizes -0.04em. Scale:
  `.display` 40, `.headline` 28, `.title` 20, `.subhead` 18.
- Labels, captions and meta are **13px**, labels at 500, in `--ink-subtle`.
  **Sentence case. Never uppercase, never tracked capitals.** Nothing under
  13px, anywhere.
- Numbers in tabular figures, right-aligned (`.num`).

## Radius

`sharp`: **4** controls (buttons, fields, chips, toggles), **6** panels (rows
and boxes inside a card, popovers, the receipt), **8** cards and frames (a
card, the capture bar). Data marks (heat cells, bars, meters) 2. Round only
for avatars and dots.

## Buttons and links

- **One filled button per view**: `.btn-primary`, the view's main action.
  Inline row editors (Save beside Cancel in a list or table) and secondary
  forms take the secondary.
- **One secondary**: `.btn-ghost`. `.btn-danger` is the same shape with its
  word in `--danger`. No gradient, shadowed, slanted or pill buttons, no
  third style.
- Buttons are **44px** high, label 15px at 500, 16px side padding. A verb and
  an object where the object is not obvious ("Add account", "Record buy").
- **One text-link look**: the ink with a faint 1px underline
  (`--hairline-tertiary`, offset 3px) that darkens to the ink on hover.
  `.link-btn` is that look on a button.
- A toggle or segmented choice, when chosen: `--surface-4` with an ink
  border. Never the accent fill.

## Forms

Fields are 44px, 16px text, `--surface-2` with a strong hairline; hover
steps the border, focus turns it to the accent and the ring shows. A label
you can see above every field (`.field > .caption`, 13px/500). A placeholder
is never the label.

## Targets

44px wherever possible. **40px** (`--control-h-dense`) only in a row that
truly cannot take 44: table row editors, the capture log's actions, text
links in a row, the weekday picker. Known smaller ones, on purpose: heat-map
cells (one of thirty in a row), a tag's ×, the citation chips (32), the
habit up/down pair (30, stacked), a table row's disclosure (28), the
Undo on a line filed from a check-in note (40).

## Motion

Hover, press and focus only. No entrances, scroll effects or loops.

- Tokens: `--m-in` 150ms, `--m-out` 120ms, `--m-press` 90ms, `--m-panel`
  200ms; one ease, `--ease` (`cubic-bezier(.2,.8,.2,1)`), never an
  overshoot.
- A button: the fill steps darker on hover and, for a fine pointer only,
  rises 1px; a press sinks 1px and scales .985. A linked card (a CRM
  ticket) lifts 2px and its border darkens a step. Rows change background.
- Only transform, opacity and colours animate; never width, height or
  margin. `prefers-reduced-motion`: colours still change, nothing moves.

## Accessibility

- Focus: a **2px ring in the accent, 2px off**, on `:focus-visible`, never
  animated and never removed. A field inside a frame (the capture bar) hands
  its ring to the frame. Scroll containers keep 4px of room so a ring at
  the edge is not clipped.
- Every control has a name; an icon-only button an `aria-label`.
- Text 4.5:1 or better on whatever it sits on; the ink is 7:1 or better.
- Elevation: only what floats over the page (capture bar, its panels, a
  popover, the drawer) carries `--shadow-float`.

## Scrollbars

Thin and quiet everywhere, the page included: `scrollbar-width: thin;
scrollbar-color: var(--hairline-tertiary) transparent`, with the
`::-webkit-scrollbar` equivalents in `globals.css`. No horizontal page
scroll: the grid's columns are `minmax(0, 1fr)`, a wide table scrolls inside
its card, and the nav scrolls sideways with its bar hidden.

## Home

Action first (ADR 0040). Home is one readable column at the check-in's
measure, and top to bottom it answers: is there something to do, is there
something worth noting. **A section exists only when it has something to
say**: "Needs you" with nothing needing you is one calm line, never an empty
card; "Worth noting" with nothing different is absent. Rows are plain, one
per thing, the whole row the target, 44px or more; no badge walls, and the
state colour only for an overdue task. The tiles are one number and one
label each, the whole tile the link, no buttons inside; under them, the
whole row wide, the net worth line goes on the money reading (ADR 0048) --
one sentence and the compact chart, one link. The check-in keeps
the one filled button. A card that only displays belongs on its screen.

## Not taken from taste-skill, and why

The rules above come from the `design-taste-frontend` skill's system,
motion and copy references. That skill is for marketing websites; this is
an app used daily. Not taken: heroes, photographs, sections and their
heights, moments and effects, scroll motion, entrances, the website nav and
footer, the action bar, the forms' mailto/endpoint recipe, the gate and its
scripts, and its kit files. Button labels are 15px, not 16, and a dense row
may take 40px: an app shows more per screen than a page.

Credit: taste-skill by Leonxlnx, MIT, github.com/Leonxlnx/taste-skill.
