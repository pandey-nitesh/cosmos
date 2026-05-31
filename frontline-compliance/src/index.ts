import { Hono } from 'hono';
import type { AlertJob, Business, Env, JurisdictionEligibility } from './types';
import { evaluateCompliance } from './compliance';
import { ConsoleNotifier } from './notifier';
import { scanDeadlines } from './scan';
import {
  getBusiness,
  getJurisdiction,
  listBusinesses,
  listInsurance,
  listJurisdictions,
  listLicenses,
  listReciprocityFor,
  listRequirementsForTrade,
} from './db';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true, service: 'frontline', time: new Date().toISOString() }));

app.get('/api/jurisdictions', async (c) => {
  // KV-cached read: jurisdiction rules change rarely, so serve from the edge cache.
  const cached = await c.env.RULES_CACHE.get('jurisdictions:all', 'json');
  if (cached) return c.json(cached);
  const rows = await listJurisdictions(c.env.DB);
  await c.env.RULES_CACHE.put('jurisdictions:all', JSON.stringify(rows), { expirationTtl: 300 });
  return c.json(rows);
});

app.get('/api/businesses', async (c) => c.json(await listBusinesses(c.env.DB)));

app.post('/api/businesses', async (c) => {
  const b = await c.req.json<Partial<Business>>();
  if (!b.name || !b.trade) return c.json({ error: 'name and trade are required' }, 400);
  const id = b.id ?? 'biz-' + crypto.randomUUID().slice(0, 8);
  await c.env.DB.prepare(
    'INSERT INTO businesses (id, name, trade, primary_email, primary_phone, home_city) VALUES (?,?,?,?,?,?)',
  )
    .bind(id, b.name, b.trade, b.primary_email ?? null, b.primary_phone ?? null, b.home_city ?? null)
    .run();
  return c.json({ id }, 201);
});

// THE core endpoint: the city-by-city eligibility grid for one business.
app.get('/api/businesses/:id/compliance', async (c) => {
  const business = await getBusiness(c.env.DB, c.req.param('id'));
  if (!business) return c.json({ error: 'business not found' }, 404);

  const now = new Date();
  const [requirements, licenses, policies] = await Promise.all([
    listRequirementsForTrade(c.env.DB, business.trade),
    listLicenses(c.env.DB, business.id),
    listInsurance(c.env.DB, business.id),
  ]);

  const grid: JurisdictionEligibility[] = [];
  for (const requirement of requirements) {
    const jurisdiction = await getJurisdiction(c.env.DB, requirement.jurisdiction_id);
    if (!jurisdiction) continue;
    const reciprocity = await listReciprocityFor(c.env.DB, jurisdiction.id);
    grid.push(evaluateCompliance({ jurisdiction, requirement, licenses, policies, reciprocity, now }));
  }
  grid.sort((a, b) => a.jurisdictionName.localeCompare(b.jurisdictionName));

  const summary = {
    eligible: grid.filter((g) => g.eligibleToBid).length,
    blocked: grid.filter((g) => g.status === 'blocked').length,
    expiringSoon: grid.filter((g) => g.status === 'expiring').length,
    total: grid.length,
  };
  // Flattened, de-duplicated "what lapses next" rollup across the whole business.
  const upcomingMap = new Map<string, JurisdictionEligibility['upcoming'][number]>();
  for (const g of grid) for (const u of g.upcoming) upcomingMap.set(u.entityId, u);
  const upcoming = [...upcomingMap.values()].sort((a, b) => a.daysUntil - b.daysUntil);

  return c.json({ business, summary, grid, upcoming });
});

// R2 document upload (license/COI PDFs) + linkage onto the record.
app.put('/api/documents/:entityType/:entityId', async (c) => {
  const entityType = c.req.param('entityType');
  const entityId = c.req.param('entityId');
  const table = entityType === 'license' ? 'licenses' : entityType === 'insurance' ? 'insurance_policies' : null;
  if (!table) return c.json({ error: 'entityType must be license|insurance' }, 400);
  if (!c.req.raw.body) return c.json({ error: 'request body (file) required' }, 400);

  const key = `${entityType}/${entityId}/${Date.now()}`;
  await c.env.DOCS.put(key, c.req.raw.body, {
    httpMetadata: { contentType: c.req.header('content-type') ?? 'application/octet-stream' },
  });
  await c.env.DB.prepare(`UPDATE ${table} SET r2_key = ?, uploaded_at = datetime('now') WHERE id = ?`)
    .bind(key, entityId)
    .run();
  return c.json({ r2_key: key });
});

app.get('/api/documents/*', async (c) => {
  const key = c.req.path.replace('/api/documents/', '');
  const obj = await c.env.DOCS.get(key);
  if (!obj) return c.json({ error: 'not found' }, 404);
  return new Response(obj.body, {
    headers: { 'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream' },
  });
});

// Manually trigger the deadline scan (same code path as cron) — for the demo.
app.post('/api/scan', async (c) => {
  const jobs = await scanDeadlines(c.env);
  return c.json({ enqueued: jobs.length, jobs });
});

// Everything else → static dashboard.
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,

  // Cron trigger → daily deadline scan.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(scanDeadlines(env).then((jobs) => console.log(`[cron] enqueued ${jobs.length} alert(s)`)));
  },

  // Queue consumer → persist alert + deliver via the (pluggable) notifier.
  async queue(batch: MessageBatch<AlertJob>, env: Env): Promise<void> {
    const notifier = new ConsoleNotifier();
    for (const msg of batch.messages) {
      const job = msg.body;

      // Idempotency: don't re-alert the same credential at the same severity within
      // a day (the cron runs daily, so warnings would otherwise spam for weeks).
      const dup = await env.DB.prepare(
        `SELECT 1 FROM alerts
         WHERE entity_id = ? AND severity = ? AND created_at > datetime('now','-20 hours') LIMIT 1`,
      )
        .bind(job.entityId, job.severity)
        .first();
      if (dup) {
        msg.ack();
        continue;
      }

      const business = await getBusiness(env.DB, job.businessId);
      await env.DB.prepare(
        `INSERT INTO alerts (id, business_id, entity_type, entity_id, due_on, severity, channel, message, sent_at)
         VALUES (?,?,?,?,?,?,?,?, datetime('now'))`,
      )
        .bind(
          crypto.randomUUID(),
          job.businessId,
          job.entityType,
          job.entityId,
          job.dueOn,
          job.severity,
          'email',
          job.message,
        )
        .run();
      await notifier.send(job, business?.primary_email ?? null);
      msg.ack();
    }
  },
};
