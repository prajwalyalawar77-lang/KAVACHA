const P = {
  shield: <path d="M12 3l7 3v5.5c0 4.9-2.9 8.4-7 9.9-4.1-1.5-7-5-7-9.9V6l7-3z" />,
  scan: (
    <>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M4 12h16" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="5" cy="18" r="2.2" />
      <circle cx="19" cy="18" r="2.2" />
      <path d="M12 7.2v4.3M10.4 12.6L6.4 16.2M13.6 12.6l4 3.6M7.2 18h9.6" />
    </>
  ),
  factory: (
    <>
      <path d="M3 21h18M4 21V10l5 3V10l5 3V7l6 3v11" />
      <path d="M8 21v-3M13 21v-3M18 21v-3" />
    </>
  ),
  gauge: (
    <>
      <path d="M4.5 18a8.5 8.5 0 1 1 15 0" />
      <path d="M12 14l3.5-3.5" />
      <circle cx="12" cy="14" r="1.4" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7.5 8.5L12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" />
    </>
  ),
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  logout: (
    <>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18.5 19a5.5 5.5 0 0 0-3-4.9" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.87 1.2V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-1.51-1H2a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 3.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 3.6a1.7 1.7 0 0 0 1-1.51V2a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 3.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 20.4 9c.16.37.55.62 1.51.62H22a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-3.6-3.6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.6L21 19H3L12 3.6z" />
      <path d="M12 9v4.5M12 16.6v.1" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.7" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 6.3" />
      <path d="M20 4v7h-7" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M10 11v6M14 11v6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  download: (
    <>
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5H6a2 2 0 0 0-2 2v9" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10M12 14v2.5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6M20 16v-9" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l2.1-2.1a4 4 0 0 0-5.7-5.7L11 7.3" />
      <path d="M14 10a4 4 0 0 0-5.7 0L6.2 12a4 4 0 0 0 5.7 5.7l1.1-1.1" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2v2h-2zM18 14h2M14 18h2v2h-2zM19 19h1v1h-1z" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
      <path d="M19 15l.7 2.1 2.3.9-2.3.8L19 21l-.7-2.2-2.3-.8 2.3-.9L19 15z" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5M3 17l9 5 9-5" />
    </>
  ),
  compare: (
    <>
      <path d="M7 4v12M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM17 8v12" />
      <path d="M4 8h6M14 12h6" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 2.6-6.4" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4.5l3 1.8" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16" />
      <path d="M15 9h3a2 2 0 0 1 2 2v10M2 21h20" />
      <path d="M8 7h3M8 11h3M8 15h3M8 19h3" />
    </>
  ),
  audit: (
    <>
      <path d="M8 4h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8" />
      <path d="M4 4h4v16H4z" />
      <path d="M12 9h5M12 13h5M12 17h3" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8-8M15 8l3 3M17 6l3 3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 7.8v.1" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4L11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7v5l-4 2v-7L4 5z" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5L12 13l8.5-6.5" />
    </>
  ),
  phone: <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2C11 19.5 4.5 13 4.5 5.5a2 2 0 0 1 2-2z" />,
  bank: (
    <>
      <path d="M3 9l9-5 9 5" />
      <path d="M5 9v8M9.5 9v8M14.5 9v8M19 9v8M3 21h18" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </>
  ),
  fingerprint: (
    <>
      <path d="M8 5.5A7 7 0 0 1 12 4.5c3.9 0 7 3.1 7 7" />
      <path d="M5 9a7 7 0 0 1 2-4M4.5 13a8 8 0 0 1 .7-2.5M8 20c1.2-1.5 1.8-3.3 1.8-5.2a2.2 2.2 0 1 1 4.4 0c0 2.4-.6 4.5-1.8 6.2" />
      <path d="M19 13.5c0 2.4-.6 4.5-1.7 6.3M15 9a3 3 0 0 0-6 0c0 3.6-.8 6.7-2.2 9.2" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
    </>
  ),
  graduation: (
    <>
      <path d="M2.5 9L12 4l9.5 5L12 14 2.5 9z" />
      <path d="M6 11v4.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V11M21.5 9v6" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  play: <path d="M7 4.5l12 7.5-12 7.5V4.5z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  swap: (
    <>
      <path d="M4 8h14l-3-3M20 16H6l3 3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.4 3.8 5.3 3.8 8.5S14.5 18.1 12 20.5c-2.5-2.4-3.8-5.3-3.8-8.5S9.5 5.9 12 3.5z" />
    </>
  ),
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />,
};

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.7, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {P[name] || P.info}
    </svg>
  );
}

export function Logo({ size = 38, withText = false, subtitle = true }) {
  return (
    <span className="flex items-center gap-3">
      <span
        className="relative inline-flex items-center justify-center rounded-xl border border-accent-400/30 bg-gradient-to-br from-accent-500/20 to-navy-900 text-accent-300 shadow-glow-sm"
        style={{ width: size, height: size }}
      >
        <Icon name="shield" size={size * 0.55} strokeWidth={1.9} />
      </span>
      {withText && (
        <span className="leading-tight">
          <span className="block font-mono text-lg font-bold tracking-[0.22em] text-white">KAVACHA</span>
          {subtitle && (
            <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-accent-300/80">
              Document Trust Intelligence
            </span>
          )}
        </span>
      )}
    </span>
  );
}
