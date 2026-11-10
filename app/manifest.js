/**
 * The web app manifest (ticket #227): "Add to Dock" in Safari, or "Install as
 * app" in Chrome, opens PersonalOS in its own window with this name and icon.
 * Colours are the canvas of `globals.css`.
 *
 * @returns {import('next').MetadataRoute.Manifest}
 */
export default function manifest() {
  return {
    name: 'PersonalOS',
    short_name: 'PersonalOS',
    description: 'Capture once, let the system file it, read it back.',
    start_url: '/',
    display: 'standalone',
    background_color: '#010102',
    theme_color: '#010102',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
