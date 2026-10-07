'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, ActionIcon, Text, Paper } from '@mantine/core';
import { IconCalendar, IconCheck, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { DateTime } from 'luxon';
import type { MeetingConfig, SlotStatus } from '@/lib/types';
import {
  dayBlocks,
  HEAT_LEVELS,
  type AvailabilityRange,
  type GridParticipant,
  type MeetingEval,
} from '@/lib/availability';
import { isCovered, setRange, type MsInterval } from '@/lib/intervals';
import { formatDuration } from '@/lib/time';
import classes from './AvailabilityGrid.module.css';

const ROW_HEIGHT = 24;
const MIN = 60_000;

export type PaintMode = 'yes' | 'if_needed' | 'erase';

/** A block of the viewer's own data drawn under the results. */
export interface MyBlock {
  startMin: number;
  endMin: number;
  background: string;
  /** Solid bar on the left (the viewer's painting). */
  accent?: string;
  /** Small reminder at the top ("Dispo", "Si besoin"). */
  label?: string;
  /** Comes from the personal calendar (not editable here). */
  fromCalendar?: boolean;
}

/** The viewer's own availability: light tint + solid bar on the left. */
export const OWN_STYLE = {
  yes: {
    background: 'var(--mantine-color-green-light)',
    accent: 'var(--mantine-color-green-6)',
    label: 'Dispo',
  },
  if_needed: {
    background: 'var(--mantine-color-yellow-light)',
    accent: 'var(--mantine-color-yellow-5)',
    label: 'Si besoin',
  },
} as const;

type DisplayStatus = 'yes' | 'if_needed' | 'unavailable' | 'busy' | 'no-answer' | 'empty';

const STATUS_META: Record<DisplayStatus, { label: string; color: string }> = {
  yes: { label: 'Dispo', color: 'var(--mantine-color-green-6)' },
  if_needed: { label: 'Si besoin', color: 'var(--mantine-color-yellow-5)' },
  unavailable: { label: 'Pas dispo', color: 'var(--mantine-color-red-6)' },
  busy: { label: 'Indisponible', color: 'var(--mantine-color-red-6)' },
  'no-answer': { label: 'Pas répondu', color: 'var(--mantine-color-gray-5)' },
  empty: { label: 'Calendrier vide', color: 'var(--mantine-color-gray-5)' },
};

/** Monday-to-Sunday weeks covering the period; days outside it have no index. */
function calendarWeeks(dates: string[]): { date: string; d: number | null }[][] {
  if (dates.length === 0) return [];
  const index = new Map(dates.map((date, i) => [date, i]));
  const end = DateTime.fromISO(dates[dates.length - 1]).endOf('week');
  const weeks: { date: string; d: number | null }[][] = [];
  for (
    let day = DateTime.fromISO(dates[0]).startOf('week');
    day <= end;
    day = day.plus({ days: 1 })
  ) {
    if (day.weekday === 1) weeks.push([]);
    const date = day.toISODate()!;
    weeks[weeks.length - 1].push({ date, d: index.get(date) ?? null });
  }
  return weeks;
}

/** Popularity background: blue, stronger where more people are available. */
const HEAT_MIX = [0, 12, 24, 38, 55];
export const heatColor = (level: number) =>
  `color-mix(in srgb, var(--mantine-color-blue-6) ${HEAT_MIX[Math.min(level, HEAT_LEVELS)]}%, transparent)`;

const hhmm = (ms: number, tz: string) => DateTime.fromMillis(ms, { zone: tz }).toFormat('HH:mm');

/** "16:00 · Shanghai" (+ "(+1j)" when it falls on another day for them). */
function localLabel(ms: number, personTz: string, viewerTz: string): string {
  const theirs = DateTime.fromMillis(ms, { zone: personTz });
  const dayDiff = DateTime.fromISO(theirs.toFormat('yyyy-MM-dd')).diff(
    DateTime.fromISO(DateTime.fromMillis(ms, { zone: viewerTz }).toFormat('yyyy-MM-dd')),
    'days',
  ).days;
  const dayTag = dayDiff === 0 ? '' : ` (${dayDiff > 0 ? '+' : ''}${dayDiff}j)`;
  const city = personTz.split('/').pop()?.replace(/_/g, ' ') ?? personTz;
  return `${theirs.toFormat('HH:mm')}${dayTag} · ${city}`;
}

interface AvailabilityGridProps {
  meeting: MeetingConfig;
  tz: string;
  ev: MeetingEval;
  ranges: AvailabilityRange[];
  /** Minutes per displayed row (and per painting cell for guests). */
  rowMinutes: number;
  /** The viewer's own data for a day (member: calendar; guest: painting). */
  myBlocks?: (day: number) => MyBlock[];
  /** Guest painting. */
  editable?: boolean;
  myIntervals?: MsInterval[];
  onChange?: (next: MsInterval[]) => void;
  paintMode?: PaintMode;
}

export function AvailabilityGrid({
  meeting,
  tz,
  ev,
  ranges,
  rowMinutes,
  myBlocks,
  editable = false,
  myIntervals,
  onChange,
  paintMode = 'yes',
}: AvailabilityGridProps) {
  const weeks = useMemo(() => calendarWeeks(ev.days.map((day) => day.date)), [ev.days]);
  const [weekIdx, setWeekIdx] = useState(0);
  useEffect(() => {
    if (weekIdx >= weeks.length) setWeekIdx(Math.max(0, weeks.length - 1));
  }, [weeks.length, weekIdx]);
  const cols = weeks[weekIdx] ?? [];
  // Days of this week inside the period.
  const week = useMemo(() => cols.flatMap((c) => (c.d === null ? [] : [c.d])), [cols]);

  const windowMinutes = (meeting.dayEnd - meeting.dayStart) * 60;
  const rows = Math.ceil(windowMinutes / rowMinutes);
  const pxPerMin = ROW_HEIGHT / rowMinutes;
  const total = ev.participants.length;

  // ---- Guest painting: snapshot on press, re-apply the rectangle on move.
  const paint = useRef<{
    active: boolean;
    action: PaintMode;
    anchor: { day: number; row: number };
    snapshot: MsInterval[];
  } | null>(null);

  useEffect(() => {
    const stop = () => {
      if (paint.current) paint.current.active = false;
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);

  const cellRange = useCallback(
    (day: number, rowFrom: number, rowTo: number) => {
      const start = ev.days[day].start;
      return [
        start + rowFrom * rowMinutes * MIN,
        start + Math.min((rowTo + 1) * rowMinutes, windowMinutes) * MIN,
      ] as const;
    },
    [ev.days, rowMinutes, windowMinutes],
  );

  const applyRect = useCallback(
    (b: { day: number; row: number }) => {
      const p = paint.current;
      if (!p || !onChange) return;
      const days = week.filter(
        (d) => d >= Math.min(p.anchor.day, b.day) && d <= Math.max(p.anchor.day, b.day),
      );
      let next = p.snapshot;
      for (const d of days) {
        const [s, e] = cellRange(d, Math.min(p.anchor.row, b.row), Math.max(p.anchor.row, b.row));
        next = setRange(next, s, e, p.action === 'erase' ? null : p.action);
      }
      onChange(next);
    },
    [onChange, week, cellRange],
  );

  const startPaint = (day: number, row: number) => {
    if (!editable || !onChange || !myIntervals) return;
    // Toggle: starting on a cell already painted with the selected type erases.
    const [s, e] = cellRange(day, row, row);
    const action: PaintMode =
      paintMode !== 'erase' && isCovered(myIntervals, s, e, paintMode as SlotStatus)
        ? 'erase'
        : paintMode;
    paint.current = { active: true, action, anchor: { day, row }, snapshot: myIntervals };
    setHover(null);
    applyRect({ day, row });
  };

  const onGridPointerMove = (e: React.PointerEvent) => {
    if (!paint.current?.active) return;
    const el = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest('[data-cell]') as HTMLElement | null;
    if (!el) return;
    const day = Number(el.dataset.day);
    const row = Number(el.dataset.row);
    if (Number.isInteger(day) && Number.isInteger(row)) applyRect({ day, row });
  };

  // ---- Hover: result for a meeting starting at the hovered minute.
  const [hover, setHover] = useState<{ day: number; minute: number; x: number; y: number } | null>(
    null,
  );

  const onColMove = (day: number) => (e: React.MouseEvent<HTMLDivElement>) => {
    if (paint.current?.active) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = Math.floor((e.clientY - rect.top) / pxPerMin);
    const minute = Math.max(0, Math.min(windowMinutes - 1, Math.floor(raw / 5) * 5));
    setHover({ day, minute, x: rect.right, y: e.clientY });
  };

  const statusFor = (
    p: GridParticipant,
    idx: number,
    day: number,
    minute: number,
  ): DisplayStatus => {
    const v = ev.days[day].starts[idx][minute];
    if (v === 2) return 'yes';
    if (v === 1) return 'if_needed';
    if (!p.answered) return p.kind === 'member' ? 'empty' : 'no-answer';
    return p.kind === 'member' ? 'busy' : 'unavailable';
  };

  const first = cols.length ? cols[0].date : null;
  const last = cols.length ? cols[cols.length - 1].date : null;
  const rangeLabel =
    first && last
      ? `${DateTime.fromISO(first).setLocale('fr').toFormat('d LLL')} - ${DateTime.fromISO(last)
          .setLocale('fr')
          .toFormat('d LLL yyyy')}`
      : '';

  const inspectorStyle = useMemo(() => {
    if (!hover || typeof window === 'undefined') return null;
    const width = 260;
    const estHeight = 60 + total * 30;
    const gap = 8;
    let left = hover.x + gap;
    if (left + width > window.innerWidth) left = hover.x - width - gap * 8;
    if (left < gap) left = gap;
    let top = hover.y - 20;
    if (top + estHeight > window.innerHeight)
      top = Math.max(gap, window.innerHeight - estHeight - gap);
    return { left, top, width };
  }, [hover, total]);

  const hoverStart = hover ? ev.days[hover.day].start + hover.minute * MIN : 0;

  return (
    <div>
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <ActionIcon
            variant="default"
            onClick={() => setWeekIdx((i) => Math.max(0, i - 1))}
            disabled={weekIdx === 0}
            aria-label="Semaine précédente"
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <ActionIcon
            variant="default"
            onClick={() => setWeekIdx((i) => Math.min(weeks.length - 1, i + 1))}
            disabled={weekIdx >= weeks.length - 1}
            aria-label="Semaine suivante"
          >
            <IconChevronRight size={16} />
          </ActionIcon>
          <Text fw={600}>{rangeLabel}</Text>
        </Group>
        {weeks.length > 1 && (
          <Text size="sm" c="dimmed">
            {weekIdx + 1} / {weeks.length}
          </Text>
        )}
      </Group>

      <div
        className={`${classes.grid} ${editable ? classes.editable : ''} ${myBlocks ? classes.withOwn : ''} no-select`}
        style={{ gridTemplateColumns: `64px repeat(${cols.length}, minmax(44px, 1fr))` }}
        onPointerMove={onGridPointerMove}
        onMouseLeave={() => setHover(null)}
      >
        <div className={classes.corner} />
        {cols.map(({ d, date: iso }) => {
          const date = DateTime.fromISO(iso).setLocale('fr');
          return (
            <div
              className={`${classes.dayHead} ${d === null ? classes.outside : ''}`}
              key={`h-${iso}`}
            >
              <Text size="xs" c="dimmed" tt="capitalize">
                {date.toFormat('ccc')}
              </Text>
              <Text size="sm" fw={600}>
                {date.toFormat('d')}
              </Text>
            </div>
          );
        })}

        <div className={classes.timeCol} style={{ height: rows * ROW_HEIGHT }}>
          {Array.from({ length: meeting.dayEnd - meeting.dayStart }).map((_, h) => (
            <div key={h} className={classes.timeLabel} style={{ top: h * 60 * pxPerMin }}>
              {h === 0 ? '' : `${String(meeting.dayStart + h).padStart(2, '0')}:00`}
            </div>
          ))}
        </div>

        {cols.map(({ d, date }) =>
          d === null ? (
            <div
              key={`o-${date}`}
              className={`${classes.dayCol} ${classes.outside}`}
              style={{ height: rows * ROW_HEIGHT }}
              title="Hors de la période"
            />
          ) : (
            <div
              key={`c-${d}`}
              className={classes.dayCol}
              style={{ height: rows * ROW_HEIGHT }}
              onMouseMove={onColMove(d)}
            >
              {Array.from({ length: rows }).map((_, r) => (
                <div
                  key={r}
                  data-cell
                  data-day={d}
                  data-row={r}
                  className={`${classes.row} ${(r * rowMinutes) % 60 === 0 ? classes.hourTop : ''}`}
                  style={{ height: ROW_HEIGHT }}
                  onPointerDown={
                    editable
                      ? (e) => {
                          (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                          startPaint(d, r);
                        }
                      : undefined
                  }
                />
              ))}

              {ev.days[d].heat.map(([s, e, level], i) => (
                <div
                  key={`h-${i}`}
                  className={classes.layer}
                  style={{
                    top: s * pxPerMin,
                    height: (e - s) * pxPerMin,
                    background: heatColor(level),
                  }}
                />
              ))}

              {myBlocks?.(d).map((b, i) => (
                <div
                  key={`my-${i}`}
                  className={classes.layer}
                  style={{
                    top: b.startMin * pxPerMin,
                    height: (b.endMin - b.startMin) * pxPerMin,
                    background: b.background,
                    borderLeft: b.accent ? `6px solid ${b.accent}` : undefined,
                  }}
                >
                  {b.label && (b.endMin - b.startMin) * pxPerMin >= 16 && (
                    <span className={classes.paintLabel} style={{ color: b.accent }}>
                      {b.fromCalendar && <IconCalendar size={10} stroke={2.5} />}
                      {b.label}
                    </span>
                  )}
                </div>
              ))}

              {dayBlocks(ranges, d, total).map((b, i) => {
                // Inset on every side so the viewer's painting stays visible around it.
                const h = (b.endMin - b.startMin) * pxPerMin;
                const inset = h > 12 ? 3 : 0;
                const style = { top: b.startMin * pxPerMin + inset, height: h - 2 * inset };
                return (
                  <div
                    key={`r-${i}`}
                    className={`${classes.layer} ${b.kind === 'match' ? classes.match : classes.maybe}`}
                    style={style}
                  >
                    {style.height >= 14 && <IconCheck size={14} stroke={3} />}
                  </div>
                );
              })}

              {hover?.day === d && (
                <div
                  className={`${classes.layer} ${classes.hoverLine}`}
                  style={{ top: hover.minute * pxPerMin - 1 }}
                />
              )}
            </div>
          ),
        )}
      </div>

      {hover && inspectorStyle && total > 0 && (
        <Paper
          withBorder
          shadow="md"
          radius="md"
          p="xs"
          className={classes.inspector}
          style={{
            left: inspectorStyle.left,
            top: inspectorStyle.top,
            width: inspectorStyle.width,
          }}
        >
          <Text size="xs" fw={700} tt="capitalize">
            {DateTime.fromMillis(hoverStart, { zone: tz }).setLocale('fr').toFormat('ccc d LLL')}{' '}
            {hhmm(hoverStart, tz)} - {hhmm(hoverStart + meeting.duration * MIN, tz)}
          </Text>
          <Text size="10px" c="dimmed" mb={6}>
            Réunion de {formatDuration(meeting.duration)} commençant à cette heure
          </Text>
          {ev.participants.map((p, idx) => {
            const meta = STATUS_META[statusFor(p, idx, hover.day, hover.minute)];
            const local = p.tz ? localLabel(hoverStart, p.tz, tz) : null;
            return (
              <div key={p.id} style={{ marginBottom: 4 }}>
                <Group justify="space-between" gap="xs" wrap="nowrap">
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    <span className={classes.dot} style={{ background: meta.color }} aria-hidden />
                    <Text size="xs" truncate>
                      {p.name}
                      {p.isMe ? ' (vous)' : ''}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {meta.label}
                  </Text>
                </Group>
                {local && (
                  <Text size="10px" c="dimmed" style={{ marginLeft: 14 }}>
                    {local}
                  </Text>
                )}
              </div>
            );
          })}
        </Paper>
      )}
    </div>
  );
}
