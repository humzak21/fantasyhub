/**
 * Has a parlay pick hit, missed, or is it still undecided — the input to the
 * board's row tinting. Kept as a pure module (not in the `.jsx`) so the
 * indicator component file only exports components.
 *
 * `hit` the moment a TD is on the board (official or live — a touchdown cannot
 * be un-scored); `miss` only once it is settled that none came (an official
 * `false`, or a game gone final with no TD). Everything in between — in
 * progress with no TD yet, not started, on a bye, or ungraded before kickoff —
 * is `null`, so a row never turns red on a pick that can still hit.
 */

import { GAME_STATE } from '../../../services/espnLiveScoreMapper.js';

/**
 * @param {{ scoredTd: boolean|null, live?: { state: string, scored: boolean } }} args
 * @returns {'hit'|'miss'|null}
 */
export function pickOutcome({ scoredTd, live }) {
  if (scoredTd === true) return 'hit';
  if (scoredTd === false) return 'miss';
  if (live?.scored) return 'hit';
  if (live?.state === GAME_STATE.FINAL) return 'miss';
  return null;
}

export default pickOutcome;
