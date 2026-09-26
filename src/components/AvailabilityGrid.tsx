'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, ActionIcon, Text, Paper } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { DateTime } from 'luxon';
import type { MeetingConfig, SlotStatus } from '@/lib/types';
import type { GridParticipant, StatusMap } from '@/lib/availability';
import {
  addMinutes,
  cellToUtc,
  enumerateDates,
  formatInstant,
  formatTime,
  rowCount,
} from '@/lib/time';
import classes from './AvailabilityGrid.module.css';

const ROW_HEIGHT = 24;

export type PaintMode = 'yes' | 'if_needed' | 'erase';

type DisplayStatus = 'yes' | 'if_needed' | 'unavailable' | 'busy' | 'no-answer' | 'empty';

const STATUS_META: Record<DisplayStatus, { label: string; color: string }> = {
  yes: { label: 'Dispo', color: 'var(--mantine-color-green-6)' },
  if_needed: { label: 'Si besoin', color: 'var(--mantine-color-yellow-5)' },
  unavailable: { label: 'Pas dispo', color: 'var(--mantine-color-red-6)' },
  busy: { label: 'Indisponible', color: 'var(--mantine-color-red-6)' },
  'no-answer': { label: 'Pas répondu', color: 'var(--mantine-color-gray-5)' },
  empty: { label: 'Calendrier vide', color: 'var(--mantine-color-gray-5)' },
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

/** Aggregate stripe: all yes / all but some "si besoin" / 1 missing / more. */
export function stripeColor(st: Map<string, SlotStatus> | undefined, total: number): string | null {
  const available = st?.size ?? 0;
  if (available === 0 || total === 0) return null;
  const missing = total - available;
  if (missing === 0) {
    const ifNeeded = [...st!.values()].some((s) => s === 'if_needed');
    return ifNeeded ? 'var(--mantine-color-green-3)' : 'var(--mantine-color-green-8)';
  }
  return missing === 1 ? 'var(--mantine-color-orange-6)' : 'var(--mantine-color-red-6)';
}

interface AvailabilityGridProps {
  meeting: MeetingConfig;
  tz: string;
  participants: GridParticipant[];
  statuses: StatusMap;
  /** Background of a cell, reflecting the viewer's own status. */
  myFill?: (key: string) => string | null;
  /** Guest painting. */
  editable?: boolean;
  mySlots?: Map<string, SlotStatus>;
  onChange?: (next: Map<string, SlotStatus>) => void;
  paintMode?: PaintMode;
}

export function AvailabilityGrid({
  meeting,
  tz,
  participants,
  statuses,
  myFill,
  editable = false,
  mySlots,
  onChange,
  paintMode = 'yes',
}: AvailabilityGridProps) {
  const dates = useMemo(
    () => enumerateDates(meeting.dateMin, meeting.dateMax),
    [meeting.dateMin, meeting.dateMax],
  );
  const weeks = useMemo(() => chunk(dates, 7), [dates]);
  const [weekIdx, setWeekIdx] = useState(0);
  useEffect(() => {
    if (weekIdx >= weeks.length) setWeekIdx(Math.max(0, weeks.length - 1));
  }, [weeks.length, weekIdx]);
  const rows = rowCount(meeting.dayStart, meeting.dayEnd, meeting.granularity);
  const week = weeks[weekIdx] ?? [];

  // Block painting: snapshot on press, then re-apply the rectangle from the
  // anchor to the cell under the pointer on every move (no holes when fast).
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
      const next = new Map(p.snapshot);
      for (let d = Math.min(p.anchor.day, b.day); d <= Math.max(p.anchor.day, b.day); d += 1) {
        const dateISO = week[d];
        if (!dateISO) continue;
        for (let r = Math.min(p.anchor.row, b.row); r <= Math.max(p.anchor.row, b.row); r += 1) {
          const key = cellToUtc(dateISO, r, meeting.dayStart, meeting.granularity, tz);
          if (p.action === 'erase') next.delete(key);
          else next.set(key, p.action);
        }
      }
      onChange(next);
    },
    [onChange, week, meeting.dayStart, meeting.granularity, tz],
  );

  const startPaint = (day: number, row: number) => {
    if (!editable || !onChange || !mySlots) return;
    paint.current = {
      active: true,
      action: paintMode,
      anchor: { day, row },
      snapshot: new Map(mySlots),
    };
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

  const statusFor = (p: GridParticipant, key: string): DisplayStatus => {
    const s = statuses.get(key)?.get(p.id);
    if (s) return s;
    if (!p.answered) return p.kind === 'member' ? 'empty' : 'no-answer';
    return p.kind === 'member' ? 'busy' : 'unavailable';
  };

  const first = week[0];
  const last = week[week.length - 1];
  const rangeLabel =
    first && last
      ? `${DateTime.fromISO(first).setLocale('fr').toFormat('d LLL')} - ${DateTime.fromISO(last)
          .setLocale('fr')
          .toFormat('d LLL yyyy')}`
      : '';

  const hoverStyle = useMemo(() => {
    if (!hover || typeof window === 'undefined') return null;
    const width = 250;
    const estHeight = 44 + participants.length * 30;
    const gap = 8;
    let left = hover.rect.right + gap;
    if (left + width > window.innerWidth) left = hover.rect.left - width - gap;
    if (left < gap) left = gap;
    let top = hover.rect.top;
    if (top + estHeight > window.innerHeight) top = Math.max(gap, window.innerHeight - estHeight - gap);
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
        style={{ gridTemplateColumns: `64px repeat(${week.length}, minmax(44px, 1fr))` }}
        onPointerMove={onGridPointerMove}
        onMouseLeave={() => setHover(null)}
      >
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
          const minutesTotal = meeting.dayStart * 60 + rowIndex * meeting.granularity;
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
                const key = cellToUtc(dateISO, rowIndex, meeting.dayStart, meeting.granularity, tz);
                const fill = myFill?.(key) ?? null;
                const stripe = stripeColor(statuses.get(key), participants.length);
                return (
                  <div
                    key={`${dateISO}-${rowIndex}`}
                    data-cell
                    data-day={dayIdx}
                    data-row={rowIndex}
                    className={`${classes.cell} ${isHour ? classes.hourTop : ''} ${
                      editable ? '' : classes.readonly
                    }`}
                    style={{ height: ROW_HEIGHT }}
                    onPointerDown={
                      editable
                        ? (e) => {
                            (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                            startPaint(dayIdx, rowIndex);
                          }
                        : undefined
                    }
                    onMouseEnter={(e) => {
                      if (paint.current?.active) return;
                      setHover({ key, rect: e.currentTarget.getBoundingClientRect() });
                    }}
                  >
                    {fill && <div className={classes.fill} style={{ background: fill }} />}
                    {stripe && <div className={classes.stripe} style={{ background: stripe }} />}
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
            {formatTime(addMinutes(hover.key, meeting.granularity), tz)}
          </Text>
          {participants.map((p) => {
            const meta = STATUS_META[statusFor(p, hover.key)];
            const local = p.tz ? localSlotLabel(hover.key, p.tz, tz) : null;
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
