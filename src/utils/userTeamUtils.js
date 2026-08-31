export const getUserDisplayName = (user) => {
  if (!user) return null;
  return user.user_metadata?.full_name || user.user_metadata?.name || null;
};

export const isUserTeam = (team, user) => {
  const userDisplayName = getUserDisplayName(user);
  if (!userDisplayName || !team?.owner) return false;

  // Exact match (case insensitive)
  if (userDisplayName.toLowerCase() === team.owner.toLowerCase()) {
    return true;
  }

  // Check if owner contains the user's display name or vice versa
  const userLower = userDisplayName.toLowerCase();
  const ownerLower = team.owner.toLowerCase();

  return userLower.includes(ownerLower) || ownerLower.includes(userLower);
};

export const getUserTeamHighlightClasses = (isCurrentUserTeam) => {
  if (!isCurrentUserTeam) return '';

  // A tint and a brand-coloured rail — not a blue 2px ring.
  //
  // The ring pre-dated the palette and fought it: a blue halo around one row
  // of an orange-accented, near-black table, drawing hard enough to make the
  // viewer's own row the loudest thing on the page. A rail lets them find
  // their row at a glance without shouting.
  //
  // The class is defined in globals.css rather than composed from utilities
  // because it has to work on both layouts ResponsiveDataTable emits, and a
  // `<tr>` cannot carry a left border or a positioned pseudo-element under
  // `border-collapse: collapse` — the rail has to go on its first cell.
  return 'ff-viewer-row';
};

export const moveUserTeamToFirst = (teams, user) => {
  if (!teams || !Array.isArray(teams) || !user) return teams;

  const userTeamIndex = teams.findIndex(team => isUserTeam(team, user));
  if (userTeamIndex === -1 || userTeamIndex === 0) return teams;

  const userTeam = teams[userTeamIndex];
  const otherTeams = teams.filter((_, index) => index !== userTeamIndex);

  return [userTeam, ...otherTeams];
};