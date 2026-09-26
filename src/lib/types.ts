// Shared shapes between API routes and client components.

export interface PollConfig {
  id: string;
  title: string;
  dateMin: string; // YYYY-MM-DD
  dateMax: string; // YYYY-MM-DD
  granularity: number; // minutes
  dayStart: number; // hour, local
  dayEnd: number; // hour, local
}

export type SlotStatus = 'yes' | 'if_needed';

export interface SlotEntry {
  start: string; // ISO UTC slot start
  status: SlotStatus;
}

export interface ParticipantPublic {
  id: string;
  name: string;
  timezone: string | null; // IANA tz they last answered from, if known
  slots: SlotEntry[];
}

// Payload for the participant-facing page.
export interface ParticipantPageData {
  poll: PollConfig;
  me: { id: string; name: string };
  participants: ParticipantPublic[];
}

export interface AdminParticipant {
  id: string;
  name: string;
  token: string;
  slotCount: number;
}

export interface AdminPageData {
  poll: PollConfig;
  participants: AdminParticipant[];
}

export interface CreatePollInput {
  title: string;
  dateMin: string;
  dateMax: string;
  granularity: number;
  dayStart: number;
  dayEnd: number;
  participants: string[];
}
