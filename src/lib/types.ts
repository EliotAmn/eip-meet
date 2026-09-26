// Shapes shared between API routes and client components.

// ---------- Personal calendar ----------

export type UnavailabilityType = 'busy' | 'soft';
export type Freq = 'none' | 'daily' | 'weekly' | 'monthly';

export interface UnavailabilityExceptionDTO {
  date: string; // original occurrence date, YYYY-MM-DD
  cancelled: boolean;
  title: string | null;
  type: UnavailabilityType | null;
  startTime: string | null;
  endTime: string | null;
}

export interface UnavailabilityDTO {
  id: string;
  title: string | null;
  type: UnavailabilityType;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  freq: Freq;
  interval: number;
  byWeekday: number[]; // ISO weekdays, 1 = Monday .. 7 = Sunday
  until: string | null;
  exceptions: UnavailabilityExceptionDTO[];
}

/** Payload to create an unavailability, or the new values when editing one. */
export interface UnavailabilityInput {
  title: string | null;
  type: UnavailabilityType;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  freq: Freq;
  interval: number;
  byWeekday: number[];
  until: string | null;
}

export type EditScope = 'this' | 'following' | 'all';

// ---------- Meetings ----------

export type SlotStatus = 'yes' | 'if_needed';

export interface SlotEntry {
  start: string; // ISO UTC slot start
  status: SlotStatus;
}

export interface MeetingConfig {
  id: string;
  title: string;
  dateMin: string;
  dateMax: string;
  granularity: number;
  duration: number; // meeting length in minutes (multiple of granularity)
  dayStart: number;
  dayEnd: number;
}

export type MeetingRole = 'owner' | 'admin' | 'member';

export interface MeetingSummary {
  id: string;
  title: string;
  dateMin: string;
  dateMax: string;
  role: MeetingRole;
}

/** [startUtc, endUtc) intervals, ISO strings. */
export type Interval = [string, string];

export interface MemberAvailability {
  id: string; // MeetingMember id
  userId: string | null;
  name: string;
  email: string | null; // hidden from guests
  image: string | null;
  role: MeetingRole;
  timezone: string | null;
  calendarFilled: boolean; // has at least one unavailability
  busy: Interval[];
  soft: Interval[];
}

export interface GuestInfo {
  id: string;
  name: string;
  token: string | null; // only sent to admins
  timezone: string | null;
  slots: SlotEntry[];
}

export type MeetingViewer =
  | { kind: 'member'; memberId: string | null; role: MeetingRole; isAdmin: boolean }
  | { kind: 'guest'; guestId: string; name: string };

export interface MeetingDetail {
  meeting: MeetingConfig;
  viewer: MeetingViewer;
  members: MemberAvailability[];
  guests: GuestInfo[];
}

export interface MeetingInput {
  title: string;
  dateMin: string;
  dateMax: string;
  granularity: number;
  duration: number;
  dayStart: number;
  dayEnd: number;
}

export interface CreateMeetingInput extends MeetingInput {
  memberEmails: string[];
  guestNames: string[];
}
