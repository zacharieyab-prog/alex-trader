# Trader Skill adapter (demo-only)

Source inspiration: https://github.com/Jakeschincariol/trader-skill (MIT).
This is a Node.js compatibility adapter, **not** an installation of the original 11 Claude skills or their Python utilities.

## Implemented
- `GET /api/trader-skills`: capability registry and honest implementation statuses.
- `POST /api/trader-skills/risk-check`: validates a hypothetical paper trade against a 25% notional cap and a configurable stop-loss risk limit (default 1%, maximum 5%).
- Results are advisory, and a PASS is **not** permission to execute.
- No brokerage API, real orders, auto-trading, leverage or shorting.
- All other research skills are registered as planned/not connected, not misrepresented as live.

Example:
```sh
curl -X POST http://localhost:3000/api/trader-skills/risk-check -H 'Content-Type: application/json' -d '{"symbol":"BTC/USDT","side":"BUY","paper_budget":1000,"entry_price":100,"quantity":1,"stop_loss":95,"max_risk_pct":1}'
```

Future integration should port individual upstream tools after review and tests, with source attribution and data-provider limitations. Never enable execution.
