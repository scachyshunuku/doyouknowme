export type Role = "host" | "subject" | "guest";
export type GameStatus = "lobby" | "contributing" | "question" | "results" | "finished";

export interface QuestionPackage {
  id: string;
  name: string;
  created_at: string;
}

export interface PackageQuestion {
  question_package_id: string;
  question_id: string;
  order_index: number;
}

export interface Game {
  id: string;
  code: string;
  question_package_id: string | null;
  host_player_id: string;
  subject_player_id: string | null;
  status: GameStatus;
  current_question_index: number;
  // How many custom questions each guest may add in the contribution
  // phase (0-10).
  custom_question_limit: number;
  // When true, every guest must fill all of their question slots (no Skip).
  custom_questions_required: boolean;
  // Code of the new game created by Play again. Guests follow it into the
  // new lobby (Task 23). Null until the host replays.
  replay_code: string | null;
  created_at: string;
}

export interface Player {
  id: string;
  game_id: string;
  name: string;
  role: Role;
  // True once the player has finished the contribution phase (added or
  // skipped all of their question slots).
  contribution_done: boolean;
  joined_at: string;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  created_at: string;
}

// A question as it plays in one game: a self-contained copy of the bank
// question (bank) or a guest's own question (custom). The game never reads
// the questions bank while playing — everything comes from these rows.
export interface GameQuestion {
  id: string;
  game_id: string;
  text: string;
  options: string[];
  order_index: number;
  // True for a guest's own question (added in the contribution phase).
  // Bank copies are false. Customs play after the bank, shuffled once
  // when the contribution phase ends.
  is_custom: boolean;
  // True when the host skipped this question: it scores no points, never
  // reaches Results, but stays in the question count.
  skipped: boolean;
  // The guest who added this question (customs only); used to enforce the
  // per-guest limit. Null for bank copies.
  created_by_player_id: string | null;
}

export interface Answer {
  id: string;
  game_id: string;
  // The game question this answer is for (a game_questions row, not the
  // bank question — custom questions have no bank row).
  game_question_id: string;
  player_id: string;
  option_index: number;
  created_at: string;
}

export function sessionKey(code: string): string {
  return `doyouknowme:session:${code.toUpperCase()}`;
}
