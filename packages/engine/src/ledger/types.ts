import type { GameTime } from "../time/index.js";

export type FactID = string;

export type ActorRef = { kind: "pc" | "npc" | "world" | "referee"; id: string };

export type Visibility =
  | { level: "public" }
  | { level: "table" }
  | { level: "private"; playerIds: string[] }
  | { level: "referee" };

export interface Fact {
  id: FactID;
  t: GameTime;
  wall: number;
  kind: string;
  actor: ActorRef;
  payload: Record<string, unknown>;
  visibility: Visibility;
  causes?: FactID[];
  frame?: string;
}
