import { useState } from 'react';
import { Package } from 'lucide-react';

interface MediaCoverProps {
  src: string;
  alt: string;
  title?: string;
  aspect?: '4/3' | '16/9' | 'fill';
  className?: string;
}

export function MediaCover({
  src,
  alt,
  title,
  aspect = '4/3',
  className = '',
}: MediaCoverProps) {
  const [failed, setFailed] = useState(false);

  const aspectClass =
    aspect === '16/9' ? 'aspect-video' : aspect === '4/3' ? 'aspect-[4/3]' : 'h-full w-full';

  return (
    <div
      className={`relative overflow-hidden bg-[#140E1F] ${aspectClass} ${className}`}
    >
      {!failed && src ? (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#1C122B] via-[#130D1E] to-[#0B0810] px-4 text-center">
          <Package className="mb-2 h-8 w-8 text-fuchsia-400/80" />
          {title ? (
            <span className="text-xs font-medium text-slate-400 line-clamp-1">{title}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
