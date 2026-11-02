import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FaabBreakdown } from '../faab-breakdown.jsx';

const line = (label) => screen.getByText(label).nextSibling;

describe('FaabBreakdown', () => {
  it('says where the money came from and went', () => {
    render(
      <FaabBreakdown
        ledger={{ budget: 100, awarded: 40, tradedIn: 10, tradedOut: 23, traded: -13, had: 127, spent: 114, left: 13 }}
      />
    );

    expect(line('Budget')).toHaveTextContent('$100');
    expect(line('Awarded')).toHaveTextContent('+$40');
    expect(line('Traded')).toHaveTextContent('−$13');
    expect(line('Had')).toHaveTextContent('$127');
    expect(line('Spent')).toHaveTextContent('$114');
  });

  it('prints no sign on nothing', () => {
    render(<FaabBreakdown ledger={{ budget: 100, awarded: 0, tradedIn: 0, tradedOut: 0, traded: 0, had: 100, spent: 26, left: 74 }} />);
    expect(line('Awarded')).toHaveTextContent('$0');
    expect(line('Awarded')).not.toHaveTextContent('+');
  });

  it('renders nothing before the sync has read a ledger', () => {
    const { container } = render(<FaabBreakdown ledger={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
