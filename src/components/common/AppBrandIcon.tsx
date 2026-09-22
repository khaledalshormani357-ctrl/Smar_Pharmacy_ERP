import React from 'react';

interface AppBrandIconProps {
  className?: string;
  size?: number;
}

export const AppBrandIcon: React.FC<AppBrandIconProps> = ({ className = 'w-10 h-10', size }) => {
  const style = size ? { width: `${size}px`, height: `${size}px` } : undefined;

  return (
    <div
      style={style}
      className={`relative rounded-2xl bg-gradient-to-br from-blue-700 to-blue-600 shadow-md shadow-blue-600/20 flex items-center justify-center shrink-0 overflow-hidden ${className}`}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full p-1.5"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Subtle inner border */}
        <rect x="6" y="6" width="88" height="88" rx="20" stroke="white" strokeOpacity="0.15" strokeWidth="2" />

        {/* Medical Cross Base */}
        <rect x="42" y="20" width="16" height="60" rx="6" fill="white" />
        <rect x="20" y="42" width="60" height="16" rx="6" fill="white" />

        {/* Emerald Vitality Ribbon Accents */}
        <path
          d="M 50 24 C 64 24 74 34 74 48 C 74 54 71 59 66 63 C 64 65 61 62 63 60 C 67 57 69 53 69 48 C 69 39 61 32 50 32 Z"
          fill="#10B981"
        />
        <path
          d="M 50 76 C 36 76 26 66 26 52 C 26 46 29 41 34 37 C 36 35 39 38 37 40 C 33 43 31 47 31 52 C 31 61 39 68 50 68 Z"
          fill="#059669"
        />

        {/* Central Smart Tech Node */}
        <circle cx="50" cy="50" r="9" fill="#2563EB" stroke="white" strokeWidth="2.5" />
        <circle cx="50" cy="50" r="4.5" fill="#10B981" />
      </svg>
    </div>
  );
};
