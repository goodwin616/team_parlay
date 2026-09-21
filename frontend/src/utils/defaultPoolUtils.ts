import { TeamProfile, DefaultLeg } from '../types';

export function getTeamDefaults(team?: TeamProfile | null): DefaultLeg[] {
  return team?.default_legs || [];
}

export function isTeamMissingDefaults(team?: TeamProfile | null): boolean {
  return !team || !team.default_legs || team.default_legs.length === 0;
}

export function isLegOnBye(leg: DefaultLeg, byeTeams: string[] = []): boolean {
  if (!leg || !leg.nfl_team) return false;
  return byeTeams.some(t => t.toUpperCase() === leg.nfl_team.toUpperCase());
}
