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

  // Use CSS classes that work with both light and dark mode
  // Tailwind's dark: prefix will automatically handle the theme switching
  return 'bg-blue-50/80 border-blue-300/60 ring-2 ring-blue-200/50 shadow-blue-200/30 dark:bg-blue-900/20 dark:border-blue-500/50 dark:ring-blue-500/30 dark:shadow-blue-500/20';
};

export const moveUserTeamToFirst = (teams, user) => {
  if (!teams || !Array.isArray(teams) || !user) return teams;

  const userTeamIndex = teams.findIndex(team => isUserTeam(team, user));
  if (userTeamIndex === -1 || userTeamIndex === 0) return teams;

  const userTeam = teams[userTeamIndex];
  const otherTeams = teams.filter((_, index) => index !== userTeamIndex);

  return [userTeam, ...otherTeams];
};