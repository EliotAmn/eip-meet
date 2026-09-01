'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, ActionIcon, Text, Button } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { DateTime } from 'luxon';
import type { PollConfig } from '@/lib/types';
import { cellToUtc, enumerateDates, rowCount } from '@/lib/time';
import classes from './WeekCalendar.module.css';

const ROW_HEIGHT = 24;
// A status square is a few pixels; this is how many stack in one column.
const SQUARE_PER_COL = Math.max(1, Math.floor((ROW_HEIGHT - 4) / 5));

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

      <div className={`${classes.grid} no-select`} style={{ gridTemplateColumns }}>
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
              <div
                className={classes.timeCol}
                style={{ height: ROW_HEIGHT }}
              >
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

                // Fond : vert si tout le monde est dispo, sinon la couleur du
                // participant connecté quand il est dispo, sinon rien.
                const background = everyone
                  ? 'var(--mantine-color-green-6)'
                  : mine
                    ? 'var(--mantine-color-indigo-6)'
                    : 'transparent';

                // Carrés de statut par personne, seulement si quelqu'un est dispo.
                const columns = anyAvailable
                  ? squareColumns(participants, (p) =>
                      p.id === meId ? mine : !!otherSet?.has(p.id),
                    )
                  : null;

                return (
                  <div
                    key={`${dateISO}-${rowIndex}`}
                    className={`${classes.cell} ${isHour ? classes.hourTop : ''} ${
                      readOnly ? classes.readonly : ''
                    }`}
                    style={{ height: ROW_HEIGHT, background }}
                    onPointerDown={
                      readOnly
                        ? undefined
                        : (e) => {
                            (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
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
                    {columns && (
                      <div className={classes.squares}>
                        {columns.map((col, ci) => (
                          <div className={classes.sqCol} key={ci}>
                            {col.map((p) => (
                              <span
                                key={p.id}
                                className={classes.sq}
                                title={p.name}
                                style={{
                                  background: p.available
                                    ? 'var(--mantine-color-green-9)'
                                    : 'var(--mantine-color-red-6)',
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
