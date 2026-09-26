import { DateTime } from 'luxon';
import type { Prisma, User } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from './prisma';
import { unavailabilityIntervals } from './recurrence';
import type {
  Freq,
  MeetingDetail,
  MeetingRole,
  MeetingSummary,
  MeetingViewer,
  SlotStatus,
  UnavailabilityDTO,
  UnavailabilityType,
} from './types';

/** The signed-in user, or null. */
export async function currentUser(): Promise<User | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

// ---------- Unavailabilities ----------

type DbUnavailability = Prisma.UnavailabilityGetPayload<{ include: { exceptions: true } }>;

export function toUnavailabilityDTO(ev: DbUnavailability): UnavailabilityDTO {
  return {
    id: ev.id,
    title: ev.title,
    type: ev.type === 'soft' ? 'soft' : 'busy',
    allDay: ev.allDay,
    startDate: ev.startDate,
    endDate: ev.endDate,
    startTime: ev.startTime,
    endTime: ev.endTime,
    timezone: ev.timezone,
    freq: (['none', 'daily', 'weekly', 'monthly'].includes(ev.freq) ? ev.freq : 'none') as Freq,
    interval: ev.interval,
    byWeekday: ev.byWeekday ? ev.byWeekday.split(',').map(Number) : [],
    until: ev.until,
    exceptions: ev.exceptions.map((x) => ({
      date: x.date,
      cancelled: x.cancelled,
      title: x.title,
      type: x.type === 'soft' || x.type === 'busy' ? (x.type as UnavailabilityType) : null,
      startTime: x.startTime,
      endTime: x.endTime,
    })),
  };
}

// ---------- Meetings: access ----------

const memberWhere = (user: User): Prisma.MeetingWhereInput => ({
  OR: [
    { ownerId: user.id },
    {
      members: {
        some: {
          OR: [
            { userId: user.id },
            ...(user.email ? [{ email: user.email.toLowerCase() }] : []),
          ],
        },
      },
    },
  ],
});

function roleFor(
  meeting: { ownerId: string; members: { id: string; userId: string | null; email: string; role: string }[] },
  user: User,
) {
  const email = user.email?.toLowerCase();
  const member =
    meeting.members.find((m) => m.userId === user.id) ??
    (email ? meeting.members.find((m) => m.email === email) : undefined);
  if (meeting.ownerId === user.id) return { role: 'owner' as MeetingRole, member };
  if (!member) return null;
  return { role: (member.role === 'admin' ? 'admin' : 'member') as MeetingRole, member };
}

/** Meetings the user owns or is invited to, upcoming first. */
export async function meetingsForUser(user: User): Promise<MeetingSummary[]> {
  const rows = await prisma.meeting.findMany({
    where: memberWhere(user),
    include: { members: { select: { id: true, userId: true, email: true, role: true } } },
    orderBy: { dateMin: 'asc' },
  });
  const today = DateTime.now().toISODate()!;
  const list = rows.map((m) => ({
    id: m.id,
    title: m.title,
    dateMin: m.dateMin,
    dateMax: m.dateMax,
    role: roleFor(m, user)?.role ?? 'member',
  }));
  // Upcoming/ongoing first (by start), then past ones (most recent first).
  const upcoming = list.filter((m) => m.dateMax >= today);
  const past = list.filter((m) => m.dateMax < today).reverse();
  return [...upcoming, ...past];
}

/** Load a meeting if the user may access it, with their role. */
export async function meetingAccess(meetingId: string, user: User) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { members: true },
  });
  if (!meeting) return null;
  const access = roleFor(meeting, user);
  if (!access) return null;
  // Link an email invitation to the account the first time it is used.
  if (access.member && !access.member.userId) {
    await prisma.meetingMember.update({
      where: { id: access.member.id },
      data: { userId: user.id },
    });
  }
  return {
    meeting,
    role: access.role,
    member: access.member ?? null,
    isAdmin: access.role === 'owner' || access.role === 'admin',
  };
}

// ---------- Meetings: availability detail ----------

/**
 * Everything a meeting page needs: config, members with their busy/soft
 * intervals (derived from their personal calendars, titles never exposed) and
 * guests with their painted slots.
 */
export async function buildMeetingDetail(
  meetingId: string,
  viewer: MeetingViewer,
  opts: { includeEmails: boolean; includeTokens: boolean },
): Promise<MeetingDetail | null> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      members: {
        orderBy: { createdAt: 'asc' },
        include: {
          user: { include: { unavailabilities: { include: { exceptions: true } } } },
        },
      },
      guests: {
        orderBy: { createdAt: 'asc' },
        include: { slots: { select: { startUtc: true, status: true } } },
      },
    },
  });
  if (!meeting) return null;

  // Wide enough to cover the meeting days in every timezone.
  const from = DateTime.fromISO(meeting.dateMin, { zone: 'utc' }).minus({ days: 1 });
  const to = DateTime.fromISO(meeting.dateMax, { zone: 'utc' }).plus({ days: 2 });

  return {
    meeting: {
      id: meeting.id,
      title: meeting.title,
      dateMin: meeting.dateMin,
      dateMax: meeting.dateMax,
      granularity: meeting.granularity,
      dayStart: meeting.dayStart,
      dayEnd: meeting.dayEnd,
    },
    viewer,
    members: meeting.members.map((m) => {
      const events = (m.user?.unavailabilities ?? []).map(toUnavailabilityDTO);
      const { busy, soft } = unavailabilityIntervals(events, from, to);
      return {
        id: m.id,
        userId: m.userId,
        name: m.user?.name || m.email,
        email: opts.includeEmails ? m.email : null,
        image: m.user?.image ?? null,
        role: (m.userId && m.userId === meeting.ownerId
          ? 'owner'
          : m.role === 'admin'
            ? 'admin'
            : 'member') as MeetingRole,
        timezone: m.user?.timezone ?? null,
        calendarFilled: events.length > 0,
        busy,
        soft,
      };
    }),
    guests: meeting.guests.map((g) => ({
      id: g.id,
      name: g.name,
      token: opts.includeTokens ? g.token : null,
      timezone: g.timezone,
      slots: g.slots.map((s) => ({
        start: s.startUtc,
        status: (s.status === 'if_needed' ? 'if_needed' : 'yes') as SlotStatus,
      })),
    })),
  };
}
