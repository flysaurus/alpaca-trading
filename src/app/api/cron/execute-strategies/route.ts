import { NextResponse } from 'next/server';
import { executeStrategies, isMarketOpen } from '@/lib/strategies/executor';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === 'true';
  const types = url.searchParams.get('types')
    ?.split(',')
    .filter((t): t is 'dca' | 'rebalance' | 'momentum' | 'mean_reversion' =>
      ['dca', 'rebalance', 'momentum', 'mean_reversion'].includes(t)
    );

  const marketOpen = isMarketOpen();

  // Log start
  console.log(`[Cron] Strategy execution started at ${new Date().toISOString()}`);
  console.log(`[Cron] Market open: ${marketOpen}, Dry run: ${dryRun}`);

  try {
    const result = await executeStrategies({
      strategyTypes: types,
      dryRun,
    });

    console.log(`[Cron] Strategy execution complete: ${result.executed} executed, ${result.failed} failed, ${result.skipped} skipped`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      market_open: marketOpen,
      dry_run: dryRun,
      summary: {
        executed: result.executed,
        failed: result.failed,
        skipped: result.skipped,
        total: result.results.length,
      },
      results: result.results,
    });
  } catch (err: any) {
    console.error('[Cron] Strategy execution failed:', err.message);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
