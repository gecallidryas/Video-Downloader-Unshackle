interface WelcomeMarkProps {
  className?: string;
}

/**
 * Custom "stream-to-save" mark: three descending stream segments converging
 * through a funnel into a save tray. Pure geometry on currentColor so it
 * inherits the active theme. Stroke segments animate via the host CSS.
 */
export function WelcomeMark({ className }: WelcomeMarkProps) {
  return (
    <svg
      className={className}
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      role="img"
      aria-label="Unshackle"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* orbit ring */}
      <circle
        cx="60"
        cy="60"
        r="52"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="1"
        strokeDasharray="3 5"
        className="welcome-mark__ring"
      />

      {/* descending stream segments */}
      <g className="welcome-mark__stream" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M42 30 H78" className="welcome-mark__seg" style={{ ['--i' as string]: 0 }} />
        <path d="M48 44 H72" className="welcome-mark__seg" style={{ ['--i' as string]: 1 }} />
        <path d="M54 58 H66" className="welcome-mark__seg" style={{ ['--i' as string]: 2 }} />
      </g>

      {/* funnel + chevron */}
      <path
        d="M60 64 L60 84"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="welcome-mark__shaft"
      />
      <path
        d="M48 74 L60 86 L72 74"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="welcome-mark__chevron"
      />

      {/* save tray (unshackled — open ends) */}
      <path
        d="M40 92 L40 100 L80 100 L80 92"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="welcome-mark__tray"
      />
    </svg>
  );
}
