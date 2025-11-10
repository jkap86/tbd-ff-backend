/**
 * Roster-related type definitions
 */

export interface RosterSettings {
  wins?: number;
  losses?: number;
  ties?: number;
  fpts?: number;
  fpts_decimal?: number;
  fpts_against?: number;
  fpts_against_decimal?: number;
  ppts?: number;
  ppts_decimal?: number;
  [key: string]: unknown;
}

export interface RosterSlot {
  slot: string;
  player_id: number | null;
}

export interface RosterPositionCount {
  position: string;
  count: number;
}

export interface PlayerDetails {
  player_id: number;
  full_name: string;
  position: string;
  team: string;
  [key: string]: unknown;
}

export interface RosterWithPlayers {
  id: number;
  league_id: number;
  user_id: number | null;
  username: string | null;
  draft_position: number | null;
  settings: RosterSettings | null;
  starters: Array<{
    slot: string;
    player: PlayerDetails | null;
  }>;
  bench: Array<PlayerDetails | null>;
  taxi: Array<PlayerDetails | null>;
  ir: Array<PlayerDetails | null>;
}

export interface ValidateLineupsOptions {
  leagueId: number;
  week: number;
  season: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
}
