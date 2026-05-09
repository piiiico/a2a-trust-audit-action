/**
 * A2A Trust Audit — GitHub Action entry point.
 *
 * Reads `card-url`, runs the vendored audit, emits:
 *   - core.summary (Job Summary tab)
 *   - PR comment (idempotent — edits existing bot comment in place)
 *   - core.setOutput for downstream consumers
 *   - core.setFailed if grade is below the `fail-below` threshold
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { auditOne, type AuditResult, type Check } from './audit-lib';

const COMMENT_MARKER = '<!-- a2a-trust-audit-action -->';

// Lower index = better. F=4, A=0.
const GRADES = ['A', 'B', 'C', 'D', 'F'] as const;
type Grade = (typeof GRADES)[number];

function isGrade(s: string): s is Grade {
  return (GRADES as readonly string[]).includes(s);
}

function gradeRank(g: string): number {
  const i = (GRADES as readonly string[]).indexOf(g);
  return i === -1 ? 99 : i;
}

function bar(val: number): string {
  const w = 20;
  const filled = Math.max(0, Math.min(w, Math.round((val / 100) * w)));
  return '█'.repeat(filled) + '░'.repeat(w - filled);
}

function gradeEmoji(g: string): string {
  switch (g) {
    case 'A': return '🟢';
    case 'B': return '🟢';
    case 'C': return '🟡';
    case 'D': return '🟠';
    case 'F': return '🔴';
    default: return '⚪️';
  }
}

function severityWeight(sev: Check['severity']): number {
  return { critical: 25, high: 15, medium: 8, low: 3, info: 1 }[sev];
}

function topFailures(checks: Check[], n: number): Check[] {
  return checks
    .filter(c => !c.pass)
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
    .slice(0, n);
}

function renderSummary(result: AuditResult, threshold: Grade): string {
  const { scores: s, grade: g, recommendations: recs, card, fetched_from, probe } = result;
  const passes = gradeRank(g) <= gradeRank(threshold);

  const lines: string[] = [];
  lines.push(COMMENT_MARKER);
  lines.push('');
  lines.push(`## A2A Trust Audit — ${gradeEmoji(g)} **Grade ${g}** (${s.overall}/100)`);
  lines.push('');

  if (card?.name) {
    lines.push(`**Agent:** \`${card.name}\`${card.version ? ` v${card.version}` : ''} · **Fetched:** \`${fetched_from}\``);
  } else {
    lines.push(`**Fetched:** \`${fetched_from}\``);
  }
  if (probe?.flavor && probe.flavor !== 'unknown') {
    lines.push(`**Endpoint probe:** \`${probe.status} ${probe.flavor}\``);
  }
  lines.push('');

  lines.push('### Layer scores');
  lines.push('');
  lines.push('| Layer | Score | |');
  lines.push('| --- | ---: | --- |');
  lines.push(`| L1 Identity | ${s.L1_identity}% | \`${bar(s.L1_identity)}\` |`);
  lines.push(`| L2 Authentication | ${s.L2_authentication}% | \`${bar(s.L2_authentication)}\` |`);
  lines.push(`| L3 Authorization | ${s.L3_authorization}% | \`${bar(s.L3_authorization)}\` |`);
  lines.push(`| L4 Behavioral Trust | ${s.L4_behavioral}% | \`${bar(s.L4_behavioral)}\` |`);
  lines.push(`| **Overall** | **${s.overall}%** | \`${bar(s.overall)}\` |`);
  lines.push('');

  const fails = topFailures(result.checks, 5);
  if (fails.length > 0) {
    lines.push('### Top gaps');
    lines.push('');
    for (const f of fails) {
      lines.push(`- **${f.layer} · ${f.name}** \`[${f.severity}]\` — ${f.detail}`);
    }
    lines.push('');
  }

  if (recs.length > 0) {
    lines.push('### Recommendations');
    lines.push('');
    for (let i = 0; i < Math.min(recs.length, 3); i++) {
      lines.push(`${i + 1}. ${recs[i]}`);
    }
    lines.push('');
  }

  if (s.L4_behavioral === 0) {
    lines.push('> **L4 = 0.** Identity (L1–L2) tells you _who_. Authorization (L3) tells you _what_. Neither tells you _how_ this agent behaves in production. The A2A protocol has no standard for this — it is the gap.');
    lines.push('');
  }

  if (passes) {
    lines.push(`✅ **Passes** \`fail-below=${threshold}\`.`);
  } else {
    lines.push(`❌ **Fails** \`fail-below=${threshold}\` — current grade is ${g}.`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Audited by [`a2a-trust-audit-action`](https://github.com/piiiico/a2a-trust-audit-action) · [Rubric](https://github.com/piiiico/a2a-trust-audit/blob/main/RUBRIC.md) · [Leaderboard](https://agentlair.dev/blog/a2a-trust-leaderboard-may-2026/)');

  return lines.join('\n');
}

async function postOrUpdatePrComment(token: string, body: string): Promise<void> {
  const ctx = github.context;
  if (ctx.eventName !== 'pull_request' && ctx.eventName !== 'pull_request_target') {
    core.info(`Skipping PR comment — event is "${ctx.eventName}".`);
    return;
  }

  const pr = ctx.payload.pull_request;
  if (!pr) {
    core.info('Skipping PR comment — no pull_request payload available.');
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = ctx.repo;
  const issue_number = pr.number;

  // Find an existing comment with our marker (idempotent updates).
  const existing = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number,
    per_page: 100,
  });

  const ours = existing.find((c: { body?: string }) =>
    typeof c.body === 'string' && c.body.includes(COMMENT_MARKER)
  );

  if (ours) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: ours.id, body });
    core.info(`Updated existing PR comment #${ours.id}.`);
  } else {
    await octokit.rest.issues.createComment({ owner, repo, issue_number, body });
    core.info(`Created new PR comment on #${issue_number}.`);
  }
}

async function run(): Promise<void> {
  try {
    const cardUrl = core.getInput('card-url', { required: true }).trim();
    const failBelowRaw = (core.getInput('fail-below') || 'F').trim().toUpperCase();
    const commentOnPr = (core.getInput('comment-on-pr') || 'true').toLowerCase() === 'true';
    const token = core.getInput('github-token');

    if (!isGrade(failBelowRaw)) {
      core.setFailed(`Invalid fail-below value: "${failBelowRaw}". Expected one of A, B, C, D, F.`);
      return;
    }
    const threshold: Grade = failBelowRaw;

    core.info(`Auditing ${cardUrl} (fail-below=${threshold})…`);

    const result = await auditOne(cardUrl);

    // Outputs.
    core.setOutput('grade', result.grade);
    core.setOutput('score', String(result.scores.overall));
    core.setOutput('l1', String(result.scores.L1_identity));
    core.setOutput('l2', String(result.scores.L2_authentication));
    core.setOutput('l3', String(result.scores.L3_authorization));
    core.setOutput('l4', String(result.scores.L4_behavioral));

    // Job summary tab.
    const summary = renderSummary(result, threshold);
    await core.summary.addRaw(summary).write();

    // Annotation in the workflow log.
    core.info(`Grade: ${result.grade} (${result.scores.overall}/100) — L1=${result.scores.L1_identity} L2=${result.scores.L2_authentication} L3=${result.scores.L3_authorization} L4=${result.scores.L4_behavioral}`);

    // PR comment.
    if (commentOnPr) {
      try {
        if (!token) {
          core.warning('comment-on-pr is enabled but no github-token was provided. Skipping PR comment.');
        } else {
          await postOrUpdatePrComment(token, summary);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Don't fail the action over comment failure — likely a permissions issue.
        core.warning(`Failed to post PR comment: ${msg}`);
      }
    }

    // Threshold check.
    if (gradeRank(result.grade) > gradeRank(threshold)) {
      core.setFailed(
        `A2A trust audit grade ${result.grade} is below the required minimum ${threshold}. ` +
        `See the job summary for the full report.`
      );
    } else {
      core.info(`Audit passed: grade ${result.grade} meets fail-below=${threshold}.`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    core.setFailed(`a2a-trust-audit-action failed: ${msg}`);
  }
}

run();
