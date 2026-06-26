import React from 'react';
import { cn } from '@/lib/utils';

interface CinematicLogoProps {
  /** compact = sidebar; full = hero/landing */
  size?: 'compact' | 'full';
  className?: string;
  /** show the film-strip hole decorations on the icon block */
  showIcon?: boolean;
}

/**
 * Official CINEMATIC AI brand logo.
 * Uses the generated PNG at /images/cinematic-ai-logo.png with SVG fallback.
 */
export default function CinematicLogo({
  size = 'compact',
  className,
  showIcon = true,
}: CinematicLogoProps) {
  const isCompact = size === 'compact';

  return (
    <div className={cn('flex items-center gap-2.5 select-none', className)}>
      {/* Brand logo image with SVG fallback */}
      {showIcon && (
        <div
          className={cn(
            'shrink-0 relative flex items-center justify-center rounded-sm overflow-hidden bg-primary',
            isCompact ? 'w-8 h-8' : 'w-11 h-11'
          )}
        >
          <img
            src="/images/cinematic-ai-logo.png"
            alt="CINEMATIC AI"
            className="w-full h-full object-cover"
            onError={(e) => {
              // Hide broken image — bg-primary background shows through as fallback
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Wordmark */}
      <div className="flex flex-col leading-none">
        <div className={cn('flex items-baseline', isCompact ? 'gap-1' : 'gap-1.5')}>
          <span
            className={cn(
              'font-black tracking-[0.12em] uppercase text-foreground',
              isCompact ? 'text-[13px]' : 'text-2xl'
            )}
          >
            CINEMATIC
          </span>
          <span
            className={cn(
              'font-black tracking-widest text-primary',
              isCompact ? 'text-[13px]' : 'text-2xl'
            )}
          >
            AI
          </span>
        </div>
        <span
          className={cn(
            'font-semibold tracking-[0.22em] uppercase text-muted-foreground',
            isCompact ? 'text-[7px] mt-0.5' : 'text-[9px] mt-1'
          )}
        >
          FROM SCRIPT TO SCREEN
        </span>
      </div>
    </div>
  );
}
