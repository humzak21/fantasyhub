import { useMemo } from 'react';

import { HellNahDialog } from './HellNahDialog.jsx';
import { HellYeahDialog } from './HellYeahDialog.jsx';

/**
 * The two confirmations a take card can open — the Hell Nah's price and
 * deadline, and the Hell Yeah's optional stake — driven by `useTakeActions`.
 *
 * Mounted once per page that offers the acts (the Takes tab, the home page),
 * never once per card. The dialogs hold a take *id* through the hook and read
 * the row from `takes` here, so they show the take as it is after a refetch.
 *
 * @param {object} props
 * @param {ReturnType<import('./useTakeActions.js').useTakeActions>} props.actions
 * @param {object[]} props.takes - the board's rows
 * @param {(userId: string) => string} props.nameOf - masked display names
 */
export function TakeActionDialogs({ actions, takes = [], nameOf }) {
  const {
    confirmingFadeId,
    setConfirmingFadeId,
    stakingHellYeahId,
    setStakingHellYeahId,
    confirmFade,
    confirmHellYeah,
    mutations
  } = actions;

  const confirmingFadeTake = useMemo(
    () => takes.find((take) => take.id === confirmingFadeId) ?? null,
    [takes, confirmingFadeId]
  );
  const stakingHellYeahTake = useMemo(
    () => takes.find((take) => take.id === stakingHellYeahId) ?? null,
    [takes, stakingHellYeahId]
  );

  return (
    <>
      <HellNahDialog
        take={confirmingFadeTake}
        open={Boolean(confirmingFadeTake)}
        onOpenChange={(open) => {
          if (!open) setConfirmingFadeId(null);
        }}
        onConfirm={confirmFade}
        pending={mutations.fade.isPending}
        nameOf={nameOf}
      />

      <HellYeahDialog
        take={stakingHellYeahTake}
        open={Boolean(stakingHellYeahTake)}
        onOpenChange={(open) => {
          if (!open) setStakingHellYeahId(null);
        }}
        onConfirm={confirmHellYeah}
        pending={mutations.hellYeah.isPending}
      />
    </>
  );
}

export default TakeActionDialogs;
