import { useId } from 'react';

interface AppLogoProps {
  size?: number;
  className?: string;
}

/**
 * WhereIsLifeCheaper brand logo - grocery basket with a price-drop arrow.
 * Keep in sync with public/favicon.svg.
 */
export function AppLogo({ size = 32, className = '' }: AppLogoProps) {
  const gradientId = `logo-grad-${useId().replace(/:/g, '')}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-label="WhereIsLifeCheaper logo"
      role="img"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#cc6444" />
          <stop offset="1" stopColor="#a84832" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gradientId})`} />
      {/* Basket handle, rim and body */}
      <path
        d="M22 27C22 10 42 10 42 27"
        fill="none"
        stroke="#faf7f0"
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <rect x="10" y="25" width="44" height="6.5" rx="3.25" fill="#faf7f0" />
      <path d="M13 33h38l-3.6 17.1a3 3 0 0 1-2.9 2.4h-25a3 3 0 0 1-2.9-2.4Z" fill="#faf7f0" />
      {/* Price-drop arrow */}
      <g
        fill="none"
        stroke="#b04d34"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="32,37 32,47.5" />
        <polyline points="26.5,42.5 32,48 37.5,42.5" />
      </g>
    </svg>
  );
}
