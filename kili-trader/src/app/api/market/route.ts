import { NextResponse } from 'next/server';
import { getClock } from '@/lib/alpaca';

export async function GET() {
  try {
    const clock = await getClock();

    return NextResponse.json({
      isOpen: clock.is_open,
      nextOpen: clock.next_open,
      nextClose: clock.next_close,
      timestamp: clock.timestamp,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch market clock' },
      { status: 500 }
    );
  }
}
