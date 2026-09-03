# Foundation v2 remediation

Nine tickets, from an external code review taken against the pre-v2 bootstrap
and re-verified against the current code on 2026-09-03. Read
`docs/handoff/2026-09-03-foundation-v2.md` first — it says which findings from
that review are already fixed and must not be re-fixed.

Order:

```
01  unblocks verification          -> blocks everything
02  the data-loss bug              -> critical
03  makes the lint gate real
04  a broken data file fails loudly
05  updates validate like creates
06  dates on the client            -> blocks the mockup port
07  storage only through the store
08  docs match the code            -> after 02, 06, 07
09  housekeeping
```

01 and 02 are blocking. 03, 04, 05, 06 and 09 are independent of each other.
08 comes last because the earlier tickets change what is true.

Deliberately not here: domain operations that do not exist yet
(`addMeal`, `setHabit`, per-goal writes) belong to the first card that needs
them. Read caching belongs to a measurement, not a hunch.

The gate is `npm run verify`. After ticket 03 it will mean something.
