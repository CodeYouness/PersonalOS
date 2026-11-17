'use client';

import { openCaptureLog } from '@/components/captureLog.js';

/**
 * A row-sized button that opens the capture log, for Home's "Needs you"
 * (ADR 0040). The only client island in Home's sections: the log's drawer is
 * the shell's, so this asks for it rather than owning any state.
 *
 * @param {{ className?: string, children: import('react').ReactNode }} props
 */
export default function OpenCaptureLog({ className, children }) {
  return (
    <button type="button" className={className} onClick={openCaptureLog}>
      {children}
    </button>
  );
}
