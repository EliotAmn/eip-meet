import type { CreatePollInput } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_GRANULARITY = [15, 30, 60];

export interface PollSettingsInput {
  title: string;
  dateMin: string;
  dateMax: string;
  granularity: number;
  dayStart: number;
  dayEnd: number;
}

/** Validate the poll's configurable settings (shared by create and edit). */
export function validatePollSettings(body: unknown): PollSettingsInput {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Corps de requête invalide.');
  }
  const b = body as Record<string, unknown>;

  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title) throw new ValidationError('Le titre est requis.');
  if (title.length > 200) throw new ValidationError('Titre trop long.');

  const dateMin = typeof b.dateMin === 'string' ? b.dateMin : '';
  const dateMax = typeof b.dateMax === 'string' ? b.dateMax : '';
  if (!DATE_RE.test(dateMin) || !DATE_RE.test(dateMax)) {
    throw new ValidationError('Dates invalides.');
  }
  if (dateMax < dateMin) {
    throw new ValidationError('La date de fin doit être après la date de début.');
  }

  const granularity = Number(b.granularity);
  if (!ALLOWED_GRANULARITY.includes(granularity)) {
    throw new ValidationError('Granularité invalide.');
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

  return { title, dateMin, dateMax, granularity, dayStart, dayEnd };
}

export function validateCreatePoll(body: unknown): CreatePollInput {
  const settings = validatePollSettings(body);
  const b = body as Record<string, unknown>;

  const rawParticipants = Array.isArray(b.participants) ? b.participants : [];
  const participants = Array.from(
    new Set(
      rawParticipants
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.trim())
        .filter((p) => p.length > 0 && p.length <= 100),
    ),
  );

  return { ...settings, participants };
}

export class ValidationError extends Error {}
