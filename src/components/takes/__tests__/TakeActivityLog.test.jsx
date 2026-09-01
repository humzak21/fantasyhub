/**
 * The activity log, rendered.
 *
 * `activity.test.js` covers what each event *says*; this covers the two things
 * only a render can show:
 *
 *   * **Times read as a clock face.** `hour: '2-digit'` renders 8:42 PM as
 *     "08:42 PM", which is not how anybody writes a time. This is the
 *     regression test for that, and it is here rather than in a utils suite
 *     because the log is where the app shows the most timestamps at once.
 *   * **The order on screen is the order in the data.** The component sorts
 *     again rather than trusting its input, so a cached or hand-built list
 *     cannot put a grade above the edit that shares its transaction.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, within } from '../../../test/renderWithProviders.jsx';

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({
    user: { id: 'u1' },
    isAuthenticated: true,
    isAdmin: false,
    loading: false
  })
}));

const { default: TakeActivityLog } = await import('../TakeActivityLog.jsx');

const NAMES = { u1: 'Humza Khalil', u2: 'Arya Shah' };

const EVENTS = [
  {
    id: 'e3',
    eventType: 'graded',
    actorId: 'u1',
    seq: 3,
    createdAt: '2026-09-20T20:42:00Z',
    changes: { status: { from: 'pending', to: 'correct' } }
  },
  {
    id: 'e2',
    eventType: 'edited',
    actorId: 'u1',
    seq: 2,
    createdAt: '2026-09-05T13:05:00Z',
    changes: {
      body: { from: 'Nobody goes 14-0', to: 'Nobody goes 13-1' },
      wager: { from: '$20', to: '$50' }
    }
  },
  {
    id: 'e1',
    eventType: 'posted',
    actorId: 'u1',
    seq: 1,
    createdAt: '2026-09-01T12:00:00Z',
    changes: { body: { to: 'Nobody goes 14-0' }, wager: { to: '$20' } }
  }
];

const render = (props) =>
  renderWithProviders(
    <TakeActivityLog displayNames={NAMES} seasonConfig={{ regularSeasonWeeks: 14 }} {...props} />
  );

describe('TakeActivityLog', () => {
  it('lists every act on the take, newest first', () => {
    render({ events: EVENTS });

    const entries = within(screen.getByRole('list')).getAllByRole('listitem');

    expect(entries).toHaveLength(3);
    expect(entries[0]).toHaveTextContent('graded it Correct');
    expect(entries[1]).toHaveTextContent('edited this take');
    expect(entries[2]).toHaveTextContent('posted this take');
  });

  it('re-sorts a list handed to it out of order', () => {
    render({ events: [EVENTS[2], EVENTS[0], EVENTS[1]] });

    const entries = within(screen.getByRole('list')).getAllByRole('listitem');

    expect(entries[0]).toHaveTextContent('graded it Correct');
    expect(entries[2]).toHaveTextContent('posted this take');
  });

  it('writes times as a clock face, with no leading zero on the hour', () => {
    render({ events: EVENTS });

    // 20:42Z is 8:42 PM somewhere; the assertion is on the shape, not the zone,
    // because the formatter renders in whatever zone the reader is in.
    const times = screen.getAllByText(/\d{1,2}:\d{2}\s?(AM|PM)/);

    expect(times).toHaveLength(3);
    for (const node of times) {
      expect(node.textContent).not.toMatch(/\b0\d:\d{2}\s?(AM|PM)/);
    }
  });

  it('shows both sides of a change', () => {
    render({ events: [EVENTS[1]] });

    const entry = within(screen.getByRole('list')).getAllByRole('listitem')[0];

    expect(entry).toHaveTextContent('Nobody goes 14-0');
    expect(entry).toHaveTextContent('Nobody goes 13-1');
    expect(entry).toHaveTextContent('$20');
    expect(entry).toHaveTextContent('$50');
  });

  it('stands in while the log loads rather than appearing late and shoving the page down', () => {
    render({ events: [], loading: true });

    expect(screen.queryByText(/nothing has happened/i)).not.toBeInTheDocument();
    expect(screen.getByText(/activity/i)).toBeInTheDocument();
  });

  it('says so when a take has no history rather than rendering an empty rail', () => {
    render({ events: [] });

    expect(screen.getByText(/nothing has happened to this take yet/i)).toBeInTheDocument();
  });
});
