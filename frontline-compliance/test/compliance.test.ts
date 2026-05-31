import { describe, expect, it } from 'vitest';
import { daysBetween, evaluateCompliance } from '../src/compliance';
import type { InsurancePolicy, Jurisdiction, License, Reciprocity, Requirement } from '../src/types';

const NOW = new Date('2026-06-01T00:00:00Z');

function isoIn(days: number): string {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

const denver: Jurisdiction = {
  id: 'denver', name: 'Denver', state: 'CO', license_authority: 'Denver CPD',
  has_local_license: 1, renewal_period_months: 24, grace_period_days: 0,
  source_url: 'https://example.com', verified_on: '2026-05-01', notes: null,
};
const aurora: Jurisdiction = { ...denver, id: 'aurora', name: 'Aurora' };
const wheatridge: Jurisdiction = { ...denver, id: 'wheatridge', name: 'Wheat Ridge' };

const elecReq: Requirement = {
  id: 'r1', jurisdiction_id: 'denver', trade: 'electrical', required_classes: ['Master'],
  min_per_occurrence: 1_000_000, min_aggregate: 2_000_000,
  workers_comp_required: 1, additional_insured_required: 1, notes: null,
};
const genReq: Requirement = { ...elecReq, id: 'r2', trade: 'general', required_classes: ['A', 'B'] };

function license(over: Partial<License> = {}): License {
  return {
    id: 'lic1', business_id: 'b1', person_id: 'p1', jurisdiction_id: 'denver',
    trade: 'electrical', classification: 'Master', license_number: 'X',
    issued_on: isoIn(-300), expires_on: isoIn(300), status: 'active',
    r2_key: null, uploaded_at: null, ...over,
  };
}
function gl(over: Partial<InsurancePolicy> = {}): InsurancePolicy {
  return {
    id: 'gl1', business_id: 'b1', coverage_type: 'general_liability', carrier: 'ACME',
    policy_number: 'G1', per_occurrence_limit: 1_000_000, aggregate_limit: 2_000_000,
    additional_insured: 1, waiver_of_subrogation: 0, expires_on: isoIn(200),
    r2_key: null, uploaded_at: null, ...over,
  };
}
function wc(over: Partial<InsurancePolicy> = {}): InsurancePolicy {
  return { ...gl({ id: 'wc1', coverage_type: 'workers_comp', expires_on: isoIn(200) }), ...over };
}

const base = { jurisdiction: denver, requirement: elecReq, reciprocity: [] as Reciprocity[], now: NOW };

describe('daysBetween', () => {
  it('counts forward and backward', () => {
    expect(daysBetween(NOW, isoIn(12))).toBe(12);
    expect(daysBetween(NOW, isoIn(-5))).toBe(-5);
  });
});

describe('evaluateCompliance — eligible path', () => {
  it('is eligible with valid license + insurance', () => {
    const r = evaluateCompliance({ ...base, licenses: [license()], policies: [gl(), wc()] });
    expect(r.eligibleToBid).toBe(true);
    expect(r.status).toBe('eligible');
    expect(r.blockers).toHaveLength(0);
  });
});

describe('evaluateCompliance — license blockers', () => {
  it('blocks when no license for the jurisdiction (Summit/Aurora story)', () => {
    const r = evaluateCompliance({ ...base, jurisdiction: aurora, requirement: { ...elecReq, jurisdiction_id: 'aurora' }, licenses: [license()], policies: [gl(), wc()] });
    expect(r.eligibleToBid).toBe(false);
    expect(r.status).toBe('blocked');
    expect(r.blockers.map((b) => b.code)).toContain('NO_LICENSE');
  });

  it('blocks on expired license, respecting grace period (Bluebird story)', () => {
    const expired = license({ expires_on: isoIn(-11) });
    const r = evaluateCompliance({ ...base, licenses: [expired], policies: [gl(), wc()] });
    expect(r.blockers.map((b) => b.code)).toContain('LICENSE_EXPIRED');

    // With a 30-day grace window, an 11-day-lapsed license is still valid.
    const withGrace = evaluateCompliance({ ...base, jurisdiction: { ...denver, grace_period_days: 30 }, licenses: [expired], policies: [gl(), wc()] });
    expect(withGrace.eligibleToBid).toBe(true);
  });

  it('blocks on wrong class with an actionable detail', () => {
    const r = evaluateCompliance({ ...base, licenses: [license({ classification: 'Journeyman' })], policies: [gl(), wc()] });
    const b = r.blockers.find((x) => x.code === 'WRONG_CLASS');
    expect(b).toBeDefined();
    expect(b!.detail).toContain('Master');
  });
});

describe('evaluateCompliance — insurance blockers', () => {
  it('flags insufficient per-occurrence and aggregate with exact gap', () => {
    const r = evaluateCompliance({ ...base, licenses: [license()], policies: [gl({ per_occurrence_limit: 500_000, aggregate_limit: 1_000_000 }), wc()] });
    const codes = r.blockers.map((b) => b.code);
    expect(codes).toContain('INSUFFICIENT_GL_PER_OCCURRENCE');
    expect(codes).toContain('INSUFFICIENT_GL_AGGREGATE');
    expect(r.blockers.find((b) => b.code === 'INSUFFICIENT_GL_PER_OCCURRENCE')!.detail).toContain('$500,000');
  });

  it('requires additional-insured endorsement when mandated', () => {
    const r = evaluateCompliance({ ...base, licenses: [license()], policies: [gl({ additional_insured: 0 }), wc()] });
    expect(r.blockers.map((b) => b.code)).toContain('NO_ADDITIONAL_INSURED');
  });

  it('requires workers comp when mandated', () => {
    const r = evaluateCompliance({ ...base, licenses: [license()], policies: [gl()] });
    expect(r.blockers.map((b) => b.code)).toContain('NO_WORKERS_COMP');
  });

  it('blocks when general liability is missing entirely', () => {
    const r = evaluateCompliance({ ...base, licenses: [license()], policies: [wc()] });
    expect(r.blockers.map((b) => b.code)).toContain('NO_GENERAL_LIABILITY');
  });
});

describe('evaluateCompliance — expiring soon (Front Range Mechanical story)', () => {
  it('is eligible but flagged when a COI lapses within the critical window', () => {
    const r = evaluateCompliance({ ...base, licenses: [license()], policies: [gl({ expires_on: isoIn(12) }), wc()] });
    expect(r.eligibleToBid).toBe(true);
    expect(r.status).toBe('expiring');
    expect(r.upcoming.some((u) => u.daysUntil === 12 && u.severity === 'critical')).toBe(true);
  });
});

describe('evaluateCompliance — reciprocity (Cornerstone story)', () => {
  it('is eligible in Wheat Ridge via an accepted Denver general license', () => {
    const denverGc = license({ jurisdiction_id: 'denver', trade: 'general', classification: 'B' });
    const recip: Reciprocity[] = [{ id: 'rec1', jurisdiction_id: 'wheatridge', accepts_from: 'denver', accepts_classes: ['A', 'B'], notes: null }];
    const r = evaluateCompliance({
      jurisdiction: wheatridge,
      requirement: { ...genReq, jurisdiction_id: 'wheatridge' },
      licenses: [denverGc], policies: [gl(), wc()], reciprocity: recip, now: NOW,
    });
    expect(r.eligibleToBid).toBe(true);
    expect(r.status).toBe('eligible_via_reciprocity');
    expect(r.via).toContain('reciprocity');
  });

  it('does not apply reciprocity when the held class is not accepted', () => {
    const denverGc = license({ jurisdiction_id: 'denver', trade: 'general', classification: 'C' });
    const recip: Reciprocity[] = [{ id: 'rec1', jurisdiction_id: 'wheatridge', accepts_from: 'denver', accepts_classes: ['A', 'B'], notes: null }];
    const r = evaluateCompliance({
      jurisdiction: wheatridge,
      requirement: { ...genReq, jurisdiction_id: 'wheatridge' },
      licenses: [denverGc], policies: [gl(), wc()], reciprocity: recip, now: NOW,
    });
    expect(r.eligibleToBid).toBe(false);
    expect(r.blockers.map((b) => b.code)).toContain('NO_LICENSE');
  });
});
