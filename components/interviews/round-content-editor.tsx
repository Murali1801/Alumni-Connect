'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { McqQuestion, RoundKind } from '@/lib/interview-logic';

export type ContentDraft = {
  problem?: string;
  language?: string;
  starter?: string;
  instructions?: string;
  questions?: McqQuestion[];
};

export const LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'c++', 'c', 'go', 'sql', 'pseudocode'];

const SELECT =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

let counter = 0;
export const newQuestionId = () => `q${Date.now().toString(36)}${(counter++).toString(36)}`;

export function emptyContent(kind: RoundKind): ContentDraft {
  if (kind === 'coding') return { problem: '', language: 'javascript', starter: '' };
  if (kind === 'mcq') return { instructions: '', questions: [{ id: newQuestionId(), prompt: '', options: ['', ''], answer: 0 }] };
  return {};
}

/** The problem for a coding round, or the questions and key for an MCQ round. */
export function RoundContentEditor({
  kind,
  value,
  onChange,
  idPrefix,
}: {
  kind: RoundKind;
  value: ContentDraft;
  onChange: (next: ContentDraft) => void;
  idPrefix: string;
}) {
  if (kind === 'video') {
    return (
      <p className="text-xs text-muted-foreground">
        A video round opens a call between you and the candidate in the browser. Nothing to prepare here.
      </p>
    );
  }

  if (kind === 'coding') {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-problem`}>Problem statement</Label>
          <Textarea
            id={`${idPrefix}-problem`}
            rows={6}
            value={value.problem ?? ''}
            onChange={(e) => onChange({ ...value, problem: e.target.value })}
            placeholder="Given an array of integers, return the length of the longest strictly increasing subsequence…"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-lang`}>Language</Label>
            <select
              id={`${idPrefix}-lang`}
              className={SELECT}
              value={value.language ?? 'javascript'}
              onChange={(e) => onChange({ ...value, language: e.target.value })}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-starter`}>Starter code (optional)</Label>
            <Textarea
              id={`${idPrefix}-starter`}
              rows={3}
              value={value.starter ?? ''}
              onChange={(e) => onChange({ ...value, starter: e.target.value })}
              className="font-mono text-xs"
              placeholder={'function solve(nums) {\n  \n}'}
            />
          </div>
        </div>
      </div>
    );
  }

  const questions = value.questions ?? [];
  const setQuestions = (next: McqQuestion[]) => onChange({ ...value, questions: next });
  const update = (i: number, q: Partial<McqQuestion>) => setQuestions(questions.map((x, j) => (j === i ? { ...x, ...q } : x)));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-instructions`}>Instructions (optional)</Label>
        <Input
          id={`${idPrefix}-instructions`}
          value={value.instructions ?? ''}
          onChange={(e) => onChange({ ...value, instructions: e.target.value })}
          placeholder="One correct answer per question. No negative marking."
        />
      </div>
      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={q.id} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <span className="tnum mt-1.5 text-xs text-muted-foreground">{i + 1}.</span>
              <Textarea
                rows={2}
                value={q.prompt}
                onChange={(e) => update(i, { prompt: e.target.value })}
                placeholder="Question"
                aria-label={`Question ${i + 1}`}
                className="min-h-0 flex-1"
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove question ${i + 1}`}
                disabled={questions.length <= 1}
                onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="space-y-1.5 pl-5">
              {q.options.map((opt, j) => (
                <div key={j} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${idPrefix}-${q.id}-answer`}
                    checked={q.answer === j}
                    onChange={() => update(i, { answer: j })}
                    aria-label={`Option ${j + 1} is correct`}
                    className="size-4 shrink-0 accent-[var(--primary)]"
                  />
                  <Input
                    value={opt}
                    onChange={(e) => update(i, { options: q.options.map((o, k) => (k === j ? e.target.value : o)) })}
                    placeholder={`Option ${j + 1}`}
                    className={cn('h-8', q.answer === j && 'border-primary')}
                  />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Remove option ${j + 1}`}
                    disabled={q.options.length <= 2}
                    onClick={() =>
                      update(i, {
                        options: q.options.filter((_, k) => k !== j),
                        answer: q.answer === j ? 0 : (q.answer ?? 0) > j ? (q.answer ?? 0) - 1 : q.answer,
                      })
                    }
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={q.options.length >= 6}
                  onClick={() => update(i, { options: [...q.options, ''] })}
                >
                  <Plus className="size-3" /> Option
                </Button>
                <span className="text-[11px] text-muted-foreground">Select the correct option</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={questions.length >= 50}
        onClick={() => setQuestions([...questions, { id: newQuestionId(), prompt: '', options: ['', ''], answer: 0 }])}
      >
        <Plus className="size-3.5" /> Add question
      </Button>
    </div>
  );
}
