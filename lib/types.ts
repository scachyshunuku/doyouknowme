export type Role = "host" | "subject" | "guest";
export type RoomStatus = "lobby" | "question" | "results" | "finished";

export interface Room {
  id: string;
  code: string;
  host_player_id: string | null;
  subject_player_id: string | null;
  subject_name: string | null;
  status: RoomStatus;
  current_question_index: number;
  created_at: string;
}

export interface Player {
  id: string;
  room_id: string;
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

export interface RoomQuestion {
  room_id: string;
  question_id: string;
  order_index: number;
}

export interface Answer {
  id: string;
  room_id: string;
  question_id: string;
  player_id: string;
  option_index: number;
  created_at: string;
}
