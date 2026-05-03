import { NextResponse } from 'next/server';
import { parseDate } from '@/lib/parse-date';

let lastCapture: {
  time: string;
  workoutCount: number;
  rawStartDate?: unknown;
  rawDate?: unknown;
  rawCreationDate?: unknown;
  parsedDate: string | null;
  schema: Record<string, string>;
} | null = null;

function detectType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `Array[${v.length}]`;
  if (typeof v === 'object') return `Object(${Object.keys(v as object).slice(0,5).join(',')}...)`;
  if (typeof v === 'number') return 'number';
  return typeof v;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const obj = (body && typeof body === 'object') ? body as Record<string, unknown> : {};
    
    let workouts: unknown[] = [];
    if (obj.data && typeof obj.data === 'object' && Array.isArray((obj.data as Record<string, unknown>).workouts)) {
      workouts = (obj.data as Record<string, unknown>).workouts as unknown[];
    }

    let rawStartDate: unknown;
    let rawDate: unknown;
    let rawCreationDate: unknown;
    let schema: Record<string, string> = {};
    
    if (workouts.length > 0 && workouts[0] && typeof workouts[0] === 'object') {
      const w = workouts[0] as Record<string, unknown>;
      rawStartDate = w.startDate;
      rawDate = w.date;
      rawCreationDate = w.creationDate;
      schema = Object.fromEntries(
        Object.entries(w).map(([k, v]) => [k, detectType(v)])
      );
    }

    lastCapture = {
      time: new Date().toISOString(),
      workoutCount: workouts.length,
      rawStartDate,
      rawDate,
      rawCreationDate,
      parsedDate: parseDate(rawStartDate || rawDate || rawCreationDate),
      schema,
    };

    return NextResponse.json({ success: true, workoutCount: workouts.length });
  } catch {
    return NextResponse.json({ success: false });
  }
}

export async function GET() {
  if (!lastCapture) {
    return NextResponse.json({ message: 'No capture yet. Send HAE webhook here first.' });
  }
  return NextResponse.json(lastCapture);
}
