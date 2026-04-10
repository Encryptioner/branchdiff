import { useEffect, useRef, useState } from 'react';
import { fetchTreeFingerprint } from '../lib/api';

const POLL_INTERVAL = 3000;

export function useTreeStaleness() {
  const [isStale, setIsStale] = useState(false);
  const baselineRef = useRef<string | null>(null);

  function resetStaleness() {
    baselineRef.current = null;
    setIsStale(false);
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function poll() {
      if (cancelled) {
        return;
      }

      try {
        const fingerprint = await fetchTreeFingerprint();

        if (cancelled) {
          return;
        }

        if (baselineRef.current === null) {
          baselineRef.current = fingerprint;
        } else if (fingerprint !== baselineRef.current) {
          setIsStale(true);
        }
      } catch {
        // ignore fetch errors
      }

      if (!cancelled) {
        timer = setTimeout(poll, POLL_INTERVAL);
      }
    }

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return { isStale, resetStaleness };
}
