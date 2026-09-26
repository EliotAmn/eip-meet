import type { UnavailabilityInput } from '@/lib/types';

/** Map validated input to the Unavailability table columns. */
export function unavailabilityData(i: UnavailabilityInput) {
  return {
    title: i.title,
    type: i.type,
    allDay: i.allDay,
    startDate: i.startDate,
    endDate: i.endDate,
    startTime: i.startTime,
    endTime: i.endTime,
    timezone: i.timezone,
    freq: i.freq,
    interval: i.interval,
    byWeekday: i.byWeekday.length > 0 ? i.byWeekday.join(',') : null,
    until: i.until,
  };
}
