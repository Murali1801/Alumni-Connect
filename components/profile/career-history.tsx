import { Award, Briefcase, ExternalLink, FolderGit2, GraduationCap, Link2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { formatRange, formatYearMonth } from '@/lib/linkedin/export';
import type { CareerHistory } from '@/lib/queries';

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Briefcase; children: React.ReactNode }) {
  return (
    <h3 className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      <Icon className="size-3.5" />
      {children}
    </h3>
  );
}

/**
 * Experience, education, certifications, projects and links from an alumnus'
 * LinkedIn import. Renders nothing when there is nothing to show.
 */
export function CareerHistoryCard({ history }: { history: CareerHistory | null }) {
  if (!history) return null;
  const { positions, education, certifications, projects, websites } = history;
  if (!positions.length && !education.length && !certifications.length && !projects.length && !websites.length) {
    return null;
  }

  return (
    <Card className="gap-0 p-6">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Career history</h2>
        {history.linkedin_imported_at && (
          <span className="text-xs text-muted-foreground">
            From LinkedIn · updated {formatDate(history.linkedin_imported_at)}
          </span>
        )}
      </div>

      <div className="space-y-6">
        {positions.length > 0 && (
          <section>
            <SectionTitle icon={Briefcase}>Experience</SectionTitle>
            <ol className="space-y-4 border-l border-border pl-4">
              {positions.map((p, i) => (
                <li key={`${p.company}-${p.title}-${i}`} className="relative">
                  <span
                    aria-hidden
                    className={`absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-background ${p.end === null ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                  />
                  <p className="text-sm font-medium text-foreground">{p.title || 'Role'}</p>
                  <p className="text-sm text-muted-foreground">
                    {p.company}
                    {p.location ? ` · ${p.location}` : ''}
                  </p>
                  <p className="tnum text-xs text-muted-foreground">{formatRange(p.start, p.end)}</p>
                  {p.description && (
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                      {p.description}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {education.length > 0 && (
          <section>
            <SectionTitle icon={GraduationCap}>Education</SectionTitle>
            <ul className="space-y-3">
              {education.map((e, i) => (
                <li key={`${e.school}-${i}`}>
                  <p className="text-sm font-medium text-foreground">{e.school}</p>
                  {e.degree && <p className="text-sm text-muted-foreground">{e.degree}</p>}
                  {(e.start || e.end) && (
                    <p className="tnum text-xs text-muted-foreground">{formatRange(e.start, e.end, '')}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {certifications.length > 0 && (
          <section>
            <SectionTitle icon={Award}>Certifications</SectionTitle>
            <ul className="space-y-2">
              {certifications.map((c, i) => (
                <li key={`${c.name}-${i}`} className="text-sm">
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noreferrer noopener" className="font-medium text-primary hover:underline">
                      {c.name}
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">{c.name}</span>
                  )}
                  {c.authority && <span className="text-muted-foreground"> · {c.authority}</span>}
                  {c.start && <span className="tnum text-xs text-muted-foreground"> · {formatYearMonth(c.start)}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {projects.length > 0 && (
          <section>
            <SectionTitle icon={FolderGit2}>Projects</SectionTitle>
            <ul className="space-y-3">
              {projects.map((p, i) => (
                <li key={`${p.title}-${i}`}>
                  <p className="text-sm font-medium text-foreground">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                        {p.title}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      p.title
                    )}
                  </p>
                  {p.description && (
                    <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{p.description}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {websites.length > 0 && (
          <section>
            <SectionTitle icon={Link2}>Portfolio and links</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {websites.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm text-primary hover:bg-muted"
                >
                  <ExternalLink className="size-3.5" />
                  {hostOf(url)}
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </Card>
  );
}
