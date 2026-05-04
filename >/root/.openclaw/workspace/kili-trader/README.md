# Kili Trader 🏔️📈

Paper trading dashboard with AI-powered stock scanning and risk management.

## Setup

1. **Get Alpaca Paper Trading Keys**
   - Sign up at [alpaca.markets](https://alpaca.markets/)
   - Generate API keys from your dashboard
   - Make sure you're using **paper trading** keys

2. **Add Environment Variables**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` and add your keys:
   ```
   ALPACA_API_KEY=your_paper_key
   ALPACA_SECRET_KEY=your_paper_secret
   ALPACA_PAPER=true
   ```

3. **Run Locally**
   ```bash
   npm install
   npm run dev
   ```

4. **Deploy**
   ```bash
   npm run build
   vercel --prod
   ```

## Architecture

### API Endpoints
- `GET /api/account` — Portfolio summary + positions + risk metrics
- `GET /api/scan` — Technical scanner (RSI, volume, breakouts)
- `GET /api/positions` — Open positions
- `GET /api/market` — Market clock (is market open?)
- `POST /api/order` — Place order with risk checks

### Scanner Signals
- **Breakout** — Price above 20 SMA with 1.5x volume
- **Gap Up** — >3% move on 2x volume
- **Oversold** — RSI < 30 with bounce
- **Volume Spike** — 3x average volume with 2%+ move
- **Momentum** — RSI 55-75, price above 50 SMA

### Risk Management
- Max position: 5% of portfolio
- Max daily loss: 2%
- Max open positions: 10
- Stop loss: 5%
- No shorting (disabled by default)
- Market hours only

## Security

- API keys in environment variables only
- Paper trading enforced until explicitly disabled
- Risk checks before every order
- Git commit trail for all strategy changes
- You control the keys, not the code

## Next Steps

1. Connect your Alpaca paper keys
2. Run the scanner daily at market open
3. Review signals, paper trade for 30 days
4. Once proven, enable live trading (change `ALPACA_PAPER=false`)
5. Add sentiment scoring, Polymarket overlay
