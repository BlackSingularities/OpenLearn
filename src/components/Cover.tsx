/** Znak marki: atom-orbita z kropką akcentu. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false" className="brand-mark">
      <rect width="32" height="32" rx="9" fill="var(--text)" />
      <ellipse cx="16" cy="16" rx="11" ry="4.6" fill="none" stroke="var(--bg)" strokeWidth="1.8" transform="rotate(-30 16 16)" />
      <ellipse cx="16" cy="16" rx="11" ry="4.6" fill="none" stroke="var(--bg)" strokeWidth="1.8" opacity="0.45" transform="rotate(30 16 16)" />
      <circle cx="16" cy="16" r="3.2" fill="#ff7a59" />
    </svg>
  );
}
