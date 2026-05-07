import { NextResponse } from 'next/server';
import { cancelOrder, AlpacaError } from '@/lib/alpaca';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = getClientIP(request);
  const limit = checkRateLimit(ip);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  try {
    const { id } = await params;
    await cancelOrder(id);

    return NextResponse.json(
      { success: true, message: `Order ${id} cancelled` },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    const status = error instanceof AlpacaError ? error.status : 500;
    return NextResponse.json(
      { error: error.message || 'Failed to cancel order' },
      { status, headers: rateLimitHeaders(limit) }
    );
  }
}
