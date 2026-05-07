// ── Notification Types ──────────────────────────────────────────
export interface Notification {
  id: string;
  type: 'alert' | 'macro' | 'insider' | 'market';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  symbol?: string;
  url?: string;
  priority?: 'low' | 'medium' | 'high';
}

// ── In-Memory Notification Store ─────────────────────────────────
let notifications: Notification[] = [];
let unreadCount = 0;

// ── Add Notification ────────────────────────────────────────────
export function addNotification(note: Omit<Notification, 'id' | 'timestamp' | 'read' | 'priority'> & { priority?: 'low' | 'medium' | 'high' }): string {
  const id = `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const notification: Notification = {
    id,
    timestamp: Date.now(),
    read: false,
    priority: note.priority || 'medium',
    ...note,
  };
  notifications.unshift(notification); // Add to beginning (newest first)
  unreadCount++;
  return id;
}

// ── Mark as Read ────────────────────────────────────────────────
export function markAsRead(id: string): void {
  const note = notifications.find(n => n.id === id);
  if (note && !note.read) {
    note.read = true;
    unreadCount--;
  }
}

// ── Mark All as Read ────────────────────────────────────────────
export function markAllAsRead(): number {
  const count = notifications.filter(n => !n.read).length;
  notifications.forEach(n => n.read = true);
  unreadCount = 0;
  return count;
}

// ── Get Notifications ───────────────────────────────────────────
export function getNotifications(params?: {
  limit?: number;
  unreadOnly?: boolean;
  before?: number;
  after?: number;
}): Notification[] {
  let result = notifications;

  if (params?.unreadOnly) {
    result = result.filter(n => !n.read);
  }
  if (params?.before) {
    result = result.filter(n => n.timestamp < params!.before!);
  }
  if (params?.after) {
    result = result.filter(n => n.timestamp > params!.after!);
  }

  if (params?.limit) {
    result = result.slice(0, params.limit);
  }

  return result;
}

// ── Get Unread Count ────────────────────────────────────────────
export function getUnreadCount(): number {
  return unreadCount;
}

// ── Alert Matching ──────────────────────────────────────────────
export interface AlertRule {
  id: string;
  symbol: string;
  keywords: string[];
  sentiment: 'any' | 'bullish' | 'bearish';
}

export function checkAlerts(news: any[], rules: AlertRule[]): void {
  for (const n of news) {
    const text = `${n.headline} ${n.summary}`.toLowerCase();
    for (const rule of rules) {
      if (rule.symbol !== n.symbol) continue;
      
      // Check keywords
      const hasKeyword = rule.keywords.some(k => text.includes(k.toLowerCase()));
      if (!hasKeyword) continue;

      // Check sentiment if required
      if (rule.sentiment !== 'any') {
        const isBullish = n.sentiment === 'bullish';
        const isBearish = n.sentiment === 'bearish';
        if (rule.sentiment === 'bullish' && !isBullish) continue;
        if (rule.sentiment === 'bearish' && !isBearish) continue;
      }

      // Create notification
      addNotification({
        type: 'alert',
        symbol: n.symbol,
        title: `Alert: ${n.symbol}`,
        message: n.headline,
        url: n.url,
        priority: 'high',
      });
    }
  }
}

// ── Clear Old Notifications ─────────────────────────────────────
export function cleanupOldNotifications(daysOld = 7): void {
  const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  const beforeCount = notifications.length;
  notifications = notifications.filter(n => n.timestamp > cutoff);
  unreadCount = notifications.filter(n => !n.read).length;
}
