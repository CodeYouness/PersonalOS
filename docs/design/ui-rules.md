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

For state only (overdue, done, warning, error, estimated, a period that
spent more than came in), never decoration or categories. Each is 4.5:1 or better on the ground, on a card and on its
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

## Segmented controls and steppers

A **button does something**; a **segmented control chooses** one of a few
ways to read the same thing, and the choice is in the address. They must
not look alike.

- **A segmented control of links** is `components/Segmented.js`
  (`.segmented.is-joined`): one bordered box (radius 4, a strong hairline,
  `--surface-2`), the segments joined inside it with a hairline between
  them, each 44px high and as wide as its word; the chosen one is
  `--surface-4` with an ink ring and `aria-current="true"`. The group is
  named by what it chooses ("Period", "View", "Span"). Never two detached
  buttons for one choice. Income & spending's Month / Year and Circle /
  Columns and the Transactions card's period / All time use it; the panels'
  form choices (a movement's direction, an account's kind) are still
  detached `.seg` buttons, and become this when next changed.
- **A choice about how a thing is drawn** carries a small glyph -- an
  inline SVG in `currentColor`, 16px, hidden from a screen reader, never an
  icon library -- so it reads as "how", not "which": a ring for Circle,
  three bars for Columns. Before its word, or, where the glyph says it
  alone, instead of it: a segment with a `name` is a 44px square holding
  only the glyph, named by `aria-label` and `title` (ADR 0060). Income &
  spending's Circle / Columns is glyphs alone.
- **Where a card's choices sit** (ADR 0060, amending ADR 0053's one
  toolbar): how the card is drawn sits right beside its name -- Income &
  spending's Circle / Columns -- and what it reads (the period) on the
  right of the head. On a narrow card the name and the glyphs keep the first
  line and the period wraps under them, still on the right, its stepper
  wrapping in turn; nothing scrolls sideways. Inside one group, 8px.
- **A period is stepped**: the previous and next period on offer as 44px
  arrow squares (chevrons) around the period itself, which is the native
  select, in one joined box like a segmented control -- "‹ November 2026 ›".
  An arrow is a link named "Previous month, October 2026"; at the end of
  what is on offer it is a disabled button ("Next month"), never a link to
  nowhere. In a year the arrows step years. The select still chooses any
  period directly, and shrinks before anything scrolls.

## Forms

Fields are 44px, 16px text, `--surface-2` with a strong hairline; hover
steps the border, focus turns it to the accent and the ring shows. A label
you can see above every field (`.field > .caption`, 13px/500). A placeholder
is never the label.

**A search field** is the one field without a label above it (ADR 0058): it
sits in its card's head, which names what it searches, beside the eyebrow
and under it on a phone; its name for a screen reader is an `aria-label`,
its placeholder says what it searches ("Search all movements"), and Enter
submits it -- a plain GET form, the page rendered on the server. While a
search is listed, the head says what it lists ("12 movements matching
“lunch”") and links back to what was listed before.

**A box you write prose in grows with the text**, from its own minimum height
up to 60% of the screen (`60svh`), then scrolls inside; it shrinks back as
lines are deleted or the box is cleared, and has no drag handle. It is
`components/ProseBox.js`, never a bare `<textarea>`: the Journal's box and
its correction, the check-in's note, the review's questions and a ticket's
note all use it. The height is set by script, not `field-sizing: content`,
which older Safari on an iPhone does not have.

## Targets

44px wherever possible. **40px** (`--control-h-dense`) only in a row that
truly cannot take 44: table row editors, the capture log's actions, text
links in a row, the weekday picker. Known smaller ones, on purpose: heat-map
cells (one of thirty in a row), a tag's ×, the citation chips (32), the
habit up/down pair (30, stacked), a table row's disclosure (28), a
line's name that opens its subcategories or its movements (28), the Undo on a line filed from
a check-in note (40), a goal's drag grip (32 wide, the row's height; the
row and the panel are the other ways; ADR 0054), the parts of Income & spending's circle (a ring
about 28 to 33px thick, each part also reachable by keyboard; ADR 0050), and
the marks that show their figures in a tooltip (ADR 0053): a day's column
(one of thirty-one), a month's (one of twelve), a net worth point, a part
of the allocation bar (8px high; its legend's item is the bigger target) and
a part of Income & spending's composition bar (8px high, perhaps a pixel
wide; still a tab stop, and its line in the spending table says the same
and opens the same way, ADR 0060).

## Drag

A drag is never the only way: whatever can be dragged has a control that
does the same thing (a goal's group: the panel's Horizon; ADR 0054). Pointer
events, never HTML5 drag-and-drop, which does nothing under a finger on iOS.
A mouse picks a row up anywhere; a finger only by its grip (six dots, the
only element with `touch-action: none`), so the rest of the row still
scrolls. A press is a drag only past 8px, so a tap still opens. While held:
the row dims, a copy follows the pointer with `--shadow-float`, every place
it can go is shown -- an empty one as a dashed box -- and the one under the
pointer takes `--surface-2` and an ink ring. Outside every target, back
where it came from, or Esc: it goes back.

