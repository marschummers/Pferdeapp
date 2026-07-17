type HealthRowIconName = 'weight' | 'impfung' | 'wurmkur' | 'hufschmied'

const commonProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export default function HealthRowIcon({ name }: { name: HealthRowIconName }) {
  switch (name) {
    case 'weight':
      return (
        <svg {...commonProps} aria-hidden="true">
          <rect x="4" y="9" width="16" height="11" rx="2.5" />
          <circle cx="12" cy="14.8" r="2.1" />
          <line x1="12" y1="14.8" x2="13.6" y2="13.1" />
          <path d="M9 9 C9 6.2 10.3 4 12 4 C13.7 4 15 6.2 15 9" />
        </svg>
      )
    case 'impfung':
      return (
        <svg {...commonProps} aria-hidden="true">
          <g transform="rotate(45 12 12)">
            <rect x="6" y="10" width="11" height="4" rx="1" />
            <line x1="17" y1="12" x2="21" y2="12" />
            <line x1="6" y1="12" x2="3" y2="12" />
            <line x1="9" y1="10" x2="9" y2="14" />
            <line x1="11.5" y1="10" x2="11.5" y2="14" />
          </g>
        </svg>
      )
    case 'wurmkur':
      return (
        <svg {...commonProps} aria-hidden="true">
          <g transform="rotate(-45 12 12)">
            <rect x="4" y="9.5" width="16" height="5" rx="2.5" />
            <line x1="12" y1="9.5" x2="12" y2="14.5" />
          </g>
        </svg>
      )
    case 'hufschmied':
      return (
        <svg {...commonProps} aria-hidden="true">
          <path d="M7 19 V13.5 A5 5 0 0 1 17 13.5 V19" />
          <line x1="7" y1="19" x2="7" y2="21" />
          <line x1="17" y1="19" x2="17" y2="21" />
        </svg>
      )
  }
}
