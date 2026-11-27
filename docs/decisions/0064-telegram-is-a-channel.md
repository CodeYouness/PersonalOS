# 0064. Telegram is a channel: what comes in, what may leave, who may write

- **Status** accepted
- **Date** 2026-11-27

## Context

Spec #285 gives the system a way to come and find me: an evening reminder
that the check-in is open, and a light way in for a sentence when I am away
from the dashboard and from the phone's Shortcuts. ADR 0037 already fixed the
frame: Telegram carries light data only, the one writer process hosts every
channel, and nothing of mine is put on the internet.

ADR 0010 says integrations sync in and the app never calls out. A bot that
sends messages calls out. Either 0010 gets an exception nobody wrote down, or
Telegram is something else and its own rules are stated. This record takes
the second.

This repository is public. A bot token is a password, and a chat id says who
I am.

## Decision

**A channel is not an integration.** An integration (ADR 0010) is a source
the system reads from, on its clock, and never writes to. A *channel* is a
way a sentence of mine reaches the system from outside a page, and the only
kind of code that may send one out. Telegram is the first. Channels are a
closed list, `CHANNEL_IDS` in `personalos.config.js`.

### What comes in

- **Long polling, from the `serve` process.** The bot is asked for updates by
  the server on my machine; nothing listens on the internet and no webhook
  exists. The loop starts beside the scheduler from `instrumentation.js`, by
  the same test (`env.schedulerEnabled`, ADR 0062): never under `dev`, the
  sandbox, a script or Vitest.
- **One chat.** An update is read only as far as its chat id. Anything that
  is not a message from the one configured chat is dropped there: no reply,
  no log line, nothing of its content read or kept. It is acknowledged, so
  it is not delivered again.
- **Text only.** A message with no text -- a voice note, a photo, a file,
  captioned or not -- gets one fixed line that points to the phone Shortcut,
  which stays the path that cannot lose a sentence (ADRs 0032, 0033, 0036).
- **Handled first, acknowledged after.** Telegram has no acknowledge call:
  asking for updates from an offset drops everything below it. An update is
  handled, and only the next request moves the offset past it. A process that
  dies in between is sent the update again.
- **The update id is the key of a message.** A handler must be safe to call
  twice with the same one: what it files, it files once per update id (a
  capture's `clientId`, one capture per origin and id, ADR 0033). Within one
  process the loop recognises a redelivery itself and does not hand it over.
- **A failure never ends the loop.** A lost connection, a refused request, a
  handler or a send that throws: the update stays unacknowledged, the loop
  waits (`limits.telegramBackoffMinMs`, doubled up to
  `limits.telegramBackoffMaxMs`) and asks again.

### What may leave

- **A reply to something I sent in that chat**, and nothing else from this
  ticket. Every sentence the bot can say is fixed text in
  `lib/telegram/texts.js`, with no slot for data.
- **Never from a render.** No route and no page sends; loading a page never
  calls Telegram (rule 3). A message leaves from the loop, as a reply, or --
  with the later tickets -- from a schedule.
- **A message the system starts carries nothing of mine** (#291, #292): no
  amount, no balance, no name, no content. Only a reply to a question I asked
  there may carry data. The rule is recorded here so the tickets that add
  those messages are held to it.

### Who may write

- **One module talks to Telegram**, both ways: `lib/telegram/`. The transport
  (`transport.js`) is the one place a request is made, and it is an argument
  of the loop (`channel.js`), so every test runs against a fake.
- **A channel writes through the same paths as a screen.** It owns no
  storage and adds no rule: a text is handed to a handler, and the handler
  uses the store and the action registry like any route. In this ticket the
  handler files nothing and answers with a fixed acknowledgement.
- **The token and the chat id come from the environment only**
  (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, read in `lib/config/`, server
  only). Either missing means the channel is off: no transport is made and no
  request leaves. A chat id that is not a whole number is refused at start,
  by the variable's name and never by its value.
- **The token never reaches a log.** Telegram's API wants it in the address,
  so no error from the transport carries the address or its cause: only the
  method, the status and Telegram's description.
- **The bot is made by a human.** `npm run telegram:setup` walks through
  BotFather and finding the chat id, and prints the two lines for
  `.env.local`. It writes no file and acknowledges no update. An agent never
  creates the account and never writes `.env.local`.

### Recorded like a schedule

A run's `schedule` may be a channel's id (`RUN_SUBJECTS`: the schedules and
the channels). The channel being off is one `skipped` run with the reason
`not-configured`, written at start unless that is already the last thing its
log says -- so a restart adds no row, and "off" is not mistaken for "never
tried" (ADR 0063). A channel has no slot and is never due: it is not a
schedule and is not listed among them.

## Consequences

- With the laptop closed nothing is received. Telegram keeps an unread update
  for about a day; a sentence that must not be lost goes through the
  Shortcut.
- Telegram answers one listener per token. A second process asking with the
  same token -- the setup script while the server listens -- is refused
  (409), and the script says so.
- A poll in flight when the server stops is cut with the process (ADR 0067).
  An update handled and not yet acknowledged comes back on the next start;
  that is the case the update id exists for.
- Until a text is filed (#292), the acknowledgement of a text may be sent
  twice after a crash between handling and acknowledging: nothing is filed
  yet, so there is no key to recognise it by. Nothing is lost or duplicated
  in the data, because nothing is written.
- `features.telegramCapture` stays off: it turns on with the ticket that
  files a text (#292).
- Anyone who finds the bot gets silence, and learns nothing but that it
  exists.
