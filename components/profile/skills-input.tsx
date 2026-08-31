'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function SkillsInput({
  skills,
  onChange,
  suggestions = [],
  label = 'Add a skill',
}: {
  skills: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  label?: string;
}) {
  const [draft, setDraft] = React.useState('');

  function add(raw: string) {
    const s = raw.trim();
    if (!s) return;
    if (skills.some((x) => x.toLowerCase() === s.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...skills, s]);
    setDraft('');
  }

  const unused = suggestions.filter((s) => !skills.some((x) => x.toLowerCase() === s.toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder={label}
          aria-label={label}
        />
        <Button type="button" size="icon" variant="outline" onClick={() => add(draft)} aria-label="Add skill">
          <Plus className="size-4" />
        </Button>
      </div>

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(skills.filter((x) => x !== s))}
              aria-label={`Remove ${s}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              {s}
              <X className="size-3" />
            </button>
          ))}
        </div>
      )}

      {unused.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Suggestions</p>
          <div className="flex flex-wrap gap-1.5">
            {unused.slice(0, 12).map((s) => (
              <button key={s} type="button" onClick={() => add(s)}>
                <Badge variant="outline" className="font-normal text-muted-foreground hover:bg-muted">
                  + {s}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
