/**
 * Ask og jits shows what the league chat sent back, and says which kind it
 * is: a checked answer with the cards it came from, the cards themselves, or
 * nothing found.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let ask;
vi.mock('../../../../hooks/queries/index.js', () => ({ useAskLeague: () => ask }));

const { default: AskLeagueSheet } = await import('../AskLeagueSheet.jsx');

beforeEach(() => {
  ask = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, data: undefined, error: null };
});

describe('AskLeagueSheet', () => {
  it('sends the question on Enter, trimmed', async () => {
    render(<AskLeagueSheet open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Your question' }), '  my record vs Ben?  {Enter}');
    expect(ask.mutate).toHaveBeenCalledWith('my record vs Ben?');
  });

  it('offers suggestions before the first question', async () => {
    render(<AskLeagueSheet open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Who has won the championship?' }));
    expect(ask.mutate).toHaveBeenCalledWith('Who has won the championship?');
  });

  it('shows a checked answer with the cards it came from', () => {
    ask.data = {
      kind: 'answer',
      text: 'You lead Ben 3-1.',
      sources: [{ text: 'Anna Park leads Ben Cole 3-1 over 4 games.', link: '/history' }],
      asOf: '2026 week 7'
    };
    render(<AskLeagueSheet open onOpenChange={() => {}} />);
    expect(screen.getByText('You lead Ben 3-1.')).toBeInTheDocument();
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByText('Anna Park leads Ben Cole 3-1 over 4 games.')).toBeInTheDocument();
    expect(screen.getByText('As of 2026 week 7.')).toBeInTheDocument();
  });

  it('shows the cards themselves when no checked sentence was possible', () => {
    ask.data = { kind: 'facts', text: "Here's what I found:", sources: [{ text: 'League champions: 2024 Anna Park.' }], asOf: null };
    render(<AskLeagueSheet open onOpenChange={() => {}} />);
    expect(screen.getByText("Here's what I found:")).toBeInTheDocument();
    expect(screen.queryByText('From')).toBeNull();
    expect(screen.getByText('League champions: 2024 Anna Park.')).toBeInTheDocument();
  });

  it('says why a question was refused', () => {
    ask = { ...ask, isError: true, error: new Error("That's 30 questions today. Ask again tomorrow.") };
    render(<AskLeagueSheet open onOpenChange={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent("That's 30 questions today");
  });

  it('starts from a question it was opened with', () => {
    render(<AskLeagueSheet open onOpenChange={() => {}} initialQuestion="What's my record against Arya?" />);
    expect(screen.getByRole('textbox', { name: 'Your question' })).toHaveValue("What's my record against Arya?");
  });
});
