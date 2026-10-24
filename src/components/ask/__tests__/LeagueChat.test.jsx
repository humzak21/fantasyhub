/**
 * Ask og jits, the chat: two ways in (the header field and the ask bar on the
 * phone tab bar, both wearing the launcher's chat icon) for approved members
 * only, topics that
 * offer questions, answers that set the verdict above its reasons with the
 * data one tap away, and a conversation that carries its earlier turns into
 * each question.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let ask;
vi.mock('../../../../hooks/queries/index.js', () => ({ useAskLeague: () => ask }));

const { LeagueChatProvider, useLeagueChat, historyOf } = await import('../LeagueChatContext.jsx');
const { default: LeagueChat, AskBar, AskHeaderField, LeagueChatOffset } = await import('../LeagueChat.jsx');

const RECORD = {
  sql: 'select wins, losses from x',
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
    <LeagueChatOffset>
      <AskHeaderField />
      <AskBar />
      {extra}
    </LeagueChatOffset>
    <LeagueChat />
  </LeagueChatProvider>
);

const panel = () => screen.getByRole('complementary', { name: 'Ask og jits' });

const realWidth = window.innerWidth;
beforeEach(() => {
  ask = askWith([]);
  window.innerWidth = 1280;
  // vaul reads the drawer's computed `transform`, which jsdom does not compute.
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
    const style = real(el, pseudo);
    if (style.transform) return style;
    return new Proxy(style, { get: (t, p) => (p === 'transform' ? 'none' : Reflect.get(t, p, t)) });
  });
});
afterEach(() => {
  window.innerWidth = realWidth;
  vi.restoreAllMocks();
});

describe('LeagueChat', () => {
  it('exists for approved members only', () => {
    const { container, unmount } = renderChat({ enabled: false });
    expect(screen.queryByRole('button', { name: /Ask og jits/ })).toBeNull();
    expect(container.firstChild.style.getPropertyValue('--tab-dock')).toBe('');
    unmount();
    const view = renderChat();
    // The header field and the ask bar, each led by the launcher's chat icon.
    const entries = screen.getAllByRole('button', { name: /Ask og jits/ });
    expect(entries).toHaveLength(2);
    for (const entry of entries) expect(entry.querySelector('.rounded-full.bg-primary svg.lucide-messages-square')).not.toBeNull();
    // The ask bar makes the tab bar taller; the page pads for it.
    expect(view.container.firstChild.style.getPropertyValue('--tab-dock')).toBe('3.25rem');
  });

  it('opens on the topics; a topic offers its questions, and a question asks it', async () => {
    ask = askWith([{
      kind: 'answer',
      text: 'Rohit is the most successful manager. One title and five playoff trips.',
      queries: [RECORD],
      asOf: '2026 week 6'
    }]);
    renderChat();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask og jits' })[0]);
    const topics = within(panel()).getByRole('group', { name: 'Topics' });
    expect(within(topics).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Rivalries', 'Records', 'Seasons', "Pick'ems", 'Trades', 'Takes']);

    await userEvent.click(within(topics).getByRole('button', { name: 'Records' }));
    expect(within(topics).getByRole('button', { name: 'Records' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(panel()).getByRole('button', { name: "Who's been the most successful manager?" }));

    expect(ask.mutate).toHaveBeenCalledWith({ question: "Who's been the most successful manager?", history: [] }, expect.any(Object));
    // The verdict, then its reasons.
    expect(within(panel()).getByText('Rohit is the most successful manager.')).toHaveClass('font-semibold');
    expect(within(panel()).getByText('One title and five playoff trips.')).toBeInTheDocument();
    expect(within(panel()).queryByRole('group', { name: 'Topics' })).toBeNull();
  });

  it('keeps the data one tap away for an answer, with the week it is as of', async () => {
    ask = askWith([{ kind: 'answer', text: "You're 5-3.", queries: [RECORD], asOf: '2026 week 6' }]);
    renderChat();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask og jits' })[0]);
    await userEvent.type(screen.getByLabelText('Your question'), 'my record?{Enter}');
    const toggle = within(panel()).getByRole('button', { name: /Show the data/ });
    expect(toggle).toHaveTextContent('As of 2026 week 6');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(panel()).queryByRole('table')).toBeNull();
    await userEvent.click(toggle);
    expect(within(panel()).getByRole('columnheader', { name: 'wins' })).toBeInTheDocument();
    expect(within(panel()).getByRole('cell', { name: '5' })).toBeInTheDocument();
  });

  it('shows the data outright when the chat could not word a checked answer', async () => {
    ask = askWith([{ kind: 'data', text: "Here's what the league's data says:", queries: [RECORD], asOf: null }]);
    renderChat();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask og jits' })[0]);
    await userEvent.type(screen.getByLabelText('Your question'), 'my record?{Enter}');
    expect(within(panel()).queryByRole('button', { name: /Show the data/ })).toBeNull();
    expect(within(panel()).getByRole('table')).toBeInTheDocument();
  });

  it('sends the earlier turns with a follow-up, and says when a question failed', async () => {
    ask = askWith([
      { kind: 'answer', text: "You're 5-3 against Humza.", queries: [RECORD], asOf: null },
      new Error("That's 30 questions today. Ask again tomorrow.")
    ]);
    renderChat();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask og jits' })[0]);
    const box = screen.getByLabelText('Your question');
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
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

  it('starts over, and closes with the button or Escape', async () => {
    ask = askWith([{ kind: 'none', text: "I couldn't find that.", queries: [], asOf: null }]);
    renderChat();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask og jits' })[0]);
    expect(screen.getByRole('button', { name: 'New conversation' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Your question'), 'best QB?{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByText("I couldn't find that.")).toBeNull();
    expect(within(panel()).getByRole('group', { name: 'Topics' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close the chat' }));
    expect(screen.queryByRole('complementary')).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask og jits' })[0]);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('opens from the ask bar too', async () => {
    renderChat();
    const [, bar] = screen.getAllByRole('button', { name: /Ask og jits/ });
    await userEvent.click(bar);
    expect(panel()).toBeInTheDocument();
  });

  it('is a drawer on a phone, without raising the keyboard', async () => {
    window.innerWidth = 375;
    renderChat();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask og jits' })[1]);
    const drawer = await screen.findByRole('dialog', { name: 'Ask og jits' });
    expect(within(drawer).getByRole('group', { name: 'Topics' })).toBeInTheDocument();
    expect(within(drawer).getByLabelText('Your question')).not.toHaveFocus();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('can be opened from anywhere with a question, which it asks', async () => {
    ask = askWith([{ kind: 'answer', text: "You're 5-3.", queries: [RECORD], asOf: null }]);
    renderChat({ extra: <OpenWith question="What's my record against Humza?" /> });
    await userEvent.click(screen.getByRole('button', { name: 'open with question' }));
    expect(panel()).toHaveTextContent("What's my record against Humza?");
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
