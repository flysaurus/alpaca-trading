import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (_client) return _client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a mock client that throws on DB calls during build/SSR
    // This prevents crashes during static generation
    _client = new Proxy({} as SupabaseClient, {
      get(target, prop) {
        if (prop === 'from') {
          return () => ({
            select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
            insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
            update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
            delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
            upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
          });
        }
        return (target as any)[prop];
      },
    });
    return _client;
  }

  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _client;
}

/* ── Types ─────────────────────────────────────────────────────── */

export interface DbUser {
  id: string;
  alpaca_account_id: string | null;
  created_at: string;
}

export interface DbStrategy {
  id: string;
  user_id: string;
  type: 'dca' | 'rebalance' | 'momentum' | 'mean_reversion';
  name: string;
  params: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbAiSuggestion {
  id: string;
  user_id: string;
  prompt: string;
  response: string;
  context: Record<string, any>;
  created_at: string;
}

export interface DbAccountSnapshot {
  id: string;
  user_id: string;
  date: string;
  equity: number;
  cash: number;
  buying_power: number;
  day_pnl: number;
  total_pnl: number;
  positions: any[];
}

export interface DbTradeHistory {
  id: string;
  user_id: string;
  alpaca_order_id: string;
  symbol: string;
  side: string;
  qty: number;
  filled_price: number;
  filled_at: string;
  strategy_id: string | null;
}

/* ── User auto-create helper ─────────────────────────────────── */

async function ensureUser(userId: string) {
  const { error: insertErr } = await getClient()
    .from('users')
    .insert({ id: userId })
    .select()
    .single();
  // Ignore duplicate key errors (user already exists)
  if (insertErr && !insertErr.message.includes('duplicate')) {
    console.warn('ensureUser insert error:', insertErr.message);
  }
}

export async function ensureUserByAlpacaId(alpacaAccountId: string): Promise<string> {
  // Upsert user by alpaca_account_id
  const { error: upsertErr } = await getClient()
    .from('users')
    .upsert({ alpaca_account_id: alpacaAccountId }, { onConflict: 'alpaca_account_id' });
  if (upsertErr) {
    console.warn('[ensureUserByAlpacaId] upsert error:', upsertErr.message);
    throw upsertErr;
  }

  // Fetch the user's UUID
  const { data: user, error: fetchErr } = await getClient()
    .from('users')
    .select('id')
    .eq('alpaca_account_id', alpacaAccountId)
    .single();

  if (fetchErr || !user) {
    console.warn('[ensureUserByAlpacaId] fetch error:', fetchErr?.message);
    throw fetchErr || new Error('User not found after upsert');
  }

  return user.id;
}

/* ── Strategy helpers ──────────────────────────────────────────── */

export async function fetchStrategies(userId: string) {
  const { data, error } = await getClient()
    .from('strategies')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as DbStrategy[];
}

export async function createStrategy(userId: string, strategy: Omit<DbStrategy, 'id' | 'user_id' | 'created_at' | 'updated_at'>) {
  await ensureUser(userId);
  const { data, error } = await getClient()
    .from('strategies')
    .insert({ ...strategy, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as DbStrategy;
}

export async function updateStrategy(id: string, userId: string, patch: Partial<DbStrategy>) {
  const { data, error } = await getClient()
    .from('strategies')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as DbStrategy;
}

export async function deleteStrategy(id: string, userId: string) {
  const { error } = await getClient()
    .from('strategies')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

/* ── Account snapshots ─────────────────────────────────────────── */

export async function fetchSnapshots(userId: string, limit = 90) {
  const { data, error } = await getClient()
    .from('account_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []) as DbAccountSnapshot[];
}

export async function upsertSnapshot(snapshot: Omit<DbAccountSnapshot, 'id'>) {
  const { data, error } = await getClient()
    .from('account_snapshots')
    .upsert(snapshot, { onConflict: 'user_id,date' })
    .select()
    .single();
  if (error) throw error;
  return data as DbAccountSnapshot;
}

/* ── AI suggestions ────────────────────────────────────────────── */

export async function fetchAiSuggestions(userId: string, limit = 50) {
  const { data, error } = await getClient()
    .from('ai_suggestions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as DbAiSuggestion[];
}

export async function createAiSuggestion(suggestion: Omit<DbAiSuggestion, 'id'>) {
  await ensureUser(suggestion.user_id);
  const { data, error } = await getClient()
    .from('ai_suggestions')
    .insert(suggestion)
    .select()
    .single();
  if (error) throw error;
  return data as DbAiSuggestion;
}

/* ── Trade history ─────────────────────────────────────────────── */

export async function insertTrade(trade: {
  user_id: string;
  alpaca_order_id: string;
  symbol: string;
  side: string;
  qty: number;
  filled_price: number;
  filled_at: string;
  strategy_id?: string | null;
}) {
  await ensureUser(trade.user_id);
  const { data, error } = await getClient()
    .from('trade_history')
    .upsert(trade, { onConflict: 'alpaca_order_id' })
    .select()
    .single();
  if (error) throw error;
  return data as DbTradeHistory;
}

export async function fetchTradeHistory(userId: string, options?: { symbol?: string; strategyId?: string; limit?: number }) {
  let query = getClient()
    .from('trade_history')
    .select('*')
    .eq('user_id', userId)
    .order('filled_at', { ascending: false });

  if (options?.symbol) query = query.eq('symbol', options.symbol);
  if (options?.strategyId) query = query.eq('strategy_id', options.strategyId);
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as DbTradeHistory[];
}
