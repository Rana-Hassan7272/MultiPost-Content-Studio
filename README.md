# MultiPost-Content-Studio

## Subscription / payments (Stripe)

Plans: **Free** (10 posts/mo, 1 account, 500MB, 20 AI), **Starter** ($10/mo), **Pro** ($24/mo).

### Payment mode (Edge Functions)

Set in Supabase Edge Function secrets (or `.env` for local):

- **`PAYMENT_MODE=fake`** — No Stripe. Clicking Subscribe activates the plan for testing (no card).
- **`PAYMENT_MODE=stripe_test`** — Use Stripe test keys and test cards (e.g. `4242 4242 4242 4242`).
- **`PAYMENT_MODE=stripe_live`** — Live Stripe (set `STRIPE_SECRET_KEY` and optional `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`).

For **fake** mode, deploy and set:
```bash
supabase secrets set PAYMENT_MODE=fake
```
Then deploy `stripe-checkout` (and optionally `subscription-activate`). Subscribe from the Pricing page while logged in to activate Starter or Pro.
