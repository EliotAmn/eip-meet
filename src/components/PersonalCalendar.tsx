'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventInput,
} from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxon3Plugin from '@fullcalendar/luxon3';
import frLocale from '@fullcalendar/core/locales/fr';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Text,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconChevronLeft, IconChevronRight, IconPlus, IconRepeat } from '@tabler/icons-react';
import { DateTime } from 'luxon';
import { apiFetch } from '@/lib/api';
import { expandOccurrences } from '@/lib/recurrence';
import { detectTimezone } from '@/lib/time';
import type { MeetingSummary, UnavailabilityDTO } from '@/lib/types';
import { EventModal, type EventModalMode } from './EventModal';

type ViewType = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth';

const COLORS = {
  busy: { bg: 'var(--mantine-color-red-7)', text: 'var(--mantine-color-white)' },
  soft: { bg: 'var(--mantine-color-yellow-5)', text: 'var(--mantine-color-dark-9)' },
  // Meetings are context, not something edited here: Mantine's "light" variant.
  meeting: { bg: 'var(--mantine-color-indigo-light)', text: 'var(--mantine-color-indigo-light-color)' },
};

function renderEvent(arg: EventContentArg) {
  const { kind, recurring } = arg.event.extendedProps as { kind: string; recurring?: boolean };
  return (
    <div className="lm-event">
      {arg.timeText && !arg.event.allDay && <span className="lm-event-time">{arg.timeText}</span>}
      <span className="lm-event-title">
        {kind === 'meeting' ? 'Réunion : ' : ''}
        {arg.event.title}
      </span>
      {recurring && <IconRepeat size={11} className="lm-event-icon" />}
    </div>
  );
}

