# Shortcuts: capture from the phone

Press the Action Button, say a sentence, read the receipt. When the Mac is
asleep the sentence waits on the phone and is sent later. Transcription is
iOS's (the Dictate Text action); no audio reaches the app.

Prerequisite: the phone reaches the Mac as in `docs/development.md` § The phone
over Tailscale (ADR 0032). Below, `<mac-host>` is the Mac's tailnet name and
`<token>` is `PERSONALOS_PHONE_TOKEN`. Type them into the Shortcut on the
phone. Never export a Shortcut file into this repository: it carries both.

## The contract the Shortcuts rely on

iOS's "Get Contents of URL" does not reliably expose the HTTP status. The
Shortcut therefore reads the JSON body only:

| Reply | Body | Meaning |
|---|---|---|
| 200 | has `receiptLine` | filed (or already filed: a resend gets the first receipt) |
| 400 | has `error` | refused, the reason is in `error` (for example `text is required`, `saidAt must not be in the future`) |
| 401 | has `error` (`unauthorized`) | wrong or missing token |
| no reply | none | the Mac is asleep or the tailnet is down |

Rule: **the sentence was filed if and only if the reply has a `receiptLine`.**
Anything else (an `error`, or no dictionary at all) keeps it queued. The
"<reason>" in the notification is the `error` text, or `Mac unreachable` when
there was no reply.

The request is `POST https://<mac-host>/api/capture` with:

- header `Authorization: Bearer <token>`, header `Content-Type: application/json`
- JSON body: `text` (the sentence), `origin` = `shortcut`, `saidAt` (when it was
  said, ISO 8601 with the Current Date action's format "ISO 8601"), `clientId`
  (made once per sentence, never changed on a resend)

`receiptLine` reads `task · Filed “call Marta”`. A sentence flushed on a later
day than it was said reads `task · Filed “call Marta” · said 2026-11-08`; the
capture is filed on the day it was said either way. A repeat of a `clientId`
files nothing and costs no model call.

## The queue

A file on the phone that only these Shortcuts read and write: `personalos-queue.json`
in the Shortcuts folder (Save File, Ask Where to Save off, Overwrite on).
It holds a list of dictionaries, oldest first, each
`{text, saidAt, clientId}`; an empty queue is `[]` or a missing file.

To look at it: open the Files app, On My iPhone, Shortcuts, tap
`personalos-queue.json`. To clear a stuck item, edit the file there.

## Shortcut 1: Send queued

Ends in `Sent N · M waiting`, or `Nothing waiting`.

1. Get File: `Shortcuts/personalos-queue.json`, Error If Not Found off.
2. Get Dictionary from Input. If it has no value, Show Notification
   `Nothing waiting` and Stop This Shortcut.
3. Set Variable `waiting` to the list. Set Variable `sent` to 0. Set Variable
   `left` to an empty list. Set Variable `stop` to No.
4. Repeat with Each item in `waiting`:
   1. If `stop` is Yes: Add the item to `left`, and skip to the next item
      (Add to Variable only).
   2. Get Contents of URL `https://<mac-host>/api/capture`: Method POST,
      Headers as above, Request Body JSON with `text`, `origin` = `shortcut`,
      `saidAt` and `clientId` from the item.
   3. Get Dictionary from Contents of URL. Get Dictionary Value `receiptLine`.
   4. If `receiptLine` has any value: add 1 to `sent`.
      Otherwise: Add the item to `left` and set `stop` to Yes (the Mac is
      asleep or the token is wrong: do not try the rest, keep the order).
5. Save `left` to `Shortcuts/personalos-queue.json` (Overwrite).
6. Count the items of `left` as `M`. Show Notification `Sent <sent> · <M> waiting`.

The queue is saved after the loop, once, with every item that was not
filed. A sentence is removed only after its reply had a `receiptLine`.

## Shortcut 2: Capture (the Action Button)

1. Dictate Text (Stop Listening: After Pause, Language: your usual one).
   Set Variable `said` to Dictated Text. If it is empty, Stop This Shortcut.
2. Current Date, formatted ISO 8601, into `saidAt`. Make `clientId`: Text
   `phone-` followed by the Current Date formatted ISO 8601 and a Random Number
   from 1000 to 9999.
3. Add `{text: said, saidAt, clientId}` to the end of the queue file (read it
   as in Send queued; if missing start from an empty list) and Save it
   (Overwrite). The sentence is on the phone before anything touches the
   network: it cannot be lost.
4. Send the queue exactly as Send queued does (steps 1 to 6 there, built
   inline, oldest first, the new sentence last), with these differences:
   - remember the last `error` seen (Get Dictionary Value `error`);
   - the final notification is the new sentence's `receiptLine` if it was
     filed; otherwise `Queued · <reason> · <M> waiting`, where `<reason>` is
     the `error` if it has a value, else `Mac unreachable`.
5. Show Notification.

Order matters: the queue is sent oldest first, so the new sentence is last, and
a day-old sentence is filed on the day it was said.

## The Action Button

Settings > Action Button > Shortcut > Capture.

## Send queued at fixed times: a Personal Automation

Shortcuts > Automation > New Automation > Time of Day (for example 08:00,
13:00, 19:00), Run Immediately (not Run After Confirmation), action Run
Shortcut `Send queued`. Turn off Notify When Run.

## Check after building them

Not automated; do each by hand on the phone and note the result in the PR.

1. **Mac awake.** Press the button, say a sentence. The notification shows the
   receipt line; the capture is in the Inbox with origin `shortcut`.
2. **Mac asleep.** Sleep the Mac, press the button, say a sentence. The
   notification says `Queued · Mac unreachable · 1 waiting`; the queue file
   holds it. Wake the Mac and run Send queued: `Sent 1 · 0 waiting`. The
   capture is filed on the day it was said (check across midnight too).
3. **A resend after a lost reply.** Put an item back in the queue with the same
   `clientId` as one already filed and run Send queued: it counts as sent and
   the Inbox shows one capture, not two.
4. **A wrong token.** Change the token in the Shortcut, press the button: the
   notification says `Queued · unauthorized · N waiting`, the sentence is still
   in the queue. Put the token back and run Send queued.
5. **Not served.** From the phone, `https://<mac-host>/api/captures` is not
   served (ADR 0032).
