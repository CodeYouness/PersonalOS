# Shortcuts: capture and journal from the phone

Press the Action Button, say a sentence, read the receipt. A second Shortcut
dictates the evening journal entry the same way. When the Mac is
asleep the sentence waits on the phone and is sent later. Transcription is
iOS's (the Dictate Text action); no audio reaches the app.

Prerequisite: the phone reaches the Mac as in `docs/development.md` § The phone
over Tailscale (ADR 0032). Below, `<mac-host>` is the Mac's tailnet name and
`<token>` is `PERSONALOS_PHONE_TOKEN`.

The three Shortcuts are generated, not built by hand (ADR 0036): see
[Install](#install). Never commit a `.shortcut` file: an installed one carries
the token.

## The contract the Shortcuts rely on

iOS's "Get Contents of URL" does not reliably expose the HTTP status. The
Shortcut therefore reads the JSON body only:

| Reply | Body | Meaning |
|---|---|---|
| 200 | has `receiptLine` | filed or written (or already there: a resend gets the first receipt) |
| 400 | has `error` | refused, the reason is in `error` (for example `text is required`, `saidAt must not be in the future`) |
| 401 | has `error` (`unauthorized`) | wrong or missing token |
| no reply | none | the Mac is asleep or the tailnet is down |

Rule: **the sentence was filed if and only if the reply has a `receiptLine`.**
Anything else (an `error`, or no dictionary at all) keeps it queued. The
"<reason>" in the notification is the `error` text, or `Mac unreachable` when
there was no reply.

Both routes follow it: the capture route and the journal route answer success
with `receiptLine` and every refusal with `error`, so one test serves both.

The request is `POST https://<mac-host>/api/capture` with:

- header `Authorization: Bearer <token>`, header `Content-Type: application/json`
- JSON body: `text` (the sentence), `origin` = `shortcut`, `saidAt` (when it was
  said, ISO 8601 with the Current Date action's format "ISO 8601"), `clientId`
  (made once per sentence, never changed on a resend)

`receiptLine` reads `task · Filed “call Marta”`. A sentence flushed on a later
day than it was said reads `task · Filed “call Marta” · said 2026-11-08`; the
capture is filed on the day it was said either way. A repeat of a `clientId`
files nothing and costs no model call.

## The journal route

`POST https://<mac-host>/api/journal` takes the same headers and the same
`saidAt` and `clientId` as a capture, plus `text`; the Shortcut sends no
`date` and no `origin`. The entry belongs to the day of `saidAt` in the Mac's
timezone and the Journal screen shows `saidAt`'s time, so a thought dictated at
23:50 and delivered at 08:00 is on the evening it was said. A `saidAt` more than
a few minutes ahead, or malformed, is refused with an `error`. A repeated
`clientId` writes nothing and answers the first entry with 200.

Success reads `{"ok": true, "entry": {...}, "receiptLine": "journal · Written for 2026-11-08"}`.
The same rule applies: **the entry was written if and only if the reply has a
`receiptLine`.**

## The queue

A file on the phone that only these Shortcuts read and write:
`personalos-queue.json` in the Shortcuts folder of iCloud Drive. It is one queue
shared by Capture and Journal, so Send queued flushes both. It holds
`{"items": [...]}`, oldest first, each item `{kind, text, saidAt, clientId}`
where `kind` is `capture` or `journal`; an empty queue is `{"items":[]}` or a
missing file.

It is written as JSON text -- each item turned into text, joined by commas --
because Set Dictionary Value drops a list on the phone.

To look at it: Files, iCloud Drive, Shortcuts, `personalos-queue.json`. To
clear a stuck item, edit the file there.

## What each Shortcut does

**Send queued** reads the queue and sends it oldest first: a `kind: journal`
item to `/api/journal` with `text`, `saidAt` and `clientId`, any other to
`/api/capture` with `origin: shortcut` too, each with the token. An item whose
reply has a `receiptLine` is done. The first one without stops the run: it
and every later item stay, in order, and the reason is the reply's `error`, or
`Mac unreachable` when there was none. The queue is saved once, after the
loop. The notification is the last `receiptLine` when nothing is left,
`Queued · <reason> · <N> waiting` when something is, and `Nothing waiting`
when there was nothing to send.

**Capture** (the Action Button) dictates a sentence (Dictate Text, stops after
a pause) and stops if it is empty. It makes `saidAt` (now, ISO 8601) and a
`clientId` (`phone-<saidAt>-<random>`), adds the item to the queue and saves
it **before anything touches the network**, so the sentence cannot be lost.
Then it sends the queue exactly as Send queued does: the new sentence is last,
and its receipt is the notification.

**Journal** is Capture with `kind: journal`, a `clientId` starting
`phone-journal-`, and dictation that ends on a tap, since an entry is several
sentences.

Each starts with two Text actions, the host and the token, asked for when the
Shortcut is added.

## Install

On the Mac, with Tailscale running:

```bash
npm run shortcuts:build
```

It reads the Mac's tailnet name from Tailscale (or takes `--host
https://<mac-host>`), builds the three Shortcuts from `lib/shortcuts.js`,
signs them with `shortcuts sign` (this Mac's iCloud account), and writes them
to `~/Downloads/PersonalOS-Shortcuts` (or `--out <dir>`).

1. Copy the token: `grep PERSONALOS_PHONE_TOKEN .env.local | cut -d= -f2 | tr -d '\n' | pbcopy`.
2. Delete any older Capture, Journal and Send queued, or the new ones arrive
   as "Capture 1".
3. Open each file and add it: keep the host it suggests, paste the token.
   iCloud brings them to the phone; or AirDrop the files and add them there.
4. On the phone: Settings > Action Button > Shortcut > Capture.

A Shortcut that fails with "choose a value for every parameter" has an action
the editor could not read: open it, find the action with an empty or red
field, fix `lib/shortcuts.js`, add a test for it, and rebuild.

## Journal from the Lock Screen or at a fixed time

Run Journal from the Shortcuts app, Siri, a Lock Screen widget or a time-of-day
automation (for example 22:00, Run Immediately); it needs no Action Button.

## Send queued at fixed times: a Personal Automation

Shortcuts > Automation > New Automation > Time of Day (for example 08:00,
13:00, 19:00), Run Immediately (not Run After Confirmation), action Run
Shortcut `Send queued`. Turn off Notify When Run.

## Check after building them

Not automated; do each by hand on the phone. All passed on 2026-11-11 (spec
#221), with the Shortcuts from `npm run shortcuts:build`.

1. **Mac awake.** Press the button, say a sentence. The notification shows the
   receipt line; the capture is in the Inbox with origin `shortcut`.
2. **Mac asleep.** Sleep the Mac, press the button, say a sentence. Shortcuts
   may stop on its own error rather than `Queued · Mac unreachable`: the
   sentence is already in the queue either way. Wake the Mac and run Send
   queued: the capture is filed on the day it was said.
3. **A resend after a lost reply.** Put an item back in the queue with the same
   `clientId` as one already filed and run Send queued: it counts as sent and
   the Inbox shows one capture, not two.
4. **A refused item stays.** A queue whose first item is refused (an empty
   `text`) keeps both items, in order, after Send queued, and the file is
   still valid JSON.
5. **A wrong token.** Change the token in the Shortcut, press the button: the
   notification says `Queued · unauthorized · N waiting`, the sentence is still
   in the queue. Put the token back and run Send queued.
6. **Journal.** Run Journal and dictate an entry: the notification reads
   `journal · Written for <today>` and the Journal screen shows it today with
   the time you said it.
7. **Not served.** From the phone, `https://<mac-host>/` and
   `https://<mac-host>/api/captures` are not served (ADR 0032).

Checks 3 and 4 run from the Mac too: write the queue file in
`~/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents/` and
`shortcuts run "Send queued"`.
