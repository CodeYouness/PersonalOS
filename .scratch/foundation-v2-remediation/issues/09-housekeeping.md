# 09 — Housekeeping

**Blocked by** 01. Independent of everything else.

## Why

Small things, none of which justify their own ticket, all of which cost more
later than now.

## What done looks like

- The fallback model name is current. The environment variable is the real
  control, but the fallback is what runs on a fresh clone, and it currently
  names a model generation that has moved on.
- The secrets check reports a readable message when a tracked file is missing
  from the working tree, instead of an unhandled error. It already fails
  closed, which is right; only the message is wrong.
- Configuration that exists for features not yet built is either removed or
  marked as planned, in place. An empty screens list and limits nothing reads
  are noise a future agent will try to honour.
- The Node version actually used locally and the one pinned for CI are either
  the same, or the difference is deliberate and written down.

## Notes

Resist expanding this. If one of these turns out to be more than a line, it
becomes its own ticket.
