# 0008. Canonical and derived data, and the one exception

- **Status** accepted
- **Date** 2026-09-02

## Context

v1 stored `band: 'overdue'` on tasks. "Overdue" is a state a task reaches
because days passed — it is a function of the calendar, not a decision anybody
made. Storing it meant the data could disagree with the date, and when they
disagreed the data won, silently.

The same temptation exists everywhere: a streak counter, a cached net worth, a
completion percentage. Each is cheap to store and each drifts.

## Decision

**Do not persist what can be reliably derived from canonical data, unless
there is an explicit reason.**

Canonical is what you decided or a source observed. Everything else is
computed, and all the computing lives in `lib/domain/derive/` so there is one
implementation per question rather than one per screen.

`overdue` is derived from `band` plus a new canonical field `bandSetOn`, the
day the band was chosen:

```
isOverdue = band === 'today' && bandSetOn < today && !completedAt
```

`URGENCY_BANDS` no longer contains `overdue`, so it cannot be written.
Changing a task's band resets `bandSetOn`, so a task dragged out of the
overdue column does not snap back.

### The one exception: NetWorthSnapshot

A snapshot is derived from observations and is stored anyway, because it is a
**history that cannot be recomputed**. Yesterday's market value is gone
tomorrow; recomputing the series would rewrite your past every time you looked
at it. The FX rates used are stored inside the snapshot for the same reason.

That is the shape of a valid exception: not "it would be faster", but "the
inputs no longer exist".

## Consequences

- The board can show an overdue column while the data never says a task is
  overdue.
- Derivations are tested once, in `tests/domain/derive-*.test.js`, instead of
  being reimplemented per card with slightly different edge cases.
- Migration v1→v2 rewrites stored `overdue` bands to `today` with a
  `bandSetOn` in the past, which derives back to overdue. Nothing is invented.
- Before persisting any computed value, state which inputs will be gone. If
  they will still be there, compute it.
