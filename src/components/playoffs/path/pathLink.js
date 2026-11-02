/** The Path to the Playoffs tab, optionally opened on a team. */
export function pathToPlayoffsLink(teamId = null) {
  return teamId ? `/playoffs?tab=path&team=${encodeURIComponent(teamId)}` : '/playoffs?tab=path';
}
