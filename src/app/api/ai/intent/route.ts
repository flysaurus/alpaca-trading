// ── POST /api/ai/intent — Intent Classification ─────────────────
// Accepts a user message, returns classified intents with
// multi-intent support and suggested workflows.

import { NextRequest, NextResponse } from 'next/server';
import { classifyIntent } from '@/lib/ai/intentClassifier';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const useLLM = body.use_llm === true; // Default false (local classifier is fast + free)

    const classification = await classifyIntent(message, { useLLM });

    return NextResponse.json({
      success: true,
      classification,
      provider: useLLM ? 'deepseek' : 'local',
    });
  } catch (error: any) {
    console.error('[API] /ai/intent failed:', error);
    return NextResponse.json(
      { error: error.message || 'Intent classification failed' },
      { status: 500 }
    );
  }
}
