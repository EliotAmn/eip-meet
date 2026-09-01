'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, ActionIcon, Text, Button, Paper } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { DateTime } from 'luxon';
import type { PollConfig } from '@/lib/types';
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
const SQUARE = 4;
const SQUARE_GAP = 1;
// Single column: markers are widened into bars so they read as centered.
// As soon as we spill into 2+ columns they go back to plain squares.
const WIDE_MARKER = 10;
const STRIP_PADDING = 8;
// A status marker is a few pixels tall; this is how many stack in one column.
const SQUARE_PER_COL = Math.max(1, Math.floor((ROW_HEIGHT - 4) / (SQUARE + SQUARE_GAP)));

/** Marker width (px) for a given column count: wide bar when single-column,
 *  square once it wraps to several columns. */
function markerWidthPx(colCount: number): number {
  return colCount === 1 ? WIDE_MARKER : SQUARE;
}

/** Width (px) to reserve on the right of a cell so the colored fill never sits
 *  behind the status markers, sized to whatever the markers actually need. */
function reservedRightPx(colCount: number): number {
  if (colCount <= 0) return 0;
  const w = markerWidthPx(colCount);
  return colCount * w + (colCount - 1) * SQUARE_GAP + STRIP_PADDING;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface CalParticipant {
  id: string;
  name: string;
}

interface MarkedParticipant extends CalParticipant {
  available: boolean;
}

type Status = 'available' | 'unavailable' | 'no-answer';

/**
 * Split participants into vertical columns of status squares. The first
 * participants land in the first (rightmost, via CSS row-reverse) column;
 * overflow spills into further columns drawn to the left.
 */
function squareColumns(
  participants: CalParticipant[],
  isAvailable: (p: CalParticipant) => boolean,
): MarkedParticipant[][] {
  const marked = participants.map((p) => ({ ...p, available: isAvailable(p) }));
  return chunk(marked, SQUARE_PER_COL);
}

const STATUS_META: Record<Status, { label: string; color: string }> = {
  available: { label: 'Dispo', color: 'var(--mantine-color-green-6)' },
  unavailable: { label: 'Pas dispo', color: 'var(--mantine-color-red-6)' },
  'no-answer': { label: 'Pas répondu', color: 'var(--mantine-color-gray-5)' },
};

interface WeekCalendarProps {
  poll: PollConfig;
  tz: string;
  mySlots: Set<string>;
  onChange?: (next: Set<string>) => void;
  /** All participants, in poll order, for the per-cell status squares. */
  participants?: CalParticipant[];
  /** Id of the connected participant (its live status comes from mySlots). */
  meId?: string;
  /** Slot key -> set of *other* participant ids available at that slot. */
  othersSlots?: Map<string, Set<string>>;
  /** Ids of *other* participants who have answered at all (>=1 slot). */
  respondedIds?: Set<string>;
  readOnly?: boolean;
}

export function WeekCalendar({
  poll,
  tz,
  mySlots,
  onChange,
  participants = [],
  meId,
  othersSlots,
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

  const paint = useRef<{ active: boolean; mode: 'add' | 'remove' }>({
    active: false,
    mode: 'add',
  });

  // Hover inspector (mouse only): shows everyone's status for one slot.
  const [hover, setHover] = useState<{ key: string; rect: DOMRect } | null>(null);

  // Stop painting anywhere the pointer is released.
  useEffect(() => {
    const stop = () => {
      paint.current.active = false;
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);

  const apply = useCallback(
    (key: string, mode: 'add' | 'remove') => {
      if (!onChange) return;
      const next = new Set(mySlots);
      if (mode === 'add') next.add(key);
      else next.delete(key);
      onChange(next);
    },
    [mySlots, onChange],
  );

  const statusFor = useCallback(
    (p: CalParticipant, key: string): Status => {
      const available =
        p.id === meId ? mySlots.has(key) : !!othersSlots?.get(key)?.has(p.id);
      if (available) return 'available';
      const answered =
        p.id === meId ? mySlots.size > 0 : !!respondedIds?.has(p.id);
      return answered ? 'unavailable' : 'no-answer';
    },
    [meId, mySlots, othersSlots, respondedIds],
  );

  const week = weeks[weekIdx] ?? [];
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

  // Position of the hover inspector, flipped to wherever there is room.
  const hoverStyle = useMemo(() => {
    if (!hover || typeof window === 'undefined') return null;
    const width = 230;
    const estHeight = 44 + participants.length * 22;
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

        {/* Body: for each row, a time label then one cell per day */}
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
              {week.map((dateISO) => {
                const key = cellToUtc(
                  dateISO,
                  rowIndex,
                  poll.dayStart,
                  poll.granularity,
                  tz,
                );
                const mine = mySlots.has(key);
                const otherSet = othersSlots?.get(key);
                const availableCount = (mine ? 1 : 0) + (otherSet?.size ?? 0);
                const anyAvailable = availableCount > 0;
                const everyone =
                  participants.length > 0 && availableCount === participants.length;

                // Fill color: green if everyone is available, else the connected
                // participant's color when available, else none.
                const fillColor = everyone
                  ? 'var(--mantine-color-green-6)'
                  : mine
                    ? 'var(--mantine-color-indigo-6)'
                    : null;

                // Per-person status squares, only when someone is available.
                const columns = anyAvailable
                  ? squareColumns(participants, (p) =>
                      p.id === meId ? mine : !!otherSet?.has(p.id),
                    )
                  : null;
                const colCount = columns?.length ?? 0;
                const markerWidth = markerWidthPx(colCount);
                const reserved = reservedRightPx(colCount);

                return (
                  <div
                    key={`${dateISO}-${rowIndex}`}
                    className={`${classes.cell} ${isHour ? classes.hourTop : ''} ${
                      readOnly ? classes.readonly : ''
                    }`}
                    style={{ height: ROW_HEIGHT }}
                    onMouseEnter={(e) => {
                      if (paint.current.active) return;
                      setHover({ key, rect: e.currentTarget.getBoundingClientRect() });
                    }}
                    onPointerDown={
                      readOnly
                        ? undefined
                        : (e) => {
                            (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                            setHover(null);
                            const mode = mine ? 'remove' : 'add';
                            paint.current = { active: true, mode };
                            apply(key, mode);
                          }
                    }
                    onPointerEnter={
                      readOnly
                        ? undefined
                        : () => {
                            if (paint.current.active) apply(key, paint.current.mode);
                          }
                    }
                  >
                    {/* Colored fill that stops before the squares strip. */}
                    {fillColor && (
                      <div
                        className={classes.fill}
                        style={{ right: reserved, background: fillColor }}
                      />
                    )}
                    {columns && (
                      <div className={classes.squares} style={{ width: reserved }}>
                        {columns.map((col, ci) => (
                          <div className={classes.sqCol} key={ci}>
                            {col.map((p) => (
                              <span
                                key={p.id}
                                className={classes.sq}
                                style={{
                                  width: markerWidth,
                                  // Only availability is emphasized (solid green);
                                  // the rest is a faint ghost so it stops looking
                                  // like a christmas tree. Details are on hover.
                                  background: p.available
                                    ? 'var(--mantine-color-green-6)'
                                    : 'var(--mantine-color-gray-5)',
                                  opacity: p.available ? 1 : 0.22,
                                }}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>

      {/* Hover inspector: everyone's status for the hovered slot. */}
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
            {formatInstant(hover.key, tz)} - {formatTime(addMinutes(hover.key, poll.granularity), tz)}
          </Text>
          {participants.map((p) => {
            const meta = STATUS_META[statusFor(p, hover.key)];
            return (
              <Group key={p.id} justify="space-between" gap="xs" wrap="nowrap" mb={2}>
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
            onClick={() => onChange?.(new Set())}
          >
            Tout effacer (cette réponse)
          </Button>
        </Group>
      )}
    </div>
  );
}
