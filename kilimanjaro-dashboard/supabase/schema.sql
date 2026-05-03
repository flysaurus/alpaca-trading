-- Supabase SQL Migration for Kilimanjaro Dashboard
-- Run this in the Supabase SQL Editor

-- Enable Row Level Security (recommended)
-- But for this use case, we'll keep it open since the app handles auth

-- Metrics table
CREATE TABLE IF NOT EXISTS metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date TIMESTAMPTZ NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  unit VARCHAR(50) NOT NULL,
  source VARCHAR(255) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workouts table
CREATE TABLE IF NOT EXISTS workouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date TIMESTAMPTZ NOT NULL,
  workout_type VARCHAR(100) NOT NULL,
  duration INT NOT NULL,
  distance DOUBLE PRECISION,
  elevation_gain DOUBLE PRECISION,
  active_energy DOUBLE PRECISION,
  avg_heart_rate DOUBLE PRECISION,
  max_heart_rate DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraints for idempotent inserts (HAE re-exports won't fail)
ALTER TABLE metrics
ADD CONSTRAINT IF NOT EXISTS unique_metric_per_point
UNIQUE (date, metric_type, source);

ALTER TABLE workouts
ADD CONSTRAINT IF NOT EXISTS unique_workout_per_day
UNIQUE (date, workout_type);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_metrics_date ON metrics(date DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_type_date ON metrics(metric_type, date DESC);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date DESC);

-- Function to get stats (30-day summary)
CREATE OR REPLACE FUNCTION get_stats(days_back INT DEFAULT 30)
RETURNS TABLE (
  avg_steps BIGINT,
  total_workouts BIGINT,
  total_duration BIGINT,
  total_elevation BIGINT,
  avg_workout_duration BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(ROUND(AVG(CASE WHEN m.metric_type = 'steps' THEN m.value END))::BIGINT, 0) as avg_steps,
    COUNT(DISTINCT w.id)::BIGINT as total_workouts,
    COALESCE(SUM(w.duration)::BIGINT, 0) as total_duration,
    COALESCE(ROUND(SUM(COALESCE(w.elevation_gain, 0)))::BIGINT, 0) as total_elevation,
    COALESCE(ROUND(AVG(w.duration))::BIGINT, 0) as avg_workout_duration
  FROM metrics m, workouts w
  WHERE m.date > NOW() - (days_back || ' days')::INTERVAL
     OR w.date > NOW() - (days_back || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;
