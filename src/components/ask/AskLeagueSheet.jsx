import { useEffect, useRef, useState } from 'react';
import { MessageCircleQuestion, Send } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../ui/sheet';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { useAskLeague } from '../../../hooks/queries/index.js';

/**
 * Ask og jits (JITS-42): a question about the league, answered from fact cards
 * the site's own code wrote (supabase/functions/league-chat).
 *
 * What comes back is one of three things, and the sheet says which:
 *   answer — a sentence a model wrote and code checked against the cards;
 *   facts  — the matching cards themselves, when no checked sentence was
 *            possible (or no model is configured);
 *   none   — nothing in the cards is about the question.
 * The cards an answer came from are always listed under it, so every number
 * can be traced.
 */

const SUGGESTIONS = [
  "What's my record against my opponent?",
  'Who has won the championship?',
  'What was my biggest win ever?'
];

const AskLeagueSheet = ({ open, onOpenChange, initialQuestion = '' }) => {
  const [question, setQuestion] = useState(initialQuestion);
  const ask = useAskLeague();
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuestion(initialQuestion);
      ask.reset();
    }
    // Only when the sheet opens; `ask` is a stable mutation object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuestion]);

  const submit = (text = question) => {
    const trimmed = text.trim();
    if (!trimmed || ask.isPending) return;
    setQuestion(trimmed);
    ask.mutate(trimmed);
  };

  const result = ask.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0">
        <div className="mx-auto w-full max-w-lg space-y-4 px-4 pb-6 pt-2">
          <div className="space-y-1">
            <SheetTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <MessageCircleQuestion className="h-4 w-4 text-primary" aria-hidden="true" />
              Ask og jits
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Records, head-to-heads, seasons and titles since 2020. Every number comes from the league&apos;s own data.
            </SheetDescription>
          </div>

          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Textarea
              ref={inputRef}
              value={question}
              maxLength={300}
              rows={2}
              placeholder="What's my record against Humza?"
              aria-label="Your question"
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {!result && !ask.isPending && SUGGESTIONS.map((text) => (
                  <Button key={text} type="button" variant="outline" size="sm" onClick={() => submit(text)}>
                    {text}
                  </Button>
                ))}
              </div>
              <Button type="submit" size="sm" disabled={!question.trim() || ask.isPending}>
                <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                {ask.isPending ? 'Looking it up…' : 'Ask'}
              </Button>
            </div>
          </form>

          {ask.isPending && (
            <div className="space-y-2" aria-hidden="true">
              <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
              <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
            </div>
          )}

          {ask.isError && (
            <p role="alert" className="text-sm text-destructive">{ask.error.message}</p>
          )}

          {result && (
            <div className="space-y-3" role="status">
              <p className={result.kind === 'answer' ? 'text-base text-foreground' : 'text-sm text-muted-foreground'}>
                {result.text}
              </p>
              {result.sources.length > 0 && (
                <div className="space-y-1.5">
                  {result.kind === 'answer' && (
                    <p className="text-xs font-medium text-muted-foreground">From</p>
                  )}
                  <ul className="space-y-1.5">
                    {result.sources.map((source, i) => (
                      <li
                        key={i}
                        className={result.kind === 'answer'
                          ? 'text-xs text-muted-foreground'
                          : 'rounded-lg border border-border bg-muted/40 p-2.5 text-sm text-foreground'}
                      >
                        {source.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.asOf && <p className="text-xs text-muted-foreground">As of {result.asOf}.</p>}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AskLeagueSheet;
