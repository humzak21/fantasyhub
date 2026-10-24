import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, ArrowUp, CalendarDays, ChevronDown, ChevronRight, Flame, ListChecks, Swords, Trophy } from 'lucide-react';

import { cn } from '../../lib/utils';
import QueryData from './QueryData.jsx';

/**
 * The chat's pieces in the Menu drawer's own language (`TabBarMenu`): lit
 * cards, a three-across tile grid, and rows with an icon and a chevron. The
 * phone's drawer and the desktop's side panel both render these, so the two
 * differ only in their container.
 */

export const LIT = 'shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]';

const ROW =
  'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors ' +
  'text-foreground hover:bg-accent/50 active:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export const TOPICS = [
  { id: 'rivalries', label: 'Rivalries', icon: Swords, questions: ["What's my record against my opponent?", 'Who owns me all-time?', 'Which rivalry has been the most lopsided?'] },
  { id: 'records', label: 'Records', icon: Trophy, questions: ["Who's been the most successful manager?", "Who's been the worst team of all time?", 'What is the highest score ever?'] },
  { id: 'seasons', label: 'Seasons', icon: CalendarDays, questions: ['Who won each season?', 'Which season was the most dominant?', 'Who has missed the playoffs the most?'] },
  { id: 'pickems', label: "Pick'ems", icon: ListChecks, questions: ["Who's leading pick'ems this season?", "Who's hit the most TD parlays?", "How's my pick'em record?"] },
  { id: 'trades', label: 'Trades', icon: ArrowLeftRight, questions: ['Who has made the most trades?', "Who's the best trader in the league?", 'Biggest FAAB bid ever?'] },
  { id: 'takes', label: 'Takes', icon: Flame, questions: ['Which takes are still open?', "Who's posted the best takes?", 'Who says Hell Nah the most?'] }
];

/** The empty chat: what it can do, the topic tiles, and a topic's questions as rows. */
export function TopicPicker({ onAsk, intro = true, columns = 'grid-cols-3' }) {
  const [topicId, setTopicId] = useState(null);
  const topic = TOPICS.find((t) => t.id === topicId);
  return (
    <div className="space-y-4">
      {intro && (
        <p className="text-sm text-muted-foreground">
          Ask anything about the league since 2020. Opinions come with their reasons, and every figure comes from the
          league&apos;s own data.
        </p>
      )}
      <div role="group" aria-label="Topics" className={cn('grid gap-2', columns)}>
        {TOPICS.map((t) => {
          const Icon = t.icon;
          const active = t.id === topicId;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => setTopicId(active ? null : t.id)}
              className={cn(
                'flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card text-foreground active:bg-accent/60'
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="w-full truncate text-center text-xs font-medium">{t.label}</span>
            </button>
          );
        })}
      </div>
      {topic && (
        <div className="space-y-1 border-t border-border pt-3">
          {topic.questions.map((q) => (
            <button key={q} type="button" className={ROW} onClick={() => onAsk(q)}>
              <topic.icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">{q}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The verdict is the first sentence; the reasoning is the rest. */
const splitVerdict = (text) => {
  const m = String(text ?? '').match(/^(.+?[.!?])(\s+[\s\S]*)?$/);
  return m ? [m[1], (m[2] ?? '').trim()] : [String(text ?? ''), ''];
};

/** One answer, as a lit card: the verdict large, the reasoning under it, the data as a row. */
export function AnswerCard({ message }) {
  const [open, setOpen] = useState(false);
  if (message.error) {
    return (
      <div role="alert" className={cn('rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive', LIT)}>
        {message.content}
      </div>
    );
  }
  const muted = message.kind === 'none' || message.kind === 'off';
  const [verdict, reasoning] = message.kind === 'answer' ? splitVerdict(message.content) : [message.content, ''];
  const hasData = message.queries?.length > 0 && (message.kind === 'answer' || message.kind === 'data');
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-card', LIT)}>
      <div className="space-y-1.5 p-3.5">
        <p className={cn('text-[15px] leading-snug', muted ? 'text-muted-foreground' : 'font-semibold text-foreground')}>{verdict}</p>
        {reasoning && <p className="text-sm leading-relaxed text-muted-foreground">{reasoning}</p>}
        {message.kind === 'data' && <QueryData queries={message.queries} />}
      </div>
      {hasData && message.kind === 'answer' && (
        <div className="border-t border-border">
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={cn(ROW, 'rounded-none px-3.5 text-xs text-muted-foreground')}>
            <span className="flex-1">Show the data</span>
            <span className="text-[11px]">{message.asOf ? `As of ${message.asOf}` : ''}</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
          </button>
          {open && <div className="px-3.5 pb-3.5"><QueryData queries={message.queries} /></div>}
        </div>
      )}
    </div>
  );
}

/** The question, as the Menu draws a lit tile. */
export const QuestionBubble = ({ children }) => (
  <p className="ml-auto w-fit max-w-[85%] rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground">{children}</p>
);

/** The conversation: the topic picker when empty, then questions and answer cards. */
export function ConversationBody({ messages, isPending, onAsk, scrollRef, className, pickerColumns, intro = true }) {
  const innerRef = useRef(null);
  const ref = scrollRef ?? innerRef;
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, isPending, ref]);
  return (
    <div ref={ref} className={cn('space-y-3', className)} aria-live="polite">
      {messages.length === 0 && !isPending && <TopicPicker onAsk={onAsk} columns={pickerColumns} intro={intro} />}
      {messages.map((m) => (m.role === 'user' ? <QuestionBubble key={m.id}>{m.content}</QuestionBubble> : <AnswerCard key={m.id} message={m} />))}
      {isPending && (
        <div aria-label="Looking it up" className={cn('space-y-2 rounded-xl border border-border bg-card p-3.5', LIT)}>
          <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-full animate-pulse rounded bg-muted/70" />
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted/70" />
        </div>
      )}
    </div>
  );
}

/** The box to type in: a lit card holding the field and a round send button. */
export function Composer({ onSend, isPending, autoFocus = false, className, placeholder = 'Ask about the league…' }) {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState('');
  const submit = () => {
    const text = draft.trim();
    if (!text || isPending) return;
    onSend(text);
    setDraft('');
    inputRef.current?.focus();
  };
  return (
    <form
      className={cn(
        'flex items-center gap-2 rounded-xl border border-border bg-card p-1.5 pl-3 transition-colors',
        'focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20',
        LIT,
        className
      )}
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      {/* The card is the focus ring (focus-within above). The field's own
          outline comes from the unlayered `.dark *:focus-visible` rule in
          globals.css, which no layered utility can override, so it is
          switched off inline: an outline drawn inside the card, around
          only the text, was the second ring. */}
      <input
        ref={inputRef}
        value={draft}
        maxLength={300}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label="Your question"
        style={{ outline: 'none' }}
        className="min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground md:text-sm"
        onChange={(e) => setDraft(e.target.value)}
      />
      <button
        type="submit"
        aria-label="Ask"
        disabled={!draft.trim() || isPending}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
      >
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}
