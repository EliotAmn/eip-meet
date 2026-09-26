import { DateTime } from 'luxon';
import type {
  CreateMeetingInput,
  Freq,
  MeetingInput,
  UnavailabilityInput,
} from './types';

export class ValidationError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GRANULARITIES = [15, 30, 60];
const FREQS: Freq[] = ['none', 'daily', 'weekly', 'monthly'];

function obj(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Corps de requête invalide.');
  }
  return body as Record<string, unknown>;
}

function date(v: unknown, label: string): string {
  if (typeof v !== 'string' || !DATE_RE.test(v) || !DateTime.fromISO(v).isValid) {
    throw new ValidationError(`${label} invalide.`);
  }
  return v;
}

export function isValidTimezone(tz: unknown): tz is string {
  return (
    typeof tz === 'string' && tz.length > 0 && tz.length <= 64 && DateTime.now().setZone(tz).isValid
  );
}

const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export function validateUnavailability(body: unknown): UnavailabilityInput {
  const b = obj(body);

  const rawTitle = typeof b.title === 'string' ? b.title.trim() : '';
  if (rawTitle.length > 100) throw new ValidationError('Titre trop long.');
  const type = b.type === 'soft' ? 'soft' : b.type === 'busy' ? 'busy' : null;
  if (!type) throw new ValidationError('Type invalide.');
  if (!isValidTimezone(b.timezone)) throw new ValidationError('Fuseau horaire invalide.');

  const allDay = b.allDay === true;
  const startDate = date(b.startDate, 'Date de début');
  let endDate = startDate;
  let startTime: string | null = null;
  let endTime: string | null = null;
  if (allDay) {
    endDate = date(b.endDate ?? startDate, 'Date de fin');
    if (endDate < startDate) throw new ValidationError('La date de fin précède le début.');
  } else {
    if (typeof b.startTime !== 'string' || !TIME_RE.test(b.startTime) || b.startTime === '24:00') {
      throw new ValidationError('Heure de début invalide.');
    }
    if (typeof b.endTime !== 'string' || !TIME_RE.test(b.endTime)) {
      throw new ValidationError('Heure de fin invalide.');
    }
    if (minutes(b.endTime) <= minutes(b.startTime)) {
      throw new ValidationError("L'heure de fin doit être après l'heure de début.");
    }
    startTime = b.startTime;
    endTime = b.endTime;
  }

  const freq = FREQS.includes(b.freq as Freq) ? (b.freq as Freq) : 'none';
  const interval = Number(b.interval ?? 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) {
    throw new ValidationError('Intervalle de répétition invalide.');
  }
  let byWeekday: number[] = [];
  if (freq === 'weekly') {
    const raw = Array.isArray(b.byWeekday) ? b.byWeekday : [];
    byWeekday = Array.from(new Set(raw.map(Number)))
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
      .sort();
    if (byWeekday.length === 0) byWeekday = [DateTime.fromISO(startDate).weekday];
  }
  let until: string | null = null;
  if (freq !== 'none' && b.until) {
    until = date(b.until, 'Date de fin de répétition');
    if (until < startDate) {
      throw new ValidationError('La fin de répétition précède le début.');
    }
  }

  return {
    title: rawTitle || null,
    type,
    allDay,
    startDate,
    endDate,
    startTime,
    endTime,
    timezone: b.timezone as string,
    freq,
    interval: freq === 'none' ? 1 : interval,
    byWeekday,
    until,
  };
}

export function validateMeeting(body: unknown): MeetingInput {
  const b = obj(body);
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title) throw new ValidationError('Le titre est requis.');
  if (title.length > 200) throw new ValidationError('Titre trop long.');
  const dateMin = date(b.dateMin, 'Date de début');
  const dateMax = date(b.dateMax, 'Date de fin');
  if (dateMax < dateMin) throw new ValidationError('La date de fin précède le début.');
  if (DateTime.fromISO(dateMax).diff(DateTime.fromISO(dateMin), 'days').days > 366) {
    throw new ValidationError('Période trop longue (1 an maximum).');
  }
  const granularity = Number(b.granularity);
  if (!GRANULARITIES.includes(granularity)) throw new ValidationError('Granularité invalide.');
  const duration = Number(b.duration ?? granularity);
  if (!Number.isInteger(duration) || duration < granularity || duration > 12 * 60) {
    throw new ValidationError('Durée de réunion invalide (entre la granularité et 12h).');
  }
  if (duration % granularity !== 0) {
    throw new ValidationError('La durée doit être un multiple de la granularité.');
  }
  const dayStart = Number(b.dayStart);
  const dayEnd = Number(b.dayEnd);
  if (
    !Number.isInteger(dayStart) ||
    !Number.isInteger(dayEnd) ||
    dayStart < 0 ||
    dayEnd > 24 ||
    dayEnd <= dayStart
  ) {
    throw new ValidationError('Plage horaire invalide.');
  }
  if (duration > (dayEnd - dayStart) * 60) {
    throw new ValidationError('La réunion est plus longue que la plage horaire affichée.');
  }
  return { title, dateMin, dateMax, granularity, duration, dayStart, dayEnd };
}

export function normalizeEmails(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const emails = raw
    .filter((e): e is string => typeof e === 'string')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  const bad = emails.find((e) => !EMAIL_RE.test(e) || e.length > 200);
  if (bad) throw new ValidationError(`Email invalide : ${bad}`);
  return Array.from(new Set(emails));
}

export function normalizeNames(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      raw
        .filter((n): n is string => typeof n === 'string')
        .map((n) => n.trim())
        .filter((n) => n.length > 0 && n.length <= 100),
    ),
  );
}

export function validateCreateMeeting(body: unknown): CreateMeetingInput {
  const settings = validateMeeting(body);
  const b = obj(body);
  return {
    ...settings,
    memberEmails: normalizeEmails(b.memberEmails),
    guestNames: normalizeNames(b.guestNames),
  };
}
