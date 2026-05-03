import { NextResponse } from 'next/server';

interface CaptureEntry {
  time: string;
  workoutCount: number;
  workoutSchema: Record<string, string>;
  firstWorkout: Record<string, unknown>;
}

const captures: CaptureEntry[] = [];

function detectType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `Array[${v.length}]`;
  if (typeof v === 'object') return 'Object';
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

    let schema: Record<string, string> = {};
    let firstWorkout: Record<string, unknown> = {};
    
    if (workouts.length > 0 && workouts[0] && typeof workouts[0] === 'object') {
      const w = workouts[0] as Record<string, unknown>;
      firstWorkout = w;
      schema = Object.fromEntries(
        Object.entries(w).map(([k, v]) => [k, detectType(v)])
      );
    }

    captures.unshift({
      time: new Date().toISOString(),
      workoutCount: workouts.length,
      workoutSchema: schema,
      firstWorkout,
    });
    if (captures.length > 10) captures.pop();

    return NextResponse.json({ success: true, captured: captures.length });
  } catch {
    return NextResponse.json({ success: false });
  }
}

export async function GET() {
  return NextResponse.json({
    captures,
    instruction: 'Change webhook URL in Health Auto Export to this /api/capture endpoint, then trigger a manual export',
  });
}
