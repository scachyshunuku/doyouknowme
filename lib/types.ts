export type Role = "host" | "subject" | "guest";
export type GameStatus = "lobby" | "contributing" | "question" | "results" | "finished";

export interface QuestionPackage {
  id: string;
  name: string;
  category: string | null;
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

export interface GameQuestion {
  game_id: string;
  question_id: string;
  order_index: number;
  // True when the host skipped this question: it scores no points, never
  // reaches Results, but stays in the question count.
  skipped: boolean;
}

export interface Answer {
  id: string;
  game_id: string;
  question_id: string;
  player_id: string;
  option_index: number;
  created_at: string;
}

export function sessionKey(code: string): string {
  return `doyouknowme:session:${code.toUpperCase()}`;
}
