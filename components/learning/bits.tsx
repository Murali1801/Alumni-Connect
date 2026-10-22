import * as React from 'react';
import { BookOpen, FileText, HelpCircle, Link2, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { coverColor, parseInline, parseLessonText, type LessonKind } from '@/lib/learning-shared';

/** Small presentational pieces shared by the student and alumni Learning pages. */

export const KIND_ICON: Record<LessonKind, React.ComponentType<{ className?: string }>> = {
  text: FileText,
  video: PlayCircle,
  link: Link2,
  quiz: HelpCircle,
};

/** A solid colour band from the palette, never an image or gradient. */
export function CourseCover({ cover, className, icon = true }: { cover: string; className?: string; icon?: boolean }) {
  return (
    <div aria-hidden className={cn('relative flex items-center justify-center', className)} style={{ backgroundColor: coverColor(cover) }}>
      {icon && <BookOpen className="size-7 text-white/85" />}
    </div>
  );
}

/** A thin progress bar with an accessible value. */
export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className={cn('h-full rounded-full', v === 100 ? 'bg-[var(--success)]' : 'bg-primary')} style={{ width: `${v}%` }} />
    </div>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) =>
        part.kind === 'bold' ? (
          <strong key={i} className="font-semibold text-foreground">
            {part.text}
          </strong>
        ) : part.kind === 'code' ? (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
            {part.text}
          </code>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        )
      )}
    </>
  );
}

/**
 * Lesson text as headings, paragraphs, lists and code blocks. Everything is
 * rendered as React text nodes, so markup typed into a lesson shows as typed.
 */
export function LessonText({ text, className }: { text: string; className?: string }) {
  const blocks = parseLessonText(text);
  return (
    <div className={cn('space-y-3 text-sm leading-relaxed text-foreground/90', className)}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return (
              <h3 key={i} className="pt-2 text-base font-semibold text-foreground">
                <Inline text={b.text} />
              </h3>
            );
          case 'bullets':
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            );
          case 'numbers':
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </ol>
            );
          case 'code':
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground">
                <code>{b.text}</code>
              </pre>
            );
          default:
            return (
              <p key={i}>
                <Inline text={b.text} />
              </p>
            );
        }
      })}
    </div>
  );
}
