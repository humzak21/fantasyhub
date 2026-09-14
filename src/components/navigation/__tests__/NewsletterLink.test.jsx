/**
 * The newsletter button leaves the app: a real external link, in a new tab,
 * with an accessible name, and without handing Substack a window.opener.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { NewsletterLink, NEWSLETTER_URL } from '../ResponsiveNavigation.jsx';

describe('NewsletterLink', () => {
  it('links to the Substack in a new tab', () => {
    render(<NewsletterLink />);

    const link = screen.getByRole('link', { name: /newsletter/i });
    expect(NEWSLETTER_URL).toBe('https://ogjits.substack.com/');
    expect(link).toHaveAttribute('href', NEWSLETTER_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
