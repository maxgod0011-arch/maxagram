import { useEffect, useState } from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  storyRing?: 'none' | 'unseen' | 'seen';
  isOnline?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, { box: string; text: string; dot: string }> = {
  xs: { box: 'h-7 w-7', text: 'text-[10px]', dot: 'h-2 w-2 right-0 bottom-0' },
  sm: { box: 'h-9 w-9', text: 'text-xs', dot: 'h-2.5 w-2.5 right-0 bottom-0' },
  md: { box: 'h-11 w-11', text: 'text-sm', dot: 'h-2.5 w-2.5 right-0.5 bottom-0.5' },
  lg: { box: 'h-14 w-14', text: 'text-base', dot: 'h-3 w-3 right-0.5 bottom-0.5' },
  xl: { box: 'h-20 w-20 sm:h-24 sm:w-24', text: 'text-xl sm:text-2xl', dot: 'h-3.5 w-3.5 right-1 bottom-1' },
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'MX';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function Avatar({
  src,
  name,
  size = 'md',
  storyRing = 'none',
  isOnline = false,
  className = '',
}: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [src]);

  const dims = SIZE_CLASSES[size];
  const hasImage = Boolean(src && src.trim().length > 0 && !imgFailed);

  const ringWrapper =
    storyRing === 'unseen'
      ? 'rounded-full bg-gradient-to-tr from-fuchsia-600 via-pink-500 to-amber-300 p-[2px]'
      : storyRing === 'seen'
        ? 'rounded-full bg-fuchsia-200/20 p-[2px]'
        : '';

  const inner = (
    <div
      className={`relative overflow-hidden rounded-full bg-[#1C142B] ${dims.box} ${
        storyRing !== 'none' ? 'ring-2 ring-[#0B0810]' : 'border border-fuchsia-200/[0.12]'
      } flex items-center justify-center shrink-0`}
    >
      {hasImage ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className={`font-display font-semibold tracking-tight text-fuchsia-200 select-none ${dims.text}`}>
          {getInitials(name)}
        </span>
      )}
    </div>
  );

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {ringWrapper ? <div className={ringWrapper}>{inner}</div> : inner}
      {isOnline ? (
        <span
          title="Online now"
          className={`absolute rounded-full bg-emerald-400 ring-2 ring-[#0B0810] ${dims.dot}`}
        />
      ) : null}
    </div>
  );
}