## Motion

Hover, press and focus only. No entrances, scroll effects or loops.

- Tokens: `--m-in` 150ms, `--m-out` 120ms, `--m-press` 90ms, `--m-panel`
  200ms; one ease, `--ease` (`cubic-bezier(.2,.8,.2,1)`), never an
  overshoot.
- A button: the fill steps darker on hover and, for a fine pointer only,
  rises 1px; a press sinks 1px and scales .985. A linked card (a CRM
  ticket) lifts 2px and its border darkens a step. Rows change background.
- Only transform, opacity and colours animate; never width, height or
  margin. `prefers-reduced-motion`: colours still change, nothing moves --
  except a dragged copy, which is the pointer's, not an animation.

## Tooltips

A chart's mark tells its exact figures in **one tooltip**,
`components/Tip.js` (ADR 0053) -- never a second mechanism, and never a
`title` alone, which reaches neither a keyboard nor a finger.

- The mark is the control: focusable (or a link), its name saying everything
  the popover says; the popover is hidden from a screen reader.
- It shows on hover with a mouse, on keyboard focus, and on a tap -- on a
  link the first tap shows and the second follows it. Escape, a tap
  elsewhere, a scroll or a resize hides it; one at a time.
- A mark that does something (`onPress`, ADR 0060) is a button with
  `aria-expanded`: a click, a tap, Enter or Space does it at once -- a part
  of the composition bar opens its line in the table, as the line's name
  does, and a second press closes it. The figures still show on hover and
  focus, and a tap shows them as it opens; if the opened row has to be
  scrolled into view the scroll hides them, and the row says the same
  figures.
- It is a popover: `--surface-elevated`, a strong hairline, radius 6,
  `--shadow-float`, 13px text in the ink, figures in tabular numbers
  right-aligned. Drawn on the body, fixed, above the mark (below without
  room) and 8px inside the viewport: no card clips it, and it never widens
  the page. It takes no pointer and does not move.
- `TipFigures` lays it out: a head (the day, the month, the part), a label
  and amount per line, a note.
- A word in a sentence can be the mark, when what it names is made of
  figures the sentence has no room for: "fixed costs" in Income &
  spending's split of what was spent lists its categories and amounts (ADR
  0060). Such a word has a dotted underline in the faint hairline, which
  darkens on hover -- not a link's solid one, as it leads nowhere.

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

## Top bar

The brand, "PersonalOS" with its mark, is the link Home (ADR 0049), named
"PersonalOS, home"; on a phone only the mark shows, a 44px target. Home is
not a nav item. The nav lists the other screens; the current one is its
word in the ink with a 2px bar under it.

## Tables

A row is one line. A long name or description is cut with an ellipsis, the
whole of it in its `title` and in the panel the row opens; a note after it
("since 2 Jan") is never the part cut. The value is the last column,
right-aligned. Dates and amounts are as wide as their text, never wrapped or
cut; the text columns share the rest. A table that can drop a column on a
narrow card does, rather than scroll -- Transactions drops the account, then
the category, measured on the card (ADR 0053); one that cannot scrolls
inside its own box, never the card or the page.

A breakdown lists **what the period holds**, never a row at zero kept for
the period before; where every line matters even at zero (income's pay
lines), it says so by listing all of them, not by a fold. **The rows an
opened line shows add up to it**: what is filed on the line itself is a row
of its own ("No subcategory"), never left out (ADR 0057).

**A figure that says nothing is not printed as one** (ADR 0059). "—" is the
screen's mark for nothing to say, in a cell as for an unknown: a share of a
net refund, or of a whole that is not positive, is "—", never "−50%" or
"100%". A percentage that would read as a measure and measure nothing -- a
savings rate with no income, or below −100% -- gives way to the money it
stands for, signed and formatted as the money beside it ("−€ 250.00"), and
what is said about it (a target met or not) stays true to the money. **A
card with nothing to say is not there** -- By tag in a period without a
tagged movement -- unless something selected in it has to stay where it can
be cleared. **Parts of a figure say what they are parts of**, in one line
that names the whole: "Of the € 751.41 spent: fixed costs € 227.94 · the
rest € 523.47" (ADR 0060), never two bare rows; a part at nothing, and so
the line, is not printed.

A list that leaves rows out or folds them says so in a **last quiet line**,
a caption, with the count and the one word that undoes it as a link to the
same place with every other parameter kept: "3 refunded movements hidden —
show" (ADR 0055), "62 interest movements folded by month — show" (ADR 0056);
undone, the same line offers the way back ("hide", "fold"). **A list that
leaves out several things says them in one line**, never one line each (ADR
0058): what it leaves out joined by " · ", then " — " and each way back as
a link, grouped by what it does -- "The newest 100 of 140 in March 2026 · 5
refunded and 12 not-counted movements hidden — show: all 140, refunded, not
counted" -- each link's `aria-label` saying the whole action. The
Transactions card's is that line. A folded row
reads as any row -- date, name, amount -- and its name is the link that
unfolds it; it never opens a panel of its own.

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
