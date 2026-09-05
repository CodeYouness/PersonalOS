import CaptureBar from '@/components/CaptureBar.js';
import Topbar from '@/components/Topbar.js';

import './globals.css';

export const metadata = {
  title: 'PersonalOS',
  description: 'Capture once, let the system file it, read it back.',
};

/**
 * @param {{ children: import('react').ReactNode }} props
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Topbar />
        {children}
        <CaptureBar />
      </body>
    </html>
  );
}
