type NavIconName = 'plan' | 'feeding' | 'stock' | 'management'

const commonProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export default function NavIcon({ name }: { name: NavIconName }) {
  switch (name) {
    case 'plan':
      return (
        <svg {...commonProps} aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <line x1="4" y1="10" x2="20" y2="10" />
          <line x1="8" y1="3" x2="8" y2="7" />
          <line x1="16" y1="3" x2="16" y2="7" />
        </svg>
      )
    case 'feeding':
      return (
        <svg {...commonProps} aria-hidden="true">
          <path d="M4 12 A8 5.5 0 0 0 20 12 Z" />
          <path d="M3.5 12 H20.5" />
          <path d="M9 8 C8.3 6.8 8.5 5.6 9.4 4.6" />
          <path d="M12 8 C11.5 6.5 11.8 5.2 13 4" />
        </svg>
      )
    case 'stock':
      return (
        <svg {...commonProps} aria-hidden="true">
          <rect x="3" y="5.5" width="14" height="3.4" rx="1" />
          <rect x="3" y="10.3" width="18" height="3.4" rx="1" />
          <rect x="3" y="15.1" width="9" height="3.4" rx="1" />
        </svg>
      )
    case 'management':
      return (
        <svg {...commonProps} aria-hidden="true">
          <rect x="5" y="3.5" width="14" height="18" rx="2" />
          <path d="M9 3.5 V2.5 A1 1 0 0 1 10 1.5 H14 A1 1 0 0 1 15 2.5 V3.5" />
          <path d="M8.3 12 L10 13.7 L13.5 9.8" />
          <line x1="8.3" y1="17" x2="15.7" y2="17" />
        </svg>
      )
  }
}
