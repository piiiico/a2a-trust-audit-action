# A2A Trust Audit — GitHub Action

Audit your A2A agent card across **L1–L4 trust dimensions** on every PR. Catches the moment your card silently regresses from B to F.

[![Marketplace](https://img.shields.io/badge/GitHub_Marketplace-A2A_Trust_Audit-2188ff?logo=github)](https://github.com/marketplace/actions/a2a-trust-audit)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Rubric](https://img.shields.io/badge/rubric-22_checks-555)](https://github.com/piiiico/a2a-trust-audit/blob/main/RUBRIC.md)
[![A2A Trust](https://agentlair.dev/badge/a2a/aHR0cHM6Ly9hZ2VudGxhaXIuZGV2Ly53ZWxsLWtub3duL2FnZW50Lmpzb24)](https://agentlair.dev/blog/a2a-trust-leaderboard-may-2026/)

## Get a badge

Embed a live trust grade in your README — no CI required:

```md
![A2A Trust](https://agentlair.dev/badge/a2a/<base64url-of-card-url>)
```

Encode your card URL:

```bash
echo -n 'https://your-agent.example.com/.well-known/agent.json' | base64 | tr -d '=' | tr '/+' '_-'
```

Paste the output into the badge URL. The badge re-audits hourly.

---

The A2A protocol has standards for identity (L1) and authorization (L3). It has nothing for **behavioral trust** (L4). This action grades your card on all four layers — including the one nobody else checks — and posts the result back to the PR that changed it.

Wraps [`@agentlair/a2a-trust-audit`](https://www.npmjs.com/package/@agentlair/a2a-trust-audit). The audit logic is vendored from `v0.1.2` so the action is self-contained — no `npm install` at runtime.

---

## Quickstart

Add to `.github/workflows/a2a-audit.yml`:

```yaml
name: A2A Trust Audit
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write   # required for the PR comment

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: piiiico/a2a-trust-audit-action@v1
        with:
          card-url: https://your-agent.example.com
          fail-below: B
```

What you get on every PR:

- A **PR comment** with the L1–L4 score breakdown, top gaps, and prioritized fixes (updated in place — no double-posts).
- A **job summary** with the same report, visible on the run page.
- **Workflow outputs** (`grade`, `score`, `l1`–`l4`) for downstream steps.
- A **failed run** if the grade drops below the threshold you set.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `card-url` | yes | — | URL or local file path to audit. For URLs, the action probes `/.well-known/agent-card.json` and `/.well-known/agent.json` automatically. |
| `fail-below` | no | `F` | Minimum acceptable grade (`A`, `B`, `C`, `D`, `F`). The job fails if the actual grade is worse. `F` = never fail (audit-only mode). |
| `comment-on-pr` | no | `true` | Post the audit summary as a PR comment when the workflow runs on `pull_request` / `pull_request_target`. Updates an existing comment in place. |
| `github-token` | no | `${{ github.token }}` | Token used for the PR comment. The default `GITHUB_TOKEN` is sufficient if the workflow has `pull-requests: write`. |

## Outputs

| Output | Type | Description |
| --- | --- | --- |
| `grade` | `A`–`F` | Overall letter grade. |
| `score` | `0`–`100` | Overall numeric score. |
| `l1` | `0`–`100` | L1 Identity score (name, DID, provider, contact). |
| `l2` | `0`–`100` | L2 Authentication score (auth schemes, JWKS, signed card, x402, mTLS). |
| `l3` | `0`–`100` | L3 Authorization score (skills, capabilities, I/O modes). |
| `l4` | `0`–`100` | L4 Behavioral Trust score (attestation, audit trail, monitoring, delegation). |

Use them in a downstream step:

```yaml
- uses: piiiico/a2a-trust-audit-action@v1
  id: audit
  with:
    card-url: https://your-agent.example.com
- name: Notify on regression
  if: steps.audit.outputs.grade != 'A'
  run: echo "Grade is ${{ steps.audit.outputs.grade }} (${{ steps.audit.outputs.score }}/100)"
```

## What gets checked

22 checks across four layers, weighted by severity. Full rubric: [piiiico/a2a-trust-audit/RUBRIC.md](https://github.com/piiiico/a2a-trust-audit/blob/main/RUBRIC.md).

| Layer | What it asks | Weight |
| --- | --- | ---: |
| **L1 Identity** | Who claims to be running this agent? Name, URL, HTTPS, version, provider, DID, contact. | 20% |
| **L2 Authentication** | How do consumers verify that claim? Auth schemes, JWKS, **signed card**, x402, mTLS, OAuth/OIDC. | 30% |
| **L3 Authorization** | What can the agent do, scoped to which skills? Capabilities, I/O modes, skill metadata. | 15% |
| **L4 Behavioral Trust** | Does it actually behave? Attestation, audit trail, behavioral monitoring, delegation chain. | 35% |

Severity weights inside each layer: `critical=25 · high=15 · medium=8 · low=3 · info=1`. Grades: `A ≥ 90 · B ≥ 80 · C ≥ 65 · D ≥ 50 · F < 50`.

## Real examples

These are real audits from the [May 2026 A2A Trust Leaderboard](https://agentlair.dev/blog/a2a-trust-leaderboard-may-2026/) — 17 of 18 audited agents scored F. Each example below is what the PR comment would look like on the day their card regressed.

### Microquery — F (45/100)

> Pay-per-query SQL access. x402-aware, full skill metadata, but no signed card, no DID, no L4.

[`examples/microquery-summary.md`](examples/microquery-summary.md)

### BidMachine Ad Exchange — F (40/100)

> Real-time bidding A2A endpoint. Identity declared, authentication declared, but the card itself is unsigned and the L4 layer is absent.

[`examples/bidmachine-summary.md`](examples/bidmachine-summary.md)

### CyMetica AI — F (40/100)

> Cybersecurity advisory agent. Same shape as the above — L1/L3 strong, L2 partial, L4 zero.

[`examples/cymetica-summary.md`](examples/cymetica-summary.md)

If you only show me your agent card, **I cannot tell you whether the agent will behave**. That is the gap this action makes visible on every PR.

## Dogfooding

This repo runs the action against AgentLair's own agent card on every push. See [`.github/workflows/self-audit.yml`](.github/workflows/self-audit.yml). Threshold is `fail-below: B` — anything below A is real regression for us.

## How it works

1. Fetches the agent card from the supplied URL (probing the two well-known paths in the A2A spec) or reads it from disk.
2. Probes the card's `url` for `401` / `402` to detect x402 payment-gating beyond what the card declares.
3. Runs 22 checks across L1–L4, weighted by severity.
4. Computes per-layer scores, an overall score, and a letter grade.
5. Renders a markdown summary with top gaps and prioritized recommendations.
6. Writes it to the job summary tab, posts/updates a PR comment, sets outputs, and exits non-zero if below threshold.

The audit is read-only — it only fetches the card and probes the declared endpoint. It does not call any skills.

## License & Acknowledgments

MIT — see [LICENSE](LICENSE).

Audit logic vendored from [`@agentlair/a2a-trust-audit`](https://github.com/piiiico/a2a-trust-audit) (also MIT). The rubric is maintained alongside the npm package; this action's version tracks the package version it vendored.

---

Built by [piiiico](https://github.com/piiiico) for [AgentLair](https://agentlair.dev) — agent identity infrastructure with L4 behavioral trust built in. AgentLair's own card grades A (92/100); the L4 score is real.
