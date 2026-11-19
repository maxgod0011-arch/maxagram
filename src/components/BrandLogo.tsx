interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export function BrandLogo({ size = 'md', onClick }: BrandLogoProps) {
  const iconDim = size === 'lg' ? 36 : size === 'sm' ? 24 : 28;
  const textClass =
    size === 'lg'
      ? 'text-2xl tracking-[-0.02em]'
      : size === 'sm'
        ? 'text-base tracking-[-0.015em]'
        : 'text-lg tracking-[-0.02em]';

  const content = (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        width={iconDim}
        height={iconDim}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="1"
          y="1"
          width="34"
          height="34"
          rx="8"
          fill="#181024"
          stroke="#4A255E"
          strokeWidth="1.5"
        />
        <path
          d="M9 25V11L18 19.5L27 11V25"
          stroke="#FAF5FF"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 19.5V26.5M14.5 23.2L18 26.7L21.5 23.2"
          stroke="#E879F9"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`font-display font-bold text-slate-50 ${textClass}`}>MAXAGRAM</span>
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fuchsia-500 rounded-md cursor-pointer"
        aria-label="MAXAGRAM Home"
      >
        {content}
      </button>
    );
  }

  return content;
}
