import localFont from 'next/font/local';

import CaptureBar from '@/components/CaptureBar.js';
import LiveUpdates from '@/components/LiveUpdates.js';
import Topbar from '@/components/Topbar.js';

import './globals.css';

// The look's two faces (ADR 0038, docs/design/ui-rules.md), self-hosted: the
// server rebuilds on every restart and must work offline, so nothing is
// fetched at build or at runtime. Both are variable woff2 files under the
// OFL; the licence sits beside each one in app/fonts/.
const sans = localFont({
  src: './fonts/HostGrotesk-Variable.woff2',
  weight: '300 800',
  variable: '--font-host-grotesk',
  display: 'swap',
  fallback: ['-apple-system', 'Segoe UI', 'system-ui', 'sans-serif'],
});
const mono = localFont({
  src: './fonts/JetBrainsMono-Variable.woff2',
  weight: '100 800',
  variable: '--font-jetbrains-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
});

export const metadata = {
  title: 'PersonalOS',
  description: 'Capture once, let the system file it, read it back.',
};

/** The page ground of `globals.css`, so the browser's own chrome matches it. */
export const viewport = {
  themeColor: '#ecebe7',
  colorScheme: 'light',
};

/**
 * @param {{ children: import('react').ReactNode }} props
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={sans.variable + ' ' + mono.variable}>
      <body>
        <Topbar />
        {children}
        <CaptureBar />
        <LiveUpdates />
      </body>
    </html>
  );
}
