// Deadline scan: finds licenses & insurance policies that are overdue or expiring
// soon and enqueues an alert job for each. Runs from both the cron trigger and the
// POST /api/scan endpoint (so the demo can trigger it without waiting for cron).

import type { AlertJob, Env } from './types';
import { daysBetween, WARN_CRITICAL_DAYS, WARN_DAYS } from './compliance';

interface ExpiringRow {
  id: string;
  business_id: string;
  expires_on: string | null;
  label: string;
  kind: 'license' | 'insurance';
}

export async function scanDeadlines(env: Env, now: Date = new Date()): Promise<AlertJob[]> {
  const jobs: AlertJob[] = [];

  const licenses = await env.DB.prepare(
    `SELECT l.id, l.business_id, l.expires_on,
            (j.name || ' ' || l.trade || ' license') AS label, 'license' AS kind
     FROM licenses l JOIN jurisdictions j ON j.id = l.jurisdiction_id
     WHERE l.expires_on IS NOT NULL`,
  ).all<ExpiringRow>();

  const insurance = await env.DB.prepare(
    `SELECT id, business_id, expires_on,
            (REPLACE(coverage_type,'_',' ') || ' policy') AS label, 'insurance' AS kind
     FROM insurance_policies WHERE expires_on IS NOT NULL`,
  ).all<ExpiringRow>();

  for (const row of [...(licenses.results ?? []), ...(insurance.results ?? [])]) {
    const job = toJob(row, now);
    if (job) jobs.push(job);
  }

  // Fan out to the queue. (Locally, wrangler simulates the queue.)
  for (const job of jobs) {
    await env.ALERT_QUEUE.send(job);
  }
  return jobs;
}

function toJob(row: ExpiringRow, now: Date): AlertJob | null {
  if (!row.expires_on) return null;
  const days = daysBetween(now, row.expires_on);
  let severity: AlertJob['severity'] | null = null;
  if (days < 0) severity = 'overdue';
  else if (days <= WARN_CRITICAL_DAYS) severity = 'critical';
  else if (days <= WARN_DAYS) severity = 'warning';
  if (!severity) return null;

  const phrase =
    severity === 'overdue'
      ? `EXPIRED ${Math.abs(days)} day(s) ago`
      : `expires in ${days} day(s)`;
  return {
    businessId: row.business_id,
    entityType: row.kind,
    entityId: row.id,
    dueOn: row.expires_on,
    severity,
    message: `${row.label} ${phrase} (${row.expires_on}).`,
  };
}
