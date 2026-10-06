import { useCallback, useState } from "react";

/**
 * A yes/no preference that survives a reload.
 *
 * Used for whether a panel is open. Returns `undefined` until the person has
 * chosen, so the caller can pick a default that depends on the screen it is
 * on rather than committing to one here.
 *
 * Storage can be unavailable — private windows, blocked site data — and a
 * panel that will not open because a write threw would be absurd, so every
 * access is guarded and the in-memory value always wins.
 */
export function useStoredFlag(
  key: string
): [boolean | undefined, (next: boolean) => void] {
  const [value, setValue] = useState<boolean | undefined>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? undefined : stored === "1";
    } catch {
      return undefined;
    }
  });

  const update = useCallback(
    (next: boolean): void => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Nothing to do: the choice still holds for this visit.
      }
    },
    [key]
  );

  return [value, update];
}
