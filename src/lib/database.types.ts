/**
 * Hand-maintained mirror of the SQL in supabase/migrations. Keep the two in step.
 */

export type LeagueScope = "conference" | "all_fbs" | "top25";
export type MemberRole = "commissioner" | "member";
export type GameState =
  | "scheduled"
  | "in_progress"
  | "final"
  | "postponed"
  | "canceled";

export interface Database {
  public: {
    Tables: {
      conferences: {
        Row: {
          id: number;
          name: string;
          short_name: string | null;
          abbreviation: string | null;
          logo: string | null;
          selectable: boolean;
        };
        Insert: {
          id: number;
          name: string;
          short_name?: string | null;
          abbreviation?: string | null;
          logo?: string | null;
          selectable?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["conferences"]["Insert"]>;
        Relationships: [];
      };
      teams: {
        Row: {
          id: number;
          slug: string | null;
          school: string;
          mascot: string | null;
          display_name: string;
          abbreviation: string | null;
          color: string | null;
          alt_color: string | null;
          logo: string | null;
          conference_id: number | null;
          is_fbs: boolean;
          updated_at: string;
        };
        Insert: {
          id: number;
          slug?: string | null;
          school: string;
          mascot?: string | null;
          display_name: string;
          abbreviation?: string | null;
          color?: string | null;
          alt_color?: string | null;
          logo?: string | null;
          conference_id?: number | null;
          is_fbs?: boolean;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["teams"]["Insert"]>;
        Relationships: [];
      };
      games: {
        Row: {
          id: number;
          season: number;
          week: number;
          season_type: number;
          start_time: string;
          name: string | null;
          short_name: string | null;
          neutral_site: boolean;
          conference_game: boolean;
          home_team_id: number;
          away_team_id: number;
          home_score: number | null;
          away_score: number | null;
          home_rank: number | null;
          away_rank: number | null;
          status: GameState;
          completed: boolean;
          winner_team_id: number | null;
          status_detail: string | null;
          venue: string | null;
          broadcast: string | null;
          odds_details: string | null;
          over_under: number | null;
          updated_at: string;
        };
        Insert: {
          id: number;
          season: number;
          week: number;
          season_type?: number;
          start_time: string;
          name?: string | null;
          short_name?: string | null;
          neutral_site?: boolean;
          conference_game?: boolean;
          home_team_id: number;
          away_team_id: number;
          home_score?: number | null;
          away_score?: number | null;
          home_rank?: number | null;
          away_rank?: number | null;
          status?: GameState;
          completed?: boolean;
          winner_team_id?: number | null;
          status_detail?: string | null;
          venue?: string | null;
          broadcast?: string | null;
          odds_details?: string | null;
          over_under?: number | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["games"]["Insert"]>;
        Relationships: [];
      };
      rankings: {
        Row: {
          season: number;
          week: number;
          poll: string;
          rank: number;
          team_id: number;
          points: number | null;
          updated_at: string;
        };
        Insert: {
          season: number;
          week: number;
          poll: string;
          rank: number;
          team_id: number;
          points?: number | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rankings"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      leagues: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          owner_id: string;
          season: number;
          scope: LeagueScope;
          conference_id: number | null;
          max_games_per_week: number;
          start_week: number;
          regular_season_end_week: number;
          playoff_teams: number;
          invite_code: string;
          is_public: boolean;
          created_at: string;
        };
        Insert: never;
        Update: {
          name?: string;
          description?: string | null;
          scope?: LeagueScope;
          conference_id?: number | null;
          max_games_per_week?: number;
          start_week?: number;
          regular_season_end_week?: number;
          playoff_teams?: number;
          is_public?: boolean;
        };
        Relationships: [];
      };
      league_members: {
        Row: {
          id: string;
          league_id: string;
          user_id: string;
          role: MemberRole;
          joined_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      league_weeks: {
        Row: {
          id: string;
          league_id: string;
          week: number;
          scope: LeagueScope;
          conference_id: number | null;
          lock_at: string | null;
          game_count: number;
          is_playoff: boolean;
          playoff_round: number | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      league_week_games: {
        Row: { league_week_id: string; game_id: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      picks: {
        Row: {
          id: string;
          league_id: string;
          user_id: string;
          week: number;
          game_id: number;
          team_id: number;
          is_correct: boolean | null;
          points: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          league_id: string;
          user_id: string;
          week: number;
          game_id: number;
          team_id: number;
        };
        Update: { team_id?: number };
        Relationships: [];
      };
      pick_submissions: {
        Row: {
          league_id: string;
          user_id: string;
          week: number;
          pick_count: number;
          submitted_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      playoff_matchups: {
        Row: {
          id: string;
          league_id: string;
          round: number;
          week: number;
          slot: number;
          home_user_id: string | null;
          away_user_id: string | null;
          home_seed: number | null;
          away_seed: number | null;
          home_points: number | null;
          away_points: number | null;
          winner_user_id: string | null;
          is_final: boolean;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      weekly_results: {
        Row: {
          league_id: string;
          week: number;
          user_id: string;
          picks_made: number;
          correct: number;
          incorrect: number;
          points: number;
        };
        Relationships: [];
      };
      weekly_results_ranked: {
        Row: {
          league_id: string;
          week: number;
          user_id: string;
          picks_made: number;
          correct: number;
          incorrect: number;
          points: number;
          week_rank: number;
        };
        Relationships: [];
      };
      league_standings: {
        Row: {
          league_id: string;
          user_id: string;
          points: number;
          correct: number;
          incorrect: number;
          picks_made: number;
          weekly_wins: number;
          win_pct: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_league: {
        Args: {
          p_name: string;
          p_season: number;
          p_scope: LeagueScope;
          p_conference_id?: number | null;
          p_max_games?: number;
          p_start_week?: number;
          p_end_week?: number;
          p_playoff_teams?: number;
          p_description?: string | null;
        };
        Returns: Database["public"]["Tables"]["leagues"]["Row"];
      };
      join_league_by_code: {
        Args: { p_code: string };
        Returns: Database["public"]["Tables"]["leagues"]["Row"];
      };
      league_preview_by_code: {
        Args: { p_code: string };
        Returns: {
          league_id: string;
          name: string;
          slug: string;
          description: string | null;
          season: number;
          scope: LeagueScope;
          conference_name: string | null;
          member_count: number;
          already_member: boolean;
        }[];
      };
      regenerate_invite_code: { Args: { p_league_id: string }; Returns: string };
      leave_league: { Args: { p_league_id: string }; Returns: undefined };
      generate_week_board: {
        Args: { p_league_id: string; p_week: number; p_reset?: boolean };
        Returns: number;
      };
      seed_playoffs: { Args: { p_league_id: string }; Returns: number };
      week_consensus: {
        Args: { p_league_id: string; p_week: number };
        Returns: { game_id: number; team_id: number; picks: number }[];
      };
      submit_week_picks: {
        Args: {
          p_league_id: string;
          p_week: number;
          p_picks: { game_id: number; team_id: number }[];
        };
        Returns: number;
      };
      advance_playoffs: {
        Args: { p_league_id: string; p_week: number };
        Returns: number;
      };
      grade_picks: { Args: Record<string, never>; Returns: number };
      is_league_member: { Args: { p_league_id: string }; Returns: boolean };
      is_league_commissioner: { Args: { p_league_id: string }; Returns: boolean };
      shares_league_with: { Args: { p_user: string }; Returns: boolean };
    };
    Enums: {
      league_scope: LeagueScope;
      member_role: MemberRole;
      game_state: GameState;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Views<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];
