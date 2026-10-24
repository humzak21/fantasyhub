import { FlaskConical } from 'lucide-react';

import { PREVIEW_PR, PREVIEW_PR_URL } from '../../utils/previewBuild.js';

/**
 * A strip above the app on a pull request's preview build, and nothing in
 * production. A preview reads and writes the live database, so the one thing
 * a tester must know is that what they submit counts.
 */
const PreviewBanner = ({ pr = PREVIEW_PR, url = PREVIEW_PR_URL }) => {
  if (!pr) return null;
  return (
    <div
      role="note"
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/15 px-4 py-1.5 text-center text-xs text-foreground"
    >
      <FlaskConical className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
      <span>
        Preview of{' '}
        <a href={url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
          PR #{pr}
        </a>
        . Uses the live league data, so anything you submit here is real.
      </span>
    </div>
  );
};

export default PreviewBanner;