export function PersonalCalendar({
  timezone: savedTimezone,
  meetings,
}: {
  timezone: string | null;
  meetings: MeetingSummary[];
}) {
  const router = useRouter();
  const calRef = useRef<FullCalendar>(null);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [mounted, setMounted] = useState(false);
  const [events, setEvents] = useState<UnavailabilityDTO[] | null>(null);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [title, setTitle] = useState('');
  const [view, setView] = useState<ViewType>('timeGridWeek');
  const [modal, setModal] = useState<EventModalMode | null>(null);

  const tz = savedTimezone ?? detectTimezone();

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (isMobile) calRef.current?.getApi().changeView('timeGridDay');
  }, [isMobile, mounted]);

  // FullCalendar only reacts to window resizes; follow its container instead
  // (navbar toggling, layout settling after mount, ...).
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => calRef.current?.getApi().updateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted, events === null]);

  const load = useCallback(async () => {
    try {
      setEvents(await apiFetch<UnavailabilityDTO[]>('/api/unavailabilities'));
    } catch (err) {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'Erreur.' });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const fcEvents = useMemo<EventInput[]>(() => {
    if (!range || !events) return [];
    const from = DateTime.fromISO(range.start, { zone: tz });
    const to = DateTime.fromISO(range.end, { zone: tz });
    const out: EventInput[] = [];
    for (const ev of events) {
      for (const o of expandOccurrences(ev, from, to)) {
        const c = COLORS[o.type];
        out.push({
          id: `${o.eventId}|${o.date}`,
          title: o.title || (o.type === 'busy' ? 'Indisponible' : 'Si besoin'),
          start: o.allDay ? o.startDate : o.startUtc,
          end: o.allDay ? o.endDateExclusive : o.endUtc,
          allDay: o.allDay,
          backgroundColor: c.bg,
          borderColor: c.bg,
          textColor: c.text,
          extendedProps: { kind: 'unavailability', eventId: o.eventId, date: o.date, recurring: o.recurring },
        });
      }
    }
    for (const m of meetings) {
      out.push({
        id: `meeting:${m.id}`,
        title: m.title,
        start: m.dateMin,
        end: DateTime.fromISO(m.dateMax).plus({ days: 1 }).toISODate()!,
        allDay: true,
        backgroundColor: COLORS.meeting.bg,
        borderColor: COLORS.meeting.bg,
        textColor: COLORS.meeting.text,
        classNames: ['lm-meeting'],
        extendedProps: { kind: 'meeting', meetingId: m.id },
      });
    }
    return out;
  }, [events, meetings, range, tz]);

  const onDatesSet = (arg: DatesSetArg) => {
    setRange({ start: arg.startStr, end: arg.endStr });
    setTitle(arg.view.title);
    setView(arg.view.type as ViewType);
  };

  const onSelect = (info: DateSelectArg) => {
    info.view.calendar.unselect();
    const s = DateTime.fromISO(info.startStr, { zone: tz });
    let e = DateTime.fromISO(info.endStr, { zone: tz });
    if (info.allDay) {
      setModal({
        kind: 'create',
        draft: {
          allDay: true,
          startDate: s.toISODate()!,
          endDate: e.minus({ days: 1 }).toISODate()!,
        },
      });
      return;
    }
    if (e.diff(s, 'minutes').minutes <= 30) e = s.plus({ hours: 1 }); // a click = 1h
    setModal({
      kind: 'create',
      draft: {
        allDay: false,
        startDate: s.toISODate()!,
        startTime: s.toFormat('HH:mm'),
        endTime: e.toISODate() !== s.toISODate() ? '24:00' : e.toFormat('HH:mm'),
      },
    });
  };

  const onEventClick = (info: EventClickArg) => {
    const p = info.event.extendedProps as { kind: string; meetingId?: string; eventId?: string; date?: string };
    if (p.kind === 'meeting') {
      router.push(`/meetings/${p.meetingId}`);
      return;
    }
    const ev = events?.find((x) => x.id === p.eventId);
    if (ev && p.date) setModal({ kind: 'edit', event: ev, date: p.date });
  };

  const api = () => calRef.current?.getApi();

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 56px - 2 * var(--mantine-spacing-md))' }}>
      <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
        <Group gap="xs" wrap="nowrap">
          <Button variant="default" size="xs" onClick={() => api()?.today()}>
            Aujourd&apos;hui
          </Button>
          <ActionIcon variant="default" onClick={() => api()?.prev()} aria-label="Précédent">
            <IconChevronLeft size={16} />
          </ActionIcon>
          <ActionIcon variant="default" onClick={() => api()?.next()} aria-label="Suivant">
            <IconChevronRight size={16} />
          </ActionIcon>
          <Title order={4} tt="capitalize" ml={4}>
            {title}
          </Title>
        </Group>
        <Group gap="xs">
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(v) => api()?.changeView(v)}
            data={[
              { value: 'timeGridDay', label: 'Jour' },
              { value: 'timeGridWeek', label: 'Semaine' },
              { value: 'dayGridMonth', label: 'Mois' },
            ]}
          />
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() => setModal({ kind: 'create', draft: {} })}
          >
            Indisponibilité
          </Button>
        </Group>
      </Group>

      <Group gap="md" mb="xs">
        <Badge variant="dot" color="red">Indisponible</Badge>
        <Badge variant="dot" color="yellow">Si besoin</Badge>
        <Badge variant="dot" color="indigo">Réunion</Badge>
        <Text size="xs" c="dimmed">
          Glissez sur le calendrier pour ajouter une indisponibilité. Fuseau : {tz}
        </Text>
      </Group>

      <Box ref={boxRef} style={{ flex: 1, minHeight: 420, position: 'relative' }} className="lm-calendar">
        {!mounted || !events ? (
          <Group justify="center" pt="xl">
            <Loader />
          </Group>
        ) : (
          <FullCalendar
            ref={calRef}
            plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin, luxon3Plugin]}
            initialView={isMobile ? 'timeGridDay' : 'timeGridWeek'}
            headerToolbar={false}
            locale={frLocale}
            timeZone={tz}
            firstDay={1}
            height="100%"
            allDayText="Journée"
            nowIndicator
            selectable
            selectMirror
            selectAllow={(info) =>
              info.allDay ||
              DateTime.fromISO(info.endStr, { zone: tz }).minus({ minutes: 1 }).toISODate() ===
                DateTime.fromISO(info.startStr, { zone: tz }).toISODate()
            }
            select={onSelect}
            eventClick={onEventClick}
            datesSet={onDatesSet}
            events={fcEvents}
            eventContent={renderEvent}
            scrollTime="07:00:00"
            slotDuration="00:30:00"
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            dayMaxEvents
          />
        )}
      </Box>

      <EventModal mode={modal} timezone={tz} onClose={() => setModal(null)} onSaved={load} />
    </Box>
  );
}
