import { NextResponse } from 'next/server';

let lastWorkout: Record<string, unknown> | null = null;
let lastPayloadTime: string | null = null;
let payloadSize = 0;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const obj = (body && typeof body === 'object') ? body as Record<string, unknown> : {};
    
    let workouts: unknown[] = [];
    if (obj.data && typeof obj.data === 'object' && Array.isArray((obj.data as Record<string, unknown>).workouts)) {
      workouts = (obj.data as Record<string, unknown>).workouts as unknown[];
    }

    if (workouts.length > 0 && workouts[0] && typeof workouts[0] === 'object') {
      lastWorkout = workouts[0] as Record<string, unknown>;
    }
    
    lastPayloadTime = new Date().toISOString();
    payloadSize = JSON.stringify(body).length;

    return NextResponse.json({ success: true, workoutCount: workouts.length });
  } catch {
    return NextResponse.json({ success: false });
  }
}

export async function GET() {
  if (!lastWorkout) {
    return NextResponse.json({
      message: 'No workout captured yet. Point your HAE webhook to /api/capture and trigger a manual export.',
    });
  }

  const schema: Record<string, string> = {};
  for (const [k, v] of Object.entries(lastWorkout)) {
    if (Array.isArray(v)) {
      schema[k] = `Array[${v.length}]`;
    } else if (v && typeof v === 'object') {
      schema[k] = JSON.stringify(v).slice(0, 120);
    } else {
      schema[k] = String(v).slice(0, 60);
    }
  }

  return NextResponse.json({
    capturedAt: lastPayloadTime,
    payloadSize,
    workoutSchema: schema,
    startDateField: lastWorkout.startDate || lastWorkout.date || lastWorkout.creationDate || 'NOT FOUND',
    dateFormatDetected: typeof lastWorkout.startDate || typeof lastWorkout.date,
  });
}
