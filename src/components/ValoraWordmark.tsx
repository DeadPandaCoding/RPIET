/**
 * Valora wordmark — the brand name set in Outfit with the shield mark.
 * Rendered as text so the logo adapts to any theme/color context (no image
 * assets, no plates). Colors/sizes come from the caller via textClassName
 * and markClassName.
 */
export function ValoraWordmark({
  className = '',
  textClassName = '',
  markClassName = 'size-6',
}: {
  className?: string
  textClassName?: string
  markClassName?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`font-logo font-semibold lowercase leading-none tracking-tight ${textClassName}`}
      >
        valora
      </span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={markClassName}
        aria-hidden="true"
      >
        <path d="M12 3.4 18.8 5.9v5.1c0 4.2-2.8 6.9-6.8 8.8-4-1.9-6.8-4.6-6.8-8.8V5.9z" />
        <path d="m9.1 12.9 2.1 2.1 3.4-3.8" />
        <path d="M14.6 8.6 18.5 9l-.4 3.9" />
      </svg>
    </span>
  )
}
