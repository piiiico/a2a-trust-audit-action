<!-- a2a-trust-audit-action -->

## A2A Trust Audit — 🔴 **Grade F** (40/100)

**Agent:** `CyMetica AI` v1.0.0 · **Fetched:** `/tmp/cymetica-card.json`

### Layer scores

| Layer | Score | |
| --- | ---: | --- |
| L1 Identity | 85% | `█████████████████░░░` |
| L2 Authentication | 27% | `█████░░░░░░░░░░░░░░░` |
| L3 Authorization | 100% | `████████████████████` |
| L4 Behavioral Trust | 0% | `░░░░░░░░░░░░░░░░░░░░` |
| **Overall** | **40%** | `████████░░░░░░░░░░░░` |

### Top gaps

- **L2 · Agent card is signed** `[critical]` — UNSIGNED CARD — anyone who controls the endpoint can swap capabilities, skills, or identity claims. This is the #1 gap in A2A.
- **L4 · Trust attestation present** `[critical]` — NO TRUST ATTESTATION — no behavioral evidence. This agent has identity but no track record. The A2A spec has no standard for this.
- **L1 · DID (Decentralized Identifier)** `[high]` — No DID — identity tied to DNS only. No portable, self-sovereign identity.
- **L2 · JWKS endpoint referenced** `[high]` — No JWKS reference — consumers cannot verify signed tokens offline.
- **L2 · x402 payment-gated (skin in the game)** `[high]` — No x402 / payment-gating detected. Free endpoints have no caller-side commitment cost.

### Recommendations

1. Sign your agent card with JWS (Ed25519 or ECDSA). This is the single highest-impact fix — it prevents card tampering and proves endpoint control.
2. Add a trust_attestation field with behavioral score. Services like AgentLair (agentlair.dev) provide cross-org behavioral trust that embeds directly in agent cards and AATs.
3. Add a DID (did:web or did:key) for portable, self-sovereign identity that survives DNS changes.

> **L4 = 0.** Identity (L1–L2) tells you _who_. Authorization (L3) tells you _what_. Neither tells you _how_ this agent behaves in production. The A2A protocol has no standard for this — it is the gap.

✅ **Passes** `fail-below=F`.

---

Audited by [`a2a-trust-audit-action`](https://github.com/piiiico/a2a-trust-audit-action) · [Rubric](https://github.com/piiiico/a2a-trust-audit/blob/main/RUBRIC.md) · [Leaderboard](https://agentlair.dev/blog/a2a-trust-leaderboard-may-2026/)