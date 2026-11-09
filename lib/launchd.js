/**
 * The launchd user agent that keeps `npm run serve` up (ticket #227). The
 * definition is generated on the Mac that will run it, so no path, username
 * or hostname is ever committed: see scripts/launchd-plist.js.
 */

export const LAUNCHD_LABEL = 'personalos.serve';

/** @param {string} s */
function xml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * @param {{ projectDir: string, npmPath: string, pathEnv: string, logDir: string }} o
 * @returns {string} the property list
 */
export function launchdPlist({ projectDir, npmPath, pathEnv, logDir }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(npmPath)}</string>
    <string>run</string>
    <string>serve</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(projectDir)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(pathEnv)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(logDir)}/serve.log</string>
  <key>StandardErrorPath</key>
  <string>${xml(logDir)}/serve.err.log</string>
</dict>
</plist>
`;
}
