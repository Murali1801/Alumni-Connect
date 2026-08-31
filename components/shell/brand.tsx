import Link from 'next/link';
import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white',
        className
      )}
      style={{ backgroundImage: 'linear-gradient(135deg, var(--brand-1), var(--brand-2), var(--brand-3))' }}
    >
      SJ
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
        <span className="font-display text-[15px] text-foreground">SJCEM Network</span>
        {subtitle ? (
          <span className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
