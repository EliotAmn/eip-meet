import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/server';
import { applyIcs, previewIcs } from '@/lib/icsImport';
import { isValidTimezone, ValidationError } from '@/lib/validate';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * .ics import. Body: { text, fileName, timezone, apply?, exclude? }.
 * Without `apply`: the preview (what would change). With it: applies the
 * changes, except the keys listed in `exclude`.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = typeof body?.text === 'string' ? body.text : '';
  if (!text) return NextResponse.json({ error: 'Fichier vide.' }, { status: 400 });
  if (text.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Fichier trop gros (5 Mo maximum).' }, { status: 413 });
  }
  const fileName = typeof body?.fileName === 'string' ? body.fileName.slice(0, 200) : 'calendrier.ics';
  const tz = user.timezone ?? (isValidTimezone(body?.timezone) ? body.timezone : 'Europe/Paris');
  try {
    if (body?.apply === true) {
      const exclude = new Set(
        (Array.isArray(body.exclude) ? body.exclude : []).filter((k): k is string => typeof k === 'string'),
      );
      return NextResponse.json(await applyIcs(user.id, text, fileName, tz, exclude));
    }
    return NextResponse.json(await previewIcs(user.id, text, fileName, tz));
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
