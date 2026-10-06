import { useEffect, useState } from "react";

/**
 * Tracks a media query.
 *
 * For the cases CSS cannot reach on its own: a canvas that has to know which
 * panels are floating over it, or a panel whose open state means something
 * different on a phone than on a desk.
 */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = (): void => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}
