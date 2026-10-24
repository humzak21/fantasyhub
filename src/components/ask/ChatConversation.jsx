import { useEffect, useRef, useState } from 'react';
import { MessagesSquare, RotateCcw, Send, X } from 'lucide-react';

import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { cn } from '../../lib/utils';
import QueryData from './QueryData.jsx';

/**
 * The chat itself: header, the conversation, and the box to type in. The same
 * tree fills the phone's bottom sheet and the website's left-hand panel; only
 * the container differs, and the container supplies the title element (a
 * sheet needs Radix's, a panel a plain heading).
 */

const SUGGESTIONS = [
  "What's my record against my opponent?",
  'Who has scored the most points in a single game?',
  'Who has made the most trades?',
  'Which player has scored the most points for me this season?'
];

const AssistantMessage = ({ message }) => {
  const muted = message.kind === 'none' || message.kind === 'off';
  return (
    <div className="space-y-2">
      <p
        role={message.error ? 'alert' : undefined}
        className={cn('text-sm leading-relaxed', message.error ? 'text-destructive' : muted ? 'text-muted-foreground' : 'text-foreground')}
      >
        {message.content}
      </p>
      {message.kind === 'data' && <QueryData queries={message.queries} />}
      {message.kind === 'answer' && message.queries?.length > 0 && (
        <details className="group text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none underline-offset-2 hover:underline">Show the data</summary>
          <div className="mt-2">
            <QueryData queries={message.queries} />
          </div>
        </details>
      )}
      {message.asOf && <p className="text-[11px] text-muted-foreground">As of {message.asOf}.</p>}
    </div>
  );
};

const ChatConversation = ({ messages, isPending, onSend, onReset, onClose, Title = 'h2' }) => {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, isPending]);

  const submit = (text = draft) => {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    onSend(trimmed);
    setDraft('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessagesSquare className="h-4 w-4 text-primary" aria-hidden="true" />
        <Title className="flex-1 text-base font-semibold text-foreground">Ask og jits</Title>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => { onReset(); inputRef.current?.focus(); }}
          disabled={!messages.length || isPending}
          aria-label="New conversation"
          title="New conversation"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close the chat">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
        {messages.length === 0 && !isPending && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask anything about the league since 2020: games, records, rivalries, lineups, trades, waivers,
              power rankings, awards. Every number comes from the league&apos;s own data, and you can see which.
            </p>
            <div className="flex flex-col items-start gap-1.5">
              {SUGGESTIONS.map((text) => (
                <Button key={text} type="button" variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-left" onClick={() => submit(text)}>
                  {text}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (message.role === 'user' ? (
          <p key={message.id} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2 text-sm text-foreground">
            {message.content}
          </p>
        ) : (
          <AssistantMessage key={message.id} message={message} />
        )))}

        {isPending && (
          <div className="space-y-2" aria-label="Looking it up">
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted" />
          </div>
        )}
      </div>

      <form
        className="flex items-end gap-2 border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Textarea
          ref={inputRef}
          value={draft}
          maxLength={300}
          rows={1}
          placeholder="Ask about the league…"
          aria-label="Your question"
          className="max-h-32 min-h-10 resize-none"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!draft.trim() || isPending} aria-label="Ask">
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
};

export default ChatConversation;
