/**
 * The client side of live updates (#293): when the page asks the framework to
 * refresh. Driven with a fake timer, no browser.
 */

import { describe, expect, it, vi } from 'vitest';

import { createLiveRefresh } from '@/components/liveRefresh.js';

function setup() {
  vi.useFakeTimers();
  const refresh = vi.fn();
  const live = createLiveRefresh({ refresh, delayMs: 100 });
  return { refresh, live };
}

describe('createLiveRefresh', () => {
  it('does not refresh when the first connection opens', () => {
    const { refresh, live } = setup();
    live.onOpen();
    vi.advanceTimersByTime(1000);
    expect(refresh).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('refreshes once for a burst of changes', () => {
    const { refresh, live } = setup();
    live.onOpen();
    live.onChange();
    live.onChange();
    live.onChange();
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('refreshes once when a dropped connection comes back', () => {
    const { refresh, live } = setup();
    live.onOpen();
    live.onError();
    live.onError();
    live.onOpen();
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    live.onOpen();
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('cancels a pending refresh when stopped', () => {
    const { refresh, live } = setup();
    live.onChange();
    live.stop();
    vi.advanceTimersByTime(1000);
    expect(refresh).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
