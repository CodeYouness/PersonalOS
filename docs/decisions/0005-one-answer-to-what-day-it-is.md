# 0005. One function answers "what day is it"

- **Status** accepted
- **Date** 2026-09-01

## Context

Habits, meals, measurements and snapshots are all filed under a calendar day.
The day has to be the user's day, not the machine's.

A server clock runs in UTC. In Rome, UTC midnight arrives at 1am in winter and
2am in summer. If any part of the code asks the server what day it is, two
things happen and both are silent: ticks reset while you are still awake, and
anything recorded after midnight lands on the wrong day. The streak breaks on a
day you did not miss. Health averages count meals against the wrong date. No
error appears anywhere, and you notice weeks later, when you have already
stopped trusting your own data.

This is a trap rather than an oversight, because the wrong code **works** on a
laptop, where the server and the user are the same machine in the same zone. It
only breaks on deployment -- which is to say, once you have stopped watching.

## Decision

`lib/domain/dates.js` is the only place allowed to answer the question. It
resolves the day in `USER_TIMEZONE`, and everything that needs a date calls it:
log keys, reset boundaries, the day a write is attached to.

A day key is the string `YYYY-MM-DD`. Arithmetic over day keys is done in UTC
on purpose -- a day key carries no clock time, so shifting one must not be
affected by a daylight saving change.

`lib/config/env.js` validates the timezone at import and refuses an unknown
one, rather than letting it fall back to the server's.

The tests exercise zones other than the developer's, so the failure is
reproducible on a laptop where it would otherwise never occur.

## Consequences

- On the local path this looks like effort spent on nothing: your machine is
  already in your zone. It is not. The day this is deployed, it is the
  difference between working and quietly corrupting a year of data.
- `new Date().toISOString().slice(0, 10)` anywhere in this codebase is a bug,
  even when it produces the right answer today.
- If a second notion of "today" ever appears, delete it rather than reconciling
  it. Two sources will eventually disagree by one day.
