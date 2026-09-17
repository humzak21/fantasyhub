/**
 * Which takes this viewer has not read yet.
 *
 * The board is the one tab where something *appears* without the viewer doing
 * anything — a pick'em is a thing you owe, a ranking is a thing that moves, but
 * a take is somebody else talking, and a board nobody knows has grown is a
 * board that gets checked once a month. Hence the badge on the nav item, and
 * hence this: the rule for what counts as unread, kept pure and away from both
 * the storage it reads and the nav item it feeds.
 *
 * Two decisions worth knowing:
 *
 *   * **Your own takes are never unread.** You wrote it; being told about it
 *     is noise, and on a fourteen-person board the author is a meaningful
 *     share of everything posted.
 *
 *   * **An edit does not make a take new again.** The badge answers "has
 *     somebody called something since I last looked", and a reworded take is
 *     still the take you read. The activity log is where a change announces
 *     itself, per take, to whoever opens it.
 *
 * "Never looked" (a null mark) means the whole board is unread. That is the
 * honest reading — this browser genuinely has not shown it — and it costs one
 * visit to settle forever, where the alternative (treating an unknown mark as
 * "all seen") would hide the board's contents from exactly the person who has
 * never opened it.
 */

/** The instant a take arrived, in ms, or null if it carries no usable date. */
function postedAt(take) {
  if (!take?.createdAt) return null;
  const at = new Date(take.createdAt).getTime();
  return Number.isNaN(at) ? null : at;
}

/**
 * The takes this viewer has not seen: posted by somebody else, after the mark.
 * Undated rows are treated as seen rather than as forever-new — a take the
 * badge can never clear is worse than one it never counted.
 */
export function unseenTakes(takes = [], lastSeenAt = null, userId = null) {
  const mark = lastSeenAt ? new Date(lastSeenAt).getTime() : null;
  const since = mark !== null && !Number.isNaN(mark) ? mark : null;

  return takes.filter((take) => {
    if (userId && take?.userId === userId) return false;
    const at = postedAt(take);
    if (at === null) return false;
    return since === null || at > since;
  });
}

/** How many, for the badge. */
export function countUnseenTakes(takes = [], lastSeenAt = null, userId = null) {
  return unseenTakes(takes, lastSeenAt, userId).length;
}

/**
 * The newest posting time on the board, as an ISO string — what to store once
 * the viewer has actually seen it.
 *
 * Deliberately the newest *take* rather than `Date.now()`: a clock ahead of
 * the database's would mark takes seen before they were written, and a board
 * read while a take was in flight would swallow it. The mark can only ever be
 * a timestamp the board itself produced.
 */
export function newestTakeAt(takes = []) {
  let newest = null;

  for (const take of takes) {
    const at = postedAt(take);
    if (at !== null && (newest === null || at > newest)) newest = at;
  }

  return newest === null ? null : new Date(newest).toISOString();
}
