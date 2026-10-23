import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useTakesMutations } from '../../../hooks/queries/index.js';
import { shouldConfirmHellNah, suppressHellNahConfirm } from './confirmPreference.js';
import { canStakeHellYeah } from './milestones.js';

/**
 * What a member can do to a take from a card: Hell Yeah, Hell Nah, take either
 * back, and answer a stake — with the confirmation each one asks for.
 *
 * Lifted out of `TakesManager` because the home page shows take cards with the
 * same buttons, and the rule is that there is one answer to "has this member
 * opted out of the Hell Nah confirmation" and one dialog per act. A component
 * that owns its own dialog is a second answer — the board renders a dozen
 * cards beside one sheet — so every surface that offers these acts calls this
 * hook and mounts `TakeActionDialogs` once. Each page has its own instance;
 * the opt-out they both read is the same `localStorage` key, so it holds on
 * both.
 *
 * Every write goes through `run`, so a refusal is toasted rather than
 * swallowed: RLS can legitimately refuse one — the take was graded a second
 * ago, the window just closed — and silence would read as success.
 *
 * @param {string|null} seasonId
 */
export function useTakeActions(seasonId) {
  const { user } = useViewer();
  const mutations = useTakesMutations(seasonId);
  const { fade, withdrawFade, hellYeah, withdrawHellYeah, respondToStake } = mutations;

  // Which take is waiting on its Hell Nah confirmation, and which is being
  // asked whether it wants a stake with its Hell Yeah. Ids, not rows, so the
  // dialogs read the fresh row after a refetch.
  const [confirmingFadeId, setConfirmingFadeId] = useState(null);
  const [stakingHellYeahId, setStakingHellYeahId] = useState(null);

  /** Which take is mid-write, so its control can disable rather than flicker.
   *  There is no optimistic update — see the note in useTakes.js. */
  const pendingTakeId =
    (fade.isPending && fade.variables?.takeId) ||
    (withdrawFade.isPending && withdrawFade.variables?.takeId) ||
    (hellYeah.isPending && hellYeah.variables?.takeId) ||
    (withdrawHellYeah.isPending && withdrawHellYeah.variables?.takeId) ||
    (respondToStake.isPending && respondToStake.variables?.takeId) ||
    null;

  const run = useCallback(async (mutation, variables, failure) => {
    try {
      await mutation.mutateAsync(variables);
      return true;
    } catch (error) {
      toast.error(`${failure}: ${error.message}`);
      return false;
    }
  }, []);

  /** Every Hell Nah goes through here: the confirmation is one decision made
   *  in one place, whichever card or sheet the button was on. */
  const requestFade = (take) => {
    if (shouldConfirmHellNah(user?.id)) {
      setConfirmingFadeId(take.id);
      return undefined;
    }
    return run(fade, { takeId: take.id }, 'Could not fade that take');
  };

  const confirmFade = async (take, dontShowAgain) => {
    if (dontShowAgain) suppressHellNahConfirm(user?.id);
    setConfirmingFadeId(null);
    await run(fade, { takeId: take.id }, 'Could not fade that take');
  };

  /**
   * Every Hell Yeah goes through here, for the same reason every Hell Nah goes
   * through `requestFade`. Inside the take's window it opens one dialog, which
   * asks whether the backer wants to add a stake of their own, and nothing is
   * written until they answer. Once the window has closed a stake is no longer
   * possible, so there is nothing to ask and the Hell Yeah lands on the click.
   */
  const requestHellYeah = (take) => {
    if (canStakeHellYeah(take)) {
      setStakingHellYeahId(take.id);
      return undefined;
    }
    return run(hellYeah, { takeId: take.id }, 'Could not Hell Yeah that take');
  };

  const confirmHellYeah = async (take, wager) => {
    setStakingHellYeahId(null);
    await run(hellYeah, { takeId: take.id, wager }, 'Could not Hell Yeah that take');
  };

  const withdrawFadeFor = (take) => run(withdrawFade, { takeId: take.id }, 'Could not take that back');

  const withdrawHellYeahFor = (take) =>
    run(withdrawHellYeah, { takeId: take.id }, 'Could not take that back');

  /** A Hell Nah's answer to a staked Hell Yeah. Confirmed in the panel that
   *  asks it; final once written. */
  const answerStake = (take, backing, response) =>
    run(
      respondToStake,
      { takeId: take.id, hellYeahId: backing.id, response },
      response === 'declined' ? 'Could not decline that stake' : 'Could not accept that stake'
    );

  return {
    mutations,
    run,
    pendingTakeId,
    requestFade,
    confirmFade,
    requestHellYeah,
    confirmHellYeah,
    withdrawFade: withdrawFadeFor,
    withdrawHellYeah: withdrawHellYeahFor,
    answerStake,
    confirmingFadeId,
    setConfirmingFadeId,
    stakingHellYeahId,
    setStakingHellYeahId
  };
}

export default useTakeActions;
