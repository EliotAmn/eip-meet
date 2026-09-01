// A curated, deduplicated list of IANA timezones for the picker.
// Uses the runtime-supported list when available, otherwise a sensible subset.

export function supportedTimezones(): string[] {
  const anyIntl = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  if (typeof anyIntl.supportedValuesOf === 'function') {
    try {
      return anyIntl.supportedValuesOf('timeZone');
    } catch {
      /* fall through */
    }
  }
  return [
    'UTC',
    'Europe/Paris',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Madrid',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'America/Sao_Paulo',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Kolkata',
    'Asia/Dubai',
    'Australia/Sydney',
  ];
}
