/**
 * The grab bar at the top of a bottom sheet.
 *
 * On a phone the details sheet and the graph compete for the same screen. The
 * handle lets the sheet be put away so the graph has all of it, and brought
 * back when the numbers are wanted. It answers to a tap, and to a drag in the
 * direction you would expect: up opens, down closes.
 */

import { useRef } from "react";

interface SheetHandleProps {
  open: boolean;
  onChange: (open: boolean) => void;
  /** What the sheet holds, for the accessible name: "details", "balances". */
  label: string;
  className?: string;
}

/** Further than this and the gesture is a drag rather than a tap. */
const DRAG_THRESHOLD = 24;

export function SheetHandle({ open, onChange, label, className = "" }: SheetHandleProps) {
  const start = useRef<number | null>(null);
  const dragged = useRef(false);

  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? `Hide ${label}` : `Show ${label}`}
      title={open ? `Hide ${label}` : `Show ${label}`}
      onPointerDown={(event) => {
        start.current = event.clientY;
        dragged.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        const from = start.current;
        start.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (from === null) return;

        const moved = event.clientY - from;
        if (Math.abs(moved) < DRAG_THRESHOLD) return;
        // The click that follows a drag must not undo it.
        dragged.current = true;
        onChange(moved < 0);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        onChange(!open);
      }}
      className={`group flex h-6 w-full shrink-0 touch-none items-center justify-center ${className}`}
    >
      <span className="h-1 w-9 rounded-full bg-outline transition-colors group-hover:bg-on-surface-variant" />
    </button>
  );
}
