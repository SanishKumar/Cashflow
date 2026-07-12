interface BrandMarkProps {
  className?: string;
  title?: string;
}

/** A small split-and-settle mark: one payment path cleanly becomes two. */
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
      <defs>
        <linearGradient id="cashflow-brand-gradient" x1="7" y1="5" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8a70ff" />
          <stop offset="0.52" stopColor="#6947f4" />
          <stop offset="1" stopColor="#4324c8" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="42" height="42" rx="15" fill="url(#cashflow-brand-gradient)" />
      <circle cx="14" cy="24" r="3.25" fill="white" />
      <path d="M18 24h3.5c4.4 0 3.9-8 8.4-8h4" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <path d="M18 24h3.5c4.4 0 3.9 8 8.4 8h4" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <path d="m31 13 4 3-4 3M31 29l4 3-4 3" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
