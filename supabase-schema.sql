-- Alpaca Trading Dashboard — Supabase Schema
-- Run this in the Supabase SQL Editor after creating your project

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── users ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alpaca_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── strategies ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('dca', 'rebalance', 'momentum', 'mean_reversion')),
  name TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_strategies_user_id ON strategies(user_id);
CREATE INDEX idx_strategies_type ON strategies(type);

-- ── ai_suggestions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_suggestions_user_id ON ai_suggestions(user_id);
CREATE INDEX idx_ai_suggestions_created_at ON ai_suggestions(created_at DESC);

-- ── account_snapshots ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS account_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  equity NUMERIC NOT NULL DEFAULT 0,
  cash NUMERIC NOT NULL DEFAULT 0,
  buying_power NUMERIC NOT NULL DEFAULT 0,
  day_pnl NUMERIC NOT NULL DEFAULT 0,
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  positions JSONB NOT NULL DEFAULT '[]',
  UNIQUE(user_id, date)
);

CREATE INDEX idx_account_snapshots_user_date ON account_snapshots(user_id, date DESC);

-- ── trade_history ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alpaca_order_id TEXT UNIQUE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  qty NUMERIC NOT NULL DEFAULT 0,
  filled_price NUMERIC NOT NULL DEFAULT 0,
  filled_at TIMESTAMPTZ DEFAULT NOW(),
  strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL
);

CREATE INDEX idx_trade_history_user_id ON trade_history(user_id);
CREATE INDEX idx_trade_history_symbol ON trade_history(symbol);
CREATE INDEX idx_trade_history_filled_at ON trade_history(filled_at DESC);

-- ── Row Level Security (RLS) ────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own rows
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own data" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Strategies
CREATE POLICY "Users can read own strategies" ON strategies
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own strategies" ON strategies
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own strategies" ON strategies
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own strategies" ON strategies
  FOR DELETE USING (auth.uid() = user_id);

-- AI suggestions
CREATE POLICY "Users can read own suggestions" ON ai_suggestions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own suggestions" ON ai_suggestions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Account snapshots
CREATE POLICY "Users can read own snapshots" ON account_snapshots
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own snapshots" ON account_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Trade history
CREATE POLICY "Users can read own trades" ON trade_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trades" ON trade_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── Updated-at trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_strategies_updated_at
  BEFORE UPDATE ON strategies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
