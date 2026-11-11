# 0034. The Shortcuts are generated, not built by hand

- **Status** accepted
- **Date** 2026-11-11

## Context

Spec #221 put three Shortcuts on the phone (Capture, Journal, Send queued) and
said the repository documents each one action by action, with no exported
Shortcut file committed, because an installed one carries the host and the
token.

Built by hand, Send queued alone is about sixty actions, with a loop and four
nested Ifs, and Capture and Journal each need the same loop again. The hand
checks found two ways the editor fails silently: a text comparison on a
Dictionary Value loses its operand, and Set Dictionary Value drops a list. Each
cost a sentence on the phone before it was found -- the second one before the
sentence reached the queue, against rule 2.

## Decision

The Shortcuts are built as data in `lib/shortcuts.js` and written out by
`npm run shortcuts:build`, which converts them with `plutil` and signs them
with `shortcuts sign --mode anyone` on the Mac, under its iCloud account.

- **No secret is written in.** Each Shortcut starts with two Text actions that
  are import questions: the host, pre-filled with the Mac's tailnet name, and
  the token, empty. The built files are still never committed.
- **The queue is `{"items": [...]}`, written as JSON text**: each item is a
  dictionary turned into text, joined by commas. Not a bare list, not Set
  Dictionary Value.
- **Text comparisons are made on a Text action.**
- **Capture and Journal carry the flush themselves**, rather than running Send
  queued: running another Shortcut by name does not survive an import reliably,
  and a generator repeats the loop for free.
- The tests hold what the hand checks found; the hand checks in
  `docs/shortcuts.md` still decide whether a build works.

## Consequences

- Rebuilding after a change is one command and an import, not an evening of
  tapping. A Shortcut changed by hand on the phone is overwritten by the next
  import.
- `shortcuts:build` is macOS only and needs the iCloud account the phone uses.
- The action format is Apple's and undocumented. An action the editor cannot
  read shows as an empty or red field; the fix goes in `lib/shortcuts.js` with a
  test, never only on the phone.
