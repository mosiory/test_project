import { useEffect, useRef } from 'react';

export const LIVE_REFRESH_EVENT = 'khabgah:live-refresh';

/** فراخوانی خودکار در هر چرخهٔ به‌روزرسانی زنده (فقط وقتی صفحه فعال است) */
export function useLiveRefresh(callback: () => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      callbackRef.current();
    };
    window.addEventListener(LIVE_REFRESH_EVENT, handler);
    return () => window.removeEventListener(LIVE_REFRESH_EVENT, handler);
  }, []);
}

export function triggerLiveRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(LIVE_REFRESH_EVENT));
}
