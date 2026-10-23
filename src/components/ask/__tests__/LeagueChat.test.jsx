/**
 * Ask og jits, the chat: a launcher for approved members only, a conversation
 * that carries its earlier turns into each question, and every answer's data
 * one tap away (open, when the chat could not word an answer it could check).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let ask;
vi.mock('../../../../hooks/queries/index.js', () => ({ useAskLeague: () => ask }));

const { LeagueChatProvider, useLeagueChat, historyOf } = await import('../LeagueChatContext.jsx');
const { default: LeagueChat } = await import('../LeagueChat.jsx');

const RECORD = {
  sql: "select wins, losses from x",
  ok: true,
  columns: ['wins', 'losses'],
  rows: [[5, 3]],
  rowCount: 1
};

/** A useAskLeague stand-in that answers each question from `replies`. */
const askWith = (replies) => {
  const queue = [...replies];
  return {
    isPending: false,
    mutate: vi.fn((vars, { onSuccess, onError }) => {
      const next = queue.shift();
      if (next instanceof Error) onError(next);
      else onSuccess(next);
    })
  };
};

const OpenWith = ({ question }) => {
  const chat = useLeagueChat();
  return <button type="button" onClick={() => chat.open(question)}>open with question</button>;
};

const renderChat = ({ enabled = true, extra = null } = {}) => render(
  <LeagueChatProvider enabled={enabled}>
    {extra}
    <LeagueChat />
  </LeagueChatProvider>
);

beforeEach(() => {
  ask = askWith([]);
});

describe('LeagueChat', () => {
  it('offers the launcher to approved members only', () => {
    const { unmount } = renderChat({ enabled: false });
    expect(screen.queryByRole('button', { name: 'Ask og jits' })).toBeNull();
    unmount();
    renderChat();
    expect(screen.getByRole('button', { name: 'Ask og jits' })).toBeInTheDocument();
  });

  it('opens as a side panel with suggestions, and a suggestion asks it', async () => {
    ask = askWith([{ kind: 'answer', text: "You're 5-3 against Humza.", queries: [RECORD], asOf: '2026 week 6' }]);
    renderChat();
    await userEvent.click(screen.getByRole('button', { name: 'Ask og jits' }));
    const panel = screen.getByRole('complementary', { name: 'Ask og jits' });
    await userEvent.click(within(panel).getByRole('button', { name: "What's my record against my opponent?" }));
    expect(ask.mutate).toHaveBeenCalledWith({ question: "What's my record against my opponent?", history: [] }, expect.any(Object));
    expect(within(panel).getByText("You're 5-3 against Humza.")).toBeInTheDocument();
    expect(within(panel).getByText('As of 2026 week 6.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask og jits' })).toBeNull();
  });

  it('keeps the data behind "Show the data" for an answer', async () => {
    ask = askWith([{ kind: 'answer', text: "You're 5-3.", queries: [RECORD], asOf: null }]);
    renderChat();
    await userEvent.click(screen.getByRole('button', { name: 'Ask og jits' }));
    await userEvent.type(screen.getByLabelText('Your question'), 'my record?{Enter}');
    const details = screen.getByText('Show the data').closest('details');
    expect(details.open).toBe(false);
    expect(within(details).getByRole('columnheader', { name: 'wins' })).toBeInTheDocument();
    expect(within(details).getByRole('cell', { name: '5' })).toBeInTheDocument();
  });

  it('shows the data outright when the chat could not word a checked answer', async () => {
    ask = askWith([{ kind: 'data', text: "Here's what the league's data says:", queries: [RECORD], asOf: null }]);
    renderChat();
    await userEvent.click(screen.getByRole('button', { name: 'Ask og jits' }));
    await userEvent.type(screen.getByLabelText('Your question'), 'my record?{Enter}');
    expect(screen.queryByText('Show the data')).toBeNull();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('sends the earlier turns with a follow-up, and says when a question failed', async () => {
    ask = askWith([
      { kind: 'answer', text: "You're 5-3 against Humza.", queries: [RECORD], asOf: null },
      new Error("That's 30 questions today. Ask again tomorrow.")
    ]);
    renderChat();
    await userEvent.click(screen.getByRole('button', { name: 'Ask og jits' }));
    const box = screen.getByLabelText('Your question');
    await userEvent.type(box, 'my record vs Humza?{Enter}');
    await userEvent.type(box, 'and in the playoffs?{Enter}');
    expect(ask.mutate.mock.calls[1][0]).toEqual({
      question: 'and in the playoffs?',
      history: [
        { role: 'user', content: 'my record vs Humza?' },
        { role: 'assistant', content: "You're 5-3 against Humza." }
      ]
    });
    expect(screen.getByRole('alert')).toHaveTextContent("That's 30 questions today.");
  });

  it('starts over, and closes', async () => {
    ask = askWith([{ kind: 'none', text: "I couldn't find that.", queries: [], asOf: null }]);
    renderChat();
    await userEvent.click(screen.getByRole('button', { name: 'Ask og jits' }));
    await userEvent.type(screen.getByLabelText('Your question'), 'best QB?{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByText("I couldn't find that.")).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Close the chat' }));
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ask og jits' })).toBeInTheDocument();
  });

  it('can be opened from anywhere with a question, which it asks', async () => {
    ask = askWith([{ kind: 'answer', text: "You're 5-3.", queries: [RECORD], asOf: null }]);
    renderChat({ extra: <OpenWith question="What's my record against Humza?" /> });
    await userEvent.click(screen.getByRole('button', { name: 'open with question' }));
    expect(screen.getByRole('complementary')).toHaveTextContent("What's my record against Humza?");
    expect(ask.mutate).toHaveBeenCalledTimes(1);
  });
});

describe('historyOf', () => {
  it('drops failed turns', () => {
    expect(historyOf([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'oops', error: true },
      { role: 'assistant', content: 'b' }
    ])).toEqual([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]);
  });
});
