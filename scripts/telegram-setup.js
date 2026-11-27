#!/usr/bin/env node
/**
 * `npm run telegram:setup`: walks you through the two things only you can do
 * for the Telegram channel (ADR 0064) -- creating the bot and finding your
 * chat id -- and prints the two lines to put in `.env.local`.
 *
 * It never writes `.env.local`, never keeps the token anywhere, and creates
 * nothing on Telegram: the bot is made by you, in the Telegram app. The only
 * requests it makes are `getMe` and `getUpdates`, with the token you paste.
 * It acknowledges nothing, so a message you sent stays with Telegram for the
 * server to read once the channel is on.
 *
 * Run it with the channel off: Telegram answers one listener at a time, and
 * a server already listening with this token makes this script fail (409).
 */

import { createInterface } from 'node:readline/promises';

import { chatsIn, envLines, looksLikeToken } from '../lib/telegram/setup.js';
import { errorMessage } from '../lib/domain/error-message.js';
import { makeTelegramTransport, TelegramError } from '../lib/telegram/transport.js';

/** How long one wait for your message lasts, and how many are made. */
const WAIT_SECONDS = 20;
const WAITS = 6;

const terminal = createInterface({ input: process.stdin, output: process.stdout });
/** @param {string} line */
const say = (line = '') => process.stdout.write(line + '\n');

// Ctrl-C, or an input that ends, closes the terminal in the middle of a
// question: stop there, with nothing printed that looks like a result.
let finished = false;
terminal.on('close', () => {
  if (finished) return;
  say();
  say('Setup stopped. Nothing was written.');
  process.exit(1);
});

try {
  say('Telegram channel setup');
  say('======================');
  say();
  say('Step 1. Create the bot (in the Telegram app, by hand).');
  say('  - Open a chat with @BotFather and send  /newbot');
  say('  - Give it a name and a username (the username ends in "bot").');
  say('  - BotFather answers with a token. It is a password: whoever has it');
  say('    is the bot. Do not paste it anywhere but here and .env.local.');
  say();

  let token = '';
  for (;;) {
    token = (await terminal.question('Paste the token: ')).trim();
    if (looksLikeToken(token)) break;
    say('  That does not look like a token (digits, a colon, 35 characters). Try again, or Ctrl-C to stop.');
  }

  const transport = makeTelegramTransport({ token });
  say();
  say('Step 2. Send your bot a message.');
  say('  - In Telegram, open the bot you just made and send it any text.');
  say('  - Only a private chat counts: do not add the bot to a group.');
  await terminal.question('Press Enter once you have sent it. ');

  /** @type {{ id: number, name: string }[]} */
  let chats = [];
  for (let attempt = 0; attempt < WAITS && chats.length === 0; attempt += 1) {
    if (attempt > 0) say('  Nothing yet, waiting ' + WAIT_SECONDS + ' more seconds...');
    chats = chatsIn(await transport.getUpdates({ timeoutSeconds: attempt === 0 ? 0 : WAIT_SECONDS }));
  }
  if (chats.length === 0) {
    say();
    say('No message reached the bot. Check that you wrote to the right bot, then run this again.');
    process.exitCode = 1;
  } else {
    let chat = chats[0];
    if (chats.length > 1) {
      say();
      say('More than one person has written to this bot:');
      chats.forEach((entry, index) => say('  ' + (index + 1) + '. ' + (entry.name || '(no name)') + ' -- chat ' + entry.id));
      for (;;) {
        const pick = Number((await terminal.question('Which one is you? [1-' + chats.length + '] ')).trim());
        if (Number.isInteger(pick) && pick >= 1 && pick <= chats.length) {
          chat = chats[pick - 1];
          break;
        }
      }
    }

    say();
    say('Step 3. Put these two lines in .env.local (this script does not write it):');
    say();
    for (const line of envLines(token, chat.id)) say('  ' + line);
    say();
    say('Then restart the server so it starts listening:');
    say('  launchctl kickstart -k gui/$(id -u)/personalos.serve');
    say();
    say('The bot answers that one chat and nobody else. To turn the channel off,');
    say('remove either line and restart. To replace a leaked token, send /revoke');
    say('to @BotFather and run this again.');
  }
} catch (error) {
  say();
  if (error instanceof TelegramError && error.status === 401) {
    say('Telegram refused that token. Copy it again from @BotFather and run this again.');
  } else if (error instanceof TelegramError && error.status === 409) {
    say('Something is already listening with this token -- probably the server.');
    say('Stop it, or run this before the two lines are in .env.local.');
  } else {
    say('Setup stopped: ' + errorMessage(error));
  }
  process.exitCode = 1;
} finally {
  finished = true;
  terminal.close();
}
