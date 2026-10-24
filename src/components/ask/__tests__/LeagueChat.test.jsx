/**
 * Ask og jits, the chat: one icon (the round launcher below lg, the same
 * button in the header from lg) for approved members only, topics that
 * offer questions, answers that set the verdict above its reasons with the
 * data one tap away, and a conversation that carries its earlier turns into
 * each question.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let ask;
vi.mock('../../../../hooks/queries/index.js', () => ({ useAskLeague: () => ask }));

const { LeagueChatProvider, useLeagueChat, historyOf, UNHINGED_KEY } = await import('../LeagueChatContext.jsx');
const { default: LeagueChat, AskHeaderButton, ChatLauncher, LeagueChatOffset } = await import('../LeagueChat.jsx');

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
      <AskHeaderButton />
      <ChatLauncher />
      {extra}
    </LeagueChatOffset>
    <LeagueChat />
  </LeagueChatProvider>
);

const panel = () => screen.getByRole('complementary', { name: 'Ask og jits' });

const realWidth = window.innerWidth;
beforeEach(() => {
  localStorage.clear();
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
    unmount();
    renderChat();
    // The header button and the launcher: the round orange chat icon, and no
    // text box anywhere until the chat is open.
    const entries = screen.getAllByRole('button', { name: /Ask og jits/ });
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry).toHaveClass('rounded-full', 'bg-primary');
      expect(entry.querySelector('svg.lucide-messages-square')).not.toBeNull();
      expect(entry).toHaveAttribute('aria-expanded', 'false');
    }
    expect(screen.queryByRole('textbox')).toBeNull();
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

    expect(ask.mutate).toHaveBeenCalledWith({ question: "Who's been the most successful manager?", history: [], unhinged: false }, expect.any(Object));
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
      unhinged: false,
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

  it('slides: the closed panel stays mounted, off-screen and inert, and opening focuses the field', async () => {
    const { container } = renderChat();
    const aside = container.ownerDocument.querySelector('aside');
    expect(aside).toHaveAttribute('data-state', 'closed');
    expect(aside).toHaveAttribute('aria-hidden', 'true');
    expect(aside).toHaveAttribute('inert');
    expect(aside).toHaveClass('-translate-x-full', 'invisible', 'duration-500');
    expect(screen.queryByRole('complementary')).toBeNull();

    await userEvent.click(screen.getAllByRole('button', { name: 'Ask og jits' })[0]);
    expect(aside).toHaveAttribute('data-state', 'open');
    expect(aside).not.toHaveAttribute('inert');
    expect(aside).toHaveClass('translate-x-0', 'visible');
    expect(within(aside).getByLabelText('Your question')).toHaveFocus();
    // The page eases over on the same clock.
    expect(container.firstChild).toHaveClass('lg:pl-[400px]', 'transition-[padding]', 'duration-500');
  });

  it('opens from the launcher too, and the header button toggles it with a ring while open', async () => {
    renderChat();
    const [header, launcher] = screen.getAllByRole('button', { name: /Ask og jits/ });
    await userEvent.click(launcher);
    expect(panel()).toBeInTheDocument();
    expect(launcher).toHaveAttribute('aria-expanded', 'true');
    expect(header).toHaveAccessibleName('Close Ask og jits');
    expect(header).toHaveClass('ring-2');
    await userEvent.click(header);
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(header).not.toHaveClass('ring-2');
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

  it('sits on the keyboard when it is up on a phone, rather than being pushed off the top', async () => {
    window.innerWidth = 375;
    const vv = Object.assign(new EventTarget(), { height: 667, offsetTop: 0, width: 375 });
    const realVv = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    const realHeight = window.innerHeight;
    window.innerHeight = 667;
    try {
      renderChat();
      await userEvent.click(screen.getAllByRole('button', { name: 'Ask og jits' })[1]);
      const drawer = await screen.findByRole('dialog', { name: 'Ask og jits' });
      expect(drawer.style.bottom).toBe('');

      vv.height = 360;
      vv.offsetTop = 200;
      await act(async () => { vv.dispatchEvent(new Event('resize')); });
      expect(drawer.style.bottom).toBe('107px');
      expect(drawer.style.height).toBe('352px');

      vv.height = 667;
      vv.offsetTop = 0;
      await act(async () => { vv.dispatchEvent(new Event('resize')); });
      expect(drawer.style.bottom).toBe('');
    } finally {
      window.innerHeight = realHeight;
      if (realVv) Object.defineProperty(window, 'visualViewport', realVv);
      else delete window.visualViewport;
    }
  });

  it('can be opened from anywhere with a question, which it asks', async () => {
    ask = askWith([{ kind: 'answer', text: "You're 5-3.", queries: [RECORD], asOf: null }]);
    renderChat({ extra: <OpenWith question="What's my record against Humza?" /> });
    await userEvent.click(screen.getByRole('button', { name: 'open with question' }));
    expect(panel()).toHaveTextContent("What's my record against Humza?");
    expect(ask.mutate).toHaveBeenCalledTimes(1);
  });
});

describe('the voice switch', () => {
  it('starts normal, and the next question carries unhinged once it is switched on', async () => {
    ask = askWith([
      { kind: 'answer', text: 'Sharp.', queries: [RECORD], asOf: null },
      { kind: 'answer', text: 'Savage.', queries: [RECORD], asOf: null }
    ]);
    renderChat();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask og jits' })[0]);
    const toggle = within(panel()).getByRole('switch', { name: /Unhinged/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await userEvent.type(screen.getByLabelText('Your question'), 'first?{Enter}');
    expect(ask.mutate.mock.calls[0][0]).toMatchObject({ question: 'first?', unhinged: false });

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.type(screen.getByLabelText('Your question'), 'second?{Enter}');
    expect(ask.mutate.mock.calls[1][0]).toMatchObject({ question: 'second?', unhinged: true });
    // Earlier answers keep the voice they were asked in.
    expect(within(panel()).getByText('Sharp.')).toBeInTheDocument();
  });

  it('remembers the choice in this browser, and opens unhinged next time', async () => {
    const { unmount } = renderChat();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask og jits' })[0]);
    await userEvent.click(within(panel()).getByRole('switch', { name: /Unhinged/ }));
    expect(localStorage.getItem(UNHINGED_KEY)).toBe('1');
    unmount();

    renderChat();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ask og jits' })[0]);
    const toggle = within(panel()).getByRole('switch', { name: /Unhinged/ });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);
    expect(localStorage.getItem(UNHINGED_KEY)).toBeNull();
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
