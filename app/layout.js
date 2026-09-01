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
      <body>{children}</body>
    </html>
  );
}
