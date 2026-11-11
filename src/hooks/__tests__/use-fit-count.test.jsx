/**
 * jsdom lays nothing out, so the boxes are stubbed: the box is `ROOM` tall
 * from y=0, and each item is 100 tall, stacked from the top.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useFitCount } from '../use-fit-count.js';

let ROOM = 0;
const ITEM = 100;

function rect(top, height) {
  return { top, bottom: top + height, left: 0, right: 100, width: 100, height, x: 0, y: top, toJSON() {} };
}

vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measure() {
  if (this.dataset.box != null) return rect(0, ROOM);
  if (this.dataset.item != null) return rect(Number(this.dataset.item) * ITEM, ITEM);
  return rect(0, 0);
});

function List({ max }) {
  const { count, boxRef, listRef } = useFitCount(max);
  return (
    <div ref={boxRef} data-box="">
      <ul ref={listRef}>
        {Array.from({ length: count }, (_, i) => (
          <li key={i} data-item={i}>
            item {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

afterEach(() => {
  ROOM = 0;
});

describe('useFitCount', () => {
  it('shows as many items as fit whole', () => {
    ROOM = 350;
    render(<List max={10} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('never offers more than there are', () => {
    ROOM = 1000;
    render(<List max={4} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('shows none with no room to spare', () => {
    ROOM = 0;
    render(<List max={10} />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('shows none when the first item is taller than the room', () => {
    ROOM = 60;
    render(<List max={10} />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
