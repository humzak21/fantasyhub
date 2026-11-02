import { cn } from '../../lib/utils';

/** A small status dot: pulsing while live, steady once the game is final. */
function LiveDot({ done = false, className }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-1.5 w-1.5 rounded-full bg-current', !done && 'animate-pulse', className)}
    />
  );
}

export { LiveDot };
export default LiveDot;
