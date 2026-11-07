export type Role = "host" | "subject" | "guest";
export type GameStatus = "lobby" | "question" | "results" | "finished";
/** Backwards-compatible alias: the old name for a game's status. */
export type RoomStatus = GameStatus;

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
  subject_name: string | null;
  status: GameStatus;
  current_question_index: number;
  created_at: string;
}

/** Backwards-compatible alias: the old name for a Game. */
export type Room = Game;

export interface Player {
  id: string;
  game_id: string;
  name: string;
  role: Role;
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
}

/** Backwards-compatible alias: the old name for a GameQuestion. */
export type RoomQuestion = GameQuestion;

export interface Answer {
  id: string;
  game_id: string;
  question_id: string;
  player_id: string;
  option_index: number;
  created_at: string;
}

export interface LocalSession {
  player_id: string;
  game_id: string;
  name: string;
  role: Role;
}

export function sessionKey(code: string): string {
  return `doyouknowme:session:${code.toUpperCase()}`;
}
