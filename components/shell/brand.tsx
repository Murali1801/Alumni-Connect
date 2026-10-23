import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The AlumniBridge mark: two people joined by a bridge, alumni and students
 * meeting. Designed with ChatGPT; solid brand blue, no gradients. The same image
 * is app/icon.png (favicon) and public/brand/logo-mark.png (large uses).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/logo-mark-192.png" alt="AlumniBridge" width={32} height={32} className={cn('size-8 shrink-0', className)} />
  );
}

/** The mark with the two-tone wordmark, for headers and the sign-in pages. */
export function Wordmark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BrandMark className={size === 'sm' ? 'size-7' : 'size-8'} />
      <span className={cn('font-bold tracking-tight text-foreground', size === 'sm' ? 'text-base' : 'text-lg')}>
        Alumni<span className="text-primary">Bridge</span>
      </span>
    </span>
  );
}

export function Brand({
  href = '/',
  subtitle,
  className,
}: {
  href?: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn('flex items-center gap-2.5', className)}>
      <BrandMark />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="font-display text-[15px] text-foreground">AlumniBridge</span>
        {subtitle ? (
          <span className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
