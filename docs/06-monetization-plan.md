# 06 — Monetization Plan (Draft, proposals only)

Model: freemium with monthly/yearly subscriptions. Prices below are **test proposals from the roadmap**, not commitments.

## Tiers
| Tier | Proposed test price (INR/month) | Intent |
|---|---|---|
| Free | 0 | Try the full MVP flow with tight limits |
| Pro | 199–299 | Regular creators |
| Creator | 499–699 | Heavy users, longer videos, higher resolution |

Yearly plans: price after monthly tests. Verify Google Play pricing rules, taxes, and India programme requirements before setting prices.

## Credits (proposal, decision D6)
- Unit idea: 1 credit = 1 minute of source video analysed. Rendering exports may cost 0 credits at first, or a small number per export. Decide after the cost benchmarks in 05.
- Free: small monthly grant (enough for one or two short projects), max source duration shorter than paid tiers, 720p exports, possible watermark (decision).
- Pro/Creator: larger monthly grant, longer sources, 1080p, no watermark.
- Credits expire at period end (no rollover) unless decided otherwise. Top-up packs are a later option.

## Rules (non-negotiable)
1. **Server decides.** Entitlements and credit balances live in the database and are changed only by the trusted backend. The app's tier flag is display-only.
2. **Ledger.** `credit_transactions` is append-only; each spend/refund has an idempotency key; `balance_after` never below zero.
3. **Reserve then settle.** On job creation, reserve credits; on failure or cancel, refund via ledger entry; on success, settle.
4. **Purchase verification.** Verify Google Play purchase tokens with Google's server API from the backend before granting a tier. Handle renewals, grace, hold, cancel, refund, restore. Store a hash of the token, not the raw value.
5. **No billing code before Phase 11** and not without tested verification.
6. **Honest UX.** Show credit cost before starting a job; no promises of virality or guaranteed engagement.

## Verify before Phase 11 (unverified today)
- Current Google Play Billing library version and requirements.
- India-specific billing/payment programme requirements, fees, and tax handling.
- Subscription lifecycle and notification (real-time developer notifications) handling.
- Refund and chargeback handling policy.

## Metrics to track (aggregate, with notice)
Free-to-paid conversion, credits used per user, cost per project vs credit price, churn, refund rate, export completion rate.
