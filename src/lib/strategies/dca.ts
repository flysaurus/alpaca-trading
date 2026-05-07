// ── Types ───────────────────────────────────────────────────────
export interface DCAConfig {
  symbol: string;
  amount_usd: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  start_date: string; // ISO date string
  end_date?: string; // Optional end date
  active: boolean;
}

export interface DCASchedule {
  id: string;
  config: DCAConfig;
  next_execution: string; // ISO timestamp
  last_execution?: string;
  history: Array<{ date: string; order_id?: string; status: 'pending' | 'filled' | 'failed' }>;
  created_at: string;
  updated_at: string;
}

// ── Schedule Storage ────────────────────────────────────────────
// Vercel KV would be ideal for production, using localStorage for demo
const SCHEDULES_KEY = 'alpaca-trading-dca-schedules';

export async function getDCAConfigs(): Promise<DCASchedule[]> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(SCHEDULES_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // Ignore
    }
  }
  return [];
}

export async function saveDCAConfigs(schedules: DCASchedule[]): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules));
  }
}

// ── Calculate Next Execution Time ───────────────────────────────
function getNextExecution(baseDate: Date, frequency: 'daily' | 'weekly' | 'monthly'): Date {
  const next = new Date(baseDate);
  
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
  }
  
  // Set to market open time (9:30 AM ET)
  next.setHours(13, 30, 0, 0); // 9:30 AM ET = 13:30 UTC
  return next;
}

// ── Execute DCA Order ───────────────────────────────────────────
export async function executeDCA(config: DCAConfig): Promise<{ order_id?: string; status: 'pending' | 'failed'; next_execution: string }> {
  // Get current price
  try {
    const res = await fetch(`/api/quotes?symbols=${config.symbol}`);
    const json = await res.json();
    
    if (!json.data || json.data.length === 0) {
      return { status: 'failed', next_execution: config.start_date };
    }
    
    const price = json.data[0].price;
    if (!price || price <= 0) {
      return { status: 'failed', next_execution: config.start_date };
    }
    
    // Calculate shares
    const shares = Math.floor(config.amount_usd / price);
    if (shares <= 0) {
      return { status: 'failed', next_execution: config.start_date };
    }
    
    // Place order
    const orderRes = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: config.symbol,
        qty: shares,
        side: 'buy',
        type: 'market',
        timeInForce: 'day',
      }),
    });
    
    const orderJson = await orderRes.json();
    
    // Update schedule
    const schedules = await getDCAConfigs();
    const existingIndex = schedules.findIndex(s => s.config.symbol === config.symbol);
    
    const nextExec = getNextExecution(new Date(), config.frequency).toISOString();
    
    if (existingIndex >= 0) {
      schedules[existingIndex] = {
        ...schedules[existingIndex],
        next_execution: nextExec,
        last_execution: new Date().toISOString(),
        history: [{
          date: new Date().toISOString(),
          order_id: orderJson.order?.id,
          status: orderJson.success ? 'pending' : 'failed',
        }, ...schedules[existingIndex].history],
        updated_at: new Date().toISOString(),
      };
    } else {
      schedules.push({
        id: `dca-${config.symbol}-${Date.now()}`,
        config,
        next_execution: nextExec,
        last_execution: new Date().toISOString(),
        history: [{
          date: new Date().toISOString(),
          order_id: orderJson.order?.id,
          status: orderJson.success ? 'pending' : 'failed',
        }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    
    await saveDCAConfigs(schedules);
    
    return {
      order_id: orderJson.order?.id,
      status: orderJson.success ? 'pending' : 'failed',
      next_execution: nextExec,
    };
  } catch (err) {
    console.error('[DCA] Execute error:', err);
    return { status: 'failed', next_execution: config.start_date };
  }
}

// ── Check and Execute DCA ───────────────────────────────────────
export async function checkDCA(): Promise<void> {
  const now = new Date().toISOString();
  const schedules = await getDCAConfigs();
  
  for (const schedule of schedules) {
    if (!schedule.config.active) continue;
    if (schedule.next_execution > now) continue;
    
    // Check if we've passed the end date
    if (schedule.config.end_date && schedule.next_execution > schedule.config.end_date) {
      schedule.config.active = false;
      await saveDCAConfigs(schedules);
      continue;
    }
    
    // Execute
    const result = await executeDCA(schedule.config);
    
    // Update schedule with result
    const updatedSchedules = await getDCAConfigs();
    const idx = updatedSchedules.findIndex(s => s.id === schedule.id);
    if (idx >= 0) {
      updatedSchedules[idx].next_execution = result.next_execution;
      await saveDCAConfigs(updatedSchedules);
    }
  }
}
