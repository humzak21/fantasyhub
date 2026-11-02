/**
 * A share of simulated seasons, as a percentage. Five thousand seasons cannot
 * tell 0.2% from 0.4%, and "0%" would read as a fact, so the ends say so.
 */
export function formatShare(share) {
  if (share == null) return '—';
  if (share === 0) return '0%';
  if (share === 1) return '100%';
  if (share < 0.01) return '<1%';
  if (share > 0.99) return '>99%';
  return `${Math.round(share * 100)}%`;
}

/** A change in points of percentage, signed; empty when nothing moved. */
export function formatDelta(delta) {
  const points = Math.round(delta);
  if (points === 0) return '';
  return `${points > 0 ? '+' : '−'}${Math.abs(points)}`;
}

/** An average finish, to a tenth. */
export function formatProjectedRecord(wins, losses) {
  return `${wins.toFixed(1)}–${losses.toFixed(1)}`;
}
