interface BrandMarkProps {
  className?: string;
  title?: string;
}

/**
 * One obligation path splitting into two, drawn as a plotted specimen: hairline
 * strokes, a hollow plate, no fill of its own. Everything is currentColor so the
 * mark inherits whatever ink it sits in.
 */
export function BrandMark({ className = "h-10 w-10", title }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <rect
        x="3.5"
        y="3.5"
        width="41"
        height="41"
        rx="10"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <circle cx="15" cy="24" r="3" fill="currentColor" />
      <path
        d="M18 24h3.4c4.2 0 3.7-7.5 8-7.5h3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M18 24h3.4c4.2 0 3.7 7.5 8 7.5h3.2"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="33" cy="16.5" r="2.4" fill="currentColor" />
      <circle cx="33" cy="31.5" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
