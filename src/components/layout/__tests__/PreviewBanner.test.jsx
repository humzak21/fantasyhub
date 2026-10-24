/**
 * A PR preview build says it is one, and that its data is live; the
 * production build, which has no VITE_PREVIEW_PR, shows nothing.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import PreviewBanner from '../PreviewBanner.jsx';
import { PREVIEW_PR } from '../../../utils/previewBuild.js';

describe('PreviewBanner', () => {
  it('renders nothing in a production build', () => {
    expect(PREVIEW_PR).toBeNull();
    const { container } = render(<PreviewBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the PR and says the data is live on a preview build', () => {
    render(<PreviewBanner pr="143" url="https://github.com/humzak21/fantasyhub/pull/143" />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Preview of PR #143');
    expect(note).toHaveTextContent(/anything you submit here is real/);
    expect(screen.getByRole('link', { name: 'PR #143' })).toHaveAttribute('href', 'https://github.com/humzak21/fantasyhub/pull/143');
  });
});
