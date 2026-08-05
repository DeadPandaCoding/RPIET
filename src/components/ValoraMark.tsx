/**
 * Valora brand mark — a shield whose checkmark transitions into an upward
 * arrow, per the Valora logo. Rendered in `currentColor` so it adapts to
 * both dark (sidebar) and light (auth / loading) surfaces.
 */
export function ValoraMark({
  className = 'size-6',
  strokeWidth = 1.7,
}: {
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3.4 18.8 5.9v5.1c0 4.2-2.8 6.9-6.8 8.8-4-1.9-6.8-4.6-6.8-8.8V5.9z" />
      <path d="m9.1 12.9 2.1 2.1 3.4-3.8" />
      <path d="M14.6 8.6 18.5 9l-.4 3.9" />
    </svg>
  )
}
