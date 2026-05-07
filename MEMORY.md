# MEMORY - Long-term Memory

## 📝 Complete Open Issues Tracker

### **1. Portfolio Value Chart - Incorrect Display** 🔴
- **Issue**: Portfolio value chart showing incorrect values
- **Status**: Needs investigation and fix
- **Priority**: High

### **2. News Intelligence - AI Analysis (FinBERT)** 🟡
- **Issue**: OpenRouter credits exhausted, FinBERT not being called
- **Status**: Code is ready, just needs OpenRouter API key credits
- **Impact**: AI sentiment analysis, trading implications, key takeaways not shown

### **3. XLK/SPY 52-Week Range White Mark** 🟡
- **Issue**: Triangle indicator added but may need visual tuning
- **Status**: Code implemented, needs user verification
- **Priority**: Medium

---

## ✅ Complete Features
- XLK/SPY watchlist white marks
- Keyword-based sentiment (no API needed)
- Market indices with live prices
- Positions with 52-week range bars
- Macro calendar (FOMC, CPI, jobs, OPEX, etc.)
- Insider trading feed (SEC Form 4)
- Alert system with keyword matching
- Notification badges (desktop + mobile)
- Telegram notifications for orders
- **P&L Charts** (real values, bar format, time-based aggregation, EST timezone) ✅
- **Strategy Engine** (DCA, Rebalance, Momentum, Mean Reversion) ✅
- **AI Advisor** (multi-signal analysis, suggestion generation, autonomous mode) ✅

---

## 📊 Strategy Engine Implementation Status

### ✅ **Completed Components:**

#### **1. Core Strategy Files**
- `/lib/strategies/dca.ts` - Dollar Cost Averaging implementation ✅
- `/lib/strategies/rebalance.ts` - Portfolio rebalancing logic ✅
- `/lib/strategies/momentum.ts` - Momentum scoring and rotation ✅
- `/lib/strategies/meanreversion.ts` - Z-score and Bollinger Bands ✅
- `/lib/strategies/backtest.ts` - Historical backtesting engine ✅

#### **2. Scheduler & Cron**
- `/lib/scheduler.ts` - Market hours and execution scheduling ✅
- `/app/api/cron/route.ts` - Cron API endpoint with security ✅
- `vercel.json` - Updated with proper cron schedules ✅

#### **3. Strategy Management UI**
- `/app/strategies/page.tsx` - Complete strategy management interface ✅
- Individual strategy cards with enable/disable toggles ✅
- Configuration forms for each strategy ✅
- Execution history log ✅

#### **4. Integration**
- AIStrategiesTab references all strategies ✅
- Main page includes strategies tab ✅

### 🔄 **Cron Schedule Configuration:**
- **Every 15 min (13-20 UTC)**: DCA and Rebalance checks
- **Every hour (13-20 UTC)**: Momentum updates  
- **8:30 AM ET (12:30 UTC)**: Pre-market digest

### 🤖 **AI Advisor Implementation:** ✅
- **Signal Collection**: Price action (RSI, MACD, volume), news sentiment, insider activity, macro context, portfolio exposure
- **AI Suggestion Generation**: Structured prompts with multi-signal orchestration
- **Advisor UI**: Watchlist management, suggestion cards, execution confirmation
- **Autonomous Mode**: Danger-level safety controls, emergency kill switch, trade logging
- **Safety Features**: 'CONFIRM' requirement, buy-only mode, comprehensive audit trails

### 📋 **Strategy Features Implemented:**

#### **DCA Strategy:**
- Configurable symbol, amount, frequency
- Schedule storage and execution tracking
- Market order placement with share calculation
- Next execution time calculation

#### **Rebalance Strategy:**
- Target allocation configuration
- Drift threshold monitoring
- Full and cash-only modes
- Buy/sell order generation

#### **Momentum Strategy:**
- Universe configuration
- Multiple timeframe returns (1d, 1w, 1m, 3m)
- Momentum scoring with volatility adjustment
- Top/bottom N selection

#### **Mean Reversion Strategy:**
- Z-score calculation
- Bollinger Bands implementation
- Overbought/oversold signals
- Confidence scoring

#### **Backtesting:**
- Buy-and-hold strategy
- DCA backtesting
- Performance metrics (returns, drawdown, win rate)
- Trade history tracking

---

## 🚀 **Recent Deployments**
- **P&L Chart Fixes**: Real values, bar charts, EST timezone, time-based aggregation
- **Strategy Engine**: Complete implementation with all 4 strategies + backtesting + UI