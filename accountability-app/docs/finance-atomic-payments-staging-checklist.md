# Atomic finance payments — staging verification

Apply migrations 0089 and 0090 to staging only, then verify with two test users.

- `0.004` is rejected because it rounds to `0.00`.
- `0.005` is accepted as `0.01` using PostgreSQL numeric rounding.
- A card payment whose rounded value exceeds the locked current balance is rejected.
- Replaying the same idempotency key returns the original result without a second row or deduction.
- Reusing a key for another bill/card is rejected.
- One user cannot pay or inspect another user's bill/card through either RPC.
- A forced failure leaves both sides unchanged: bill flag + expense, or payment row + card balance.
- Concurrent same-card payments serialize on the row lock and cannot overpay.
