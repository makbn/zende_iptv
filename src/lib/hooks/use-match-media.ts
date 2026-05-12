"use client";

import { useEffect, useState } from "react";

/**
 * Subscribes to `window.matchMedia`. Initial render uses `initial` (default false)
 * until the client effect runs — avoids SSR hydration mismatch.
 */
export function useMatchMedia(query: string, initial = false): boolean {
  const [matches, setMatches] = useState(initial);

  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
