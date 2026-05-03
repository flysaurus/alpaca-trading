import { NextResponse } from 'next/server';
import { parseDate } from '@/lib/parse-date';

let lastCapture: {
  time: string;
  workoutCount: number;
  rawValues: Record<string, unknown>;
  parsedDate: string | null;
} | null = null;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const obj = (body && typeof body === 'object') ? body as Record<string, unknown> : {};
    
    let workouts: unknown[] = [];
    if (obj.data && typeof obj.data === 'object' && Array.isArray((obj.data as Record<string, unknown>).workouts)) {
      workouts = (obj.data as Record<string, unknown>).workouts as unknown[];
    }

    let rawValues: Record<string, unknown> = {};
    let parsedDate: string | null = null;
    
    if (workouts.length > 0 && workouts[0] && typeof workouts[0] === 'object') {
      const w = workouts[0] as Record<string, unknown>;
      rawValues = {
        start: w.start,
        end: w.end,
        startDate: w.startDate,
        date: w.date,
        creationDate: w.creationDate,
        name: w.name,
        duration: w.duration,
        workoutType: w.workoutType,
      };
      parsedDate = parseDate(w.start || w.startDate || w.date || w.creationDate);
    }

    lastCapture = {
      time: new Date().toISOString(),
      workoutCount: workouts.length,
      rawValues,
      parsedDate,
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
