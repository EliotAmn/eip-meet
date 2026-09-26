'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, ActionIcon, Text, Button, Paper } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { DateTime } from 'luxon';
import type { PollConfig, SlotStatus } from '@/lib/types';
import {
  addMinutes,
  cellToUtc,
  enumerateDates,
  formatInstant,
  formatTime,
  rowCount,
} from '@/lib/time';
import classes from './WeekCalendar.module.css';

const ROW_HEIGHT = 24;

export type PaintMode = 'yes' | 'if_needed' | 'erase';

export interface CalParticipant {
  id: string;
  name: string;
  /** IANA tz this participant answered from (null if unknown). */
  tz?: string | null;
}

type DisplayStatus = 'yes' | 'if_needed' | 'unavailable' | 'no-answer';

const STATUS_META: Record<DisplayStatus, { label: string; color: string }> = {
  yes: { label: 'Dispo', color: 'var(--mantine-color-green-6)' },
  if_needed: { label: 'Si besoin', color: 'var(--mantine-color-yellow-5)' },
  unavailable: { label: 'Pas dispo', color: 'var(--mantine-color-red-6)' },
  'no-answer': { label: 'Pas répondu', color: 'var(--mantine-color-gray-5)' },
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** "16:00 · Shanghai" (+ "(+1j)" when the slot falls on another day for them). */
function localSlotLabel(utcISO: string, personTz: string, viewerTz: string): string {
  const utc = DateTime.fromISO(utcISO, { zone: 'utc' });
  const theirs = utc.setZone(personTz);
  const dayDiff = DateTime.fromISO(theirs.toFormat('yyyy-MM-dd')).diff(
    DateTime.fromISO(utc.setZone(viewerTz).toFormat('yyyy-MM-dd')),
    'days',
  ).days;
  const dayTag = dayDiff === 0 ? '' : ` (${dayDiff > 0 ? '+' : ''}${dayDiff}j)`;
  const city = personTz.split('/').pop()?.replace(/_/g, ' ') ?? personTz;
  return `${theirs.toFormat('HH:mm')}${dayTag} · ${city}`;
}

interface WeekCalendarProps {
  poll: PollConfig;
  tz: string;
  mySlots: Map<string, SlotStatus>;
  onChange?: (next: Map<string, SlotStatus>) => void;
  paintMode?: PaintMode;
  /** All participants, in poll order. */
  participants?: CalParticipant[];
  /** Id of the connected participant (its live status comes from mySlots). */
  meId?: string;
  /** Slot key -> (participant id -> status) for everyone except me. */
  othersStatus?: Map<string, Map<string, SlotStatus>>;
  /** Ids of *other* participants who have answered at all. */
  respondedIds?: Set<string>;
  readOnly?: boolean;
}

export function WeekCalendar({
  poll,
  tz,
  mySlots,
  onChange,
  paintMode = 'yes',
  participants = [],
  meId,
  othersStatus,
  respondedIds,
  readOnly = false,
}: WeekCalendarProps) {
  const dates = useMemo(
    () => enumerateDates(poll.dateMin, poll.dateMax),
    [poll.dateMin, poll.dateMax],
  );
  const weeks = useMemo(() => chunk(dates, 7), [dates]);
  const [weekIdx, setWeekIdx] = useState(0);
  const rows = useMemo(
    () => rowCount(poll.dayStart, poll.dayEnd, poll.granularity),
    [poll.dayStart, poll.dayEnd, poll.granularity],
  );

  const week = weeks[weekIdx] ?? [];

  // Block painting: snapshot the state on press, then re-apply a rectangle from
  // the anchor cell to the current cell on every move (no holes on fast drags).
  const paint = useRef<{
    active: boolean;
    action: PaintMode;
    anchor: { day: number; row: number };
    snapshot: Map<string, SlotStatus>;
  } | null>(null);

  const [hover, setHover] = useState<{ key: string; rect: DOMRect } | null>(null);

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

  const applyRect = useCallback(
    (b: { day: number; row: number }) => {
      const p = paint.current;
      if (!p || !onChange) return;
      const dMin = Math.min(p.anchor.day, b.day);
      const dMax = Math.max(p.anchor.day, b.day);
      const rMin = Math.min(p.anchor.row, b.row);
      const rMax = Math.max(p.anchor.row, b.row);
      const next = new Map(p.snapshot);
      for (let d = dMin; d <= dMax; d += 1) {
        const dateISO = week[d];
        if (!dateISO) continue;
        for (let r = rMin; r <= rMax; r += 1) {
          const key = cellToUtc(dateISO, r, poll.dayStart, poll.granularity, tz);
          if (p.action === 'erase') next.delete(key);
          else next.set(key, p.action);
        }
      }
      onChange(next);
    },
    [onChange, week, poll.dayStart, poll.granularity, tz],
  );

  const startPaint = useCallback(
    (day: number, row: number) => {
      if (readOnly || !onChange) return;
      paint.current = {
        active: true,
        action: paintMode,
        anchor: { day, row },
        snapshot: new Map(mySlots),
      };
      setHover(null);
      applyRect({ day, row });
    },
    [readOnly, onChange, paintMode, mySlots, applyRect],
  );

  // Track the cell under the pointer during a drag, even on fast moves/touch.
  const onGridPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!paint.current?.active) return;
      const el = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest('[data-cell]') as HTMLElement | null;
      if (!el) return;
      const day = Number(el.dataset.day);
      const row = Number(el.dataset.row);
      if (Number.isInteger(day) && Number.isInteger(row)) applyRect({ day, row });
    },
    [applyRect],
  );

  const statusFor = useCallback(
    (p: CalParticipant, key: string): DisplayStatus => {
      const raw =
        p.id === meId ? mySlots.get(key) : othersStatus?.get(key)?.get(p.id);
      if (raw === 'yes') return 'yes';
      if (raw === 'if_needed') return 'if_needed';
      const answered =
        p.id === meId ? mySlots.size > 0 : !!respondedIds?.has(p.id);
      return answered ? 'unavailable' : 'no-answer';
    },
    [meId, mySlots, othersStatus, respondedIds],
  );

  const gridTemplateColumns = `64px repeat(${week.length}, minmax(44px, 1fr))`;

  const first = week[0];
  const last = week[week.length - 1];
  const rangeLabel =
    first && last
      ? `${DateTime.fromISO(first).setLocale('fr').toFormat('d LLL')} - ${DateTime.fromISO(
          last,
        )
          .setLocale('fr')
          .toFormat('d LLL yyyy')}`
      : '';

  const hoverStyle = useMemo(() => {
    if (!hover || typeof window === 'undefined') return null;
    const width = 240;
    const estHeight = 44 + participants.length * 30;
    const gap = 8;
    let left = hover.rect.right + gap;
    if (left + width > window.innerWidth) left = hover.rect.left - width - gap;
    if (left < gap) left = gap;
    let top = hover.rect.top;
    if (top + estHeight > window.innerHeight) {
      top = Math.max(gap, window.innerHeight - estHeight - gap);
    }
    return { left, top, width };
  }, [hover, participants.length]);

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
        className={`${classes.grid} no-select`}
        style={{ gridTemplateColumns }}
        onPointerMove={onGridPointerMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Header row */}
        <div className={classes.corner} />
        {week.map((dateISO) => {
          const d = DateTime.fromISO(dateISO).setLocale('fr');
          return (
            <div className={classes.dayHead} key={`h-${dateISO}`}>
              <Text size="xs" c="dimmed" tt="capitalize">
                {d.toFormat('ccc')}
              </Text>
              <Text size="sm" fw={600}>
                {d.toFormat('d')}
              </Text>
            </div>
          );
        })}

        {Array.from({ length: rows }).map((_, rowIndex) => {
          const minutesTotal = poll.dayStart * 60 + rowIndex * poll.granularity;
          const isHour = minutesTotal % 60 === 0;
          const label = `${String(Math.floor(minutesTotal / 60)).padStart(2, '0')}:${String(
            minutesTotal % 60,
          ).padStart(2, '0')}`;
          return (
            <Fragment key={`row-${rowIndex}`}>
              <div className={classes.timeCol} style={{ height: ROW_HEIGHT }}>
                {isHour && <div className={classes.timeLabel}>{label}</div>}
              </div>
              {week.map((dateISO, dayIdx) => {
                const key = cellToUtc(
                  dateISO,
                  rowIndex,
                  poll.dayStart,
                  poll.granularity,
                  tz,
                );
                const mine = mySlots.get(key);

                // My status = the cell fill.
                const fillColor =
                  mine === 'yes'
                    ? 'var(--mantine-color-indigo-6)'
                    : mine === 'if_needed'
                      ? 'var(--mantine-color-yellow-5)'
                      : null;

                // Aggregate across everyone -> the left stripe color.
                const total = participants.length;
                let yes = 0;
                let ifNeeded = 0;
                for (const p of participants) {
                  const raw =
                    p.id === meId ? mySlots.get(key) : othersStatus?.get(key)?.get(p.id);
                  if (raw === 'yes') yes += 1;
                  else if (raw === 'if_needed') ifNeeded += 1;
                }
                const available = yes + ifNeeded;
                const missing = total - available;
                let stripe: string | null = null;
                if (available > 0) {
                  if (missing === 0) {
                    stripe = ifNeeded > 0
                      ? 'var(--mantine-color-yellow-5)'
                      : 'var(--mantine-color-green-6)';
                  } else if (missing === 1) {
                    stripe = 'var(--mantine-color-orange-6)';
                  } else {
                    stripe = 'var(--mantine-color-red-6)';
                  }
                }

                return (
                  <div
                    key={`${dateISO}-${rowIndex}`}
                    data-cell
                    data-day={dayIdx}
                    data-row={rowIndex}
                    className={`${classes.cell} ${isHour ? classes.hourTop : ''} ${
                      readOnly ? classes.readonly : ''
                    }`}
                    style={{ height: ROW_HEIGHT }}
                    onPointerDown={
                      readOnly
                        ? undefined
                        : (e) => {
                            (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                            startPaint(dayIdx, rowIndex);
                          }
                    }
                    onMouseEnter={(e) => {
                      if (paint.current?.active) return;
                      setHover({ key, rect: e.currentTarget.getBoundingClientRect() });
                    }}
                  >
                    {fillColor && (
                      <div className={classes.fill} style={{ background: fillColor }} />
                    )}
                    {stripe && (
                      <div className={classes.stripe} style={{ background: stripe }} />
                    )}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>

      {hover && hoverStyle && participants.length > 0 && (
        <Paper
          withBorder
          shadow="md"
          radius="md"
          p="xs"
          className={classes.inspector}
          style={{ left: hoverStyle.left, top: hoverStyle.top, width: hoverStyle.width }}
        >
          <Text size="xs" fw={700} mb={6} tt="capitalize">
            {formatInstant(hover.key, tz)} -{' '}
            {formatTime(addMinutes(hover.key, poll.granularity), tz)}
          </Text>
          {participants.map((p) => {
            const meta = STATUS_META[statusFor(p, hover.key)];
            const local = p.tz ? localSlotLabel(hover.key, p.tz, tz) : null;
            return (
              <div key={p.id} style={{ marginBottom: 4 }}>
                <Group justify="space-between" gap="xs" wrap="nowrap">
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    <span
                      className={classes.dot}
                      style={{ background: meta.color }}
                      aria-hidden
                    />
                    <Text size="xs" truncate>
                      {p.name}
                      {p.id === meId ? ' (vous)' : ''}
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

      {!readOnly && (
        <Group justify="center" mt="sm">
          <Button
            variant="subtle"
            size="xs"
            color="gray"
            onClick={() => onChange?.(new Map())}
          >
            Tout effacer (cette réponse)
          </Button>
        </Group>
      )}
    </div>
  );
}
