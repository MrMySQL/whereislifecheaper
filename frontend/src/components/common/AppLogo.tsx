interface AppLogoProps {
  size?: number;
  className?: string;
}

/**
 * WhereIsLifeCheaper brand logo - Location pin with down arrow
 * Represents "where" (location) + "cheaper" (prices going down)
 */
export function AppLogo({ size = 32, className = '' }: AppLogoProps) {
  const gradientId = `logo-grad-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-label="WhereIsLifeCheaper logo"
      role="img"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c25a3c" />
          <stop offset="100%" stopColor="#a84832" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="6" fill={`url(#${gradientId})`} />
      {/* Location pin body */}
      <path
        d="M16 5c-3.5 0-6.5 2.8-6.5 6.3 0 2.2 1.2 4.2 3 5.7l3.5 4.5 3.5-4.5c1.8-1.5 3-3.5 3-5.7C22.5 7.8 19.5 5 16 5z"
        fill="white"
      />
      {/* Inner circle */}
      <circle cx="16" cy="11" r="2.5" fill={`url(#${gradientId})`} />
      {/* Down arrow */}
      <polygon points="16,27 11,22 13.5,22 13.5,20 18.5,20 18.5,22 21,22" fill="white" />
    </svg>
  );
}
