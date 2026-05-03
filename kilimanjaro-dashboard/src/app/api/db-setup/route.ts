import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// SQL to run against Supabase to add dedup constraints
const ADD_UNIQUE_CONSTRAINTS = `
-- Add unique constraint to prevent duplicate workouts
ALTER TABLE workouts 
ADD CONSTRAINT IF NOT EXISTS unique_workout_per_day 
UNIQUE (date, workout_type);

-- Add unique constraint to prevent duplicate metrics  
ALTER TABLE metrics
ADD CONSTRAINT IF NOT EXISTS unique_metric_per_point
UNIQUE (date, metric_type, source);
`;

export async function GET() {
  return NextResponse.json({
    message: 'Run this SQL in your Supabase SQL editor to prevent workout duplicates',
    sql: ADD_UNIQUE_CONSTRAINTS,
  });
}
