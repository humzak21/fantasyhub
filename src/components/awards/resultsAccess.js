/**
 * Who may see which season's award results.
 *
 * There are two consumers of this question and they must not be able to
 * disagree: the shell decides whether the Awards tab is reachable at all
 * (`FantasyFootballApp`), and the Results tab decides which years its picker
 * offers. When those two rules were written separately the tab could be open
 * onto a picker with nothing in it, or — the case that actually shipped —
 * closed over results anyone was entitled to read.
 *
 * The rule itself:
 *
 * - A **completed** season is viewable. Its ballot is over, the rows are
 *   public-read in PostgREST anyway, and there is nothing left to spoil.
 * - The **in-progress** season is viewable only once the admin has released it
 *   (`awards_metadata.results_released`). That is the flag's whole remaining
 *   job — it used to be asked of finished seasons too, which is why 2025's
 *   charts were unreachable: releasing needs 14 voters and 2025 drew 9, so its
 *   release button could never appear.
 * - The admin sees everything, as everywhere else.
 *
 * This is a mirror of a database fact for the UI's benefit, in the spirit of
 * `src/components/takes/milestones.js` — offering a season whose only outcome
 * is an empty tab is the bug it prevents. It is *not* a security boundary:
 * `awards`, `award_votes` and `awards_metadata` are all `FOR SELECT USING
 * (true)`, so nothing here is hiding anything from a determined reader.
 */

/**
 * @param {{isCompleted?: boolean, is_completed?: boolean}} season - a row from
 *   `v_award_ballot_seasons`
 * @param {{isAdmin?: boolean, activeSeasonResultsReleased?: boolean}} viewer
 * @returns {boolean}
 */
export function canViewSeasonResults(season, { isAdmin = false, activeSeasonResultsReleased = false } = {}) {
  if (!season) return false;
  if (isAdmin) return true;
  if (season.isCompleted ?? season.is_completed) return true;
  return Boolean(activeSeasonResultsReleased);
}

/**
 * The subset of `ballotSeasons` this viewer may open, order preserved (the view
 * is already newest-first).
 *
 * @param {Array<object>} ballotSeasons
 * @param {{isAdmin?: boolean, activeSeasonResultsReleased?: boolean}} viewer
 * @returns {Array<object>}
 */
export function viewableResultSeasons(ballotSeasons, viewer = {}) {
  if (!Array.isArray(ballotSeasons)) return [];
  return ballotSeasons.filter((season) => canViewSeasonResults(season, viewer));
}
