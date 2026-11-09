/** The launchd agent definition: generated from the machine it runs on, never committed with a path. */
import { describe, expect, it } from 'vitest';

import { LAUNCHD_LABEL, launchdPlist } from '@/lib/launchd.js';

const opts = { projectDir: '/srv/app & co', npmPath: '/opt/bin/npm', pathEnv: '/opt/bin:/usr/bin', logDir: '/srv/logs' };

describe('launchdPlist', () => {
  const plist = launchdPlist(opts);

  it('runs npm run serve from the project at load and keeps it alive', () => {
    expect(plist).toContain('<string>' + LAUNCHD_LABEL + '</string>');
    expect(plist).toMatch(/<string>\/opt\/bin\/npm<\/string>\s*<string>run<\/string>\s*<string>serve<\/string>/);
    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>');
    expect(plist).toContain('<key>KeepAlive</key>\n  <true/>');
    expect(plist).toContain('<key>WorkingDirectory</key>\n  <string>/srv/app &amp; co</string>');
  });

  it('gives launchd a PATH so node is found, and logs to the given directory', () => {
    expect(plist).toContain('<string>/opt/bin:/usr/bin</string>');
    expect(plist).toContain('<string>/srv/logs/serve.log</string>');
    expect(plist).toContain('<string>/srv/logs/serve.err.log</string>');
  });
});
