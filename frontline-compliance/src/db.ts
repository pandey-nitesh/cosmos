// Thin D1 data-access helpers. Keeps SQL out of the route/engine code.

import type {
  Business,
  InsurancePolicy,
  Jurisdiction,
  License,
  Reciprocity,
  Requirement,
} from './types';

export async function getBusiness(db: D1Database, id: string): Promise<Business | null> {
  return db.prepare('SELECT * FROM businesses WHERE id = ?').bind(id).first<Business>();
}

export async function listBusinesses(db: D1Database): Promise<Business[]> {
  const { results } = await db.prepare('SELECT * FROM businesses ORDER BY name').all<Business>();
  return results ?? [];
}

export async function getJurisdiction(db: D1Database, id: string): Promise<Jurisdiction | null> {
  return db.prepare('SELECT * FROM jurisdictions WHERE id = ?').bind(id).first<Jurisdiction>();
}

export async function listJurisdictions(db: D1Database): Promise<Jurisdiction[]> {
  const { results } = await db.prepare('SELECT * FROM jurisdictions ORDER BY name').all<Jurisdiction>();
  return results ?? [];
}

interface RequirementRow extends Omit<Requirement, 'required_classes'> {
  required_classes: string;
}

export async function listRequirementsForTrade(db: D1Database, trade: string): Promise<Requirement[]> {
  const { results } = await db
    .prepare('SELECT * FROM jurisdiction_requirements WHERE trade = ?')
    .bind(trade)
    .all<RequirementRow>();
  return (results ?? []).map(parseRequirement);
}

function parseRequirement(r: RequirementRow): Requirement {
  return { ...r, required_classes: safeJsonArray(r.required_classes) };
}

interface ReciprocityRow extends Omit<Reciprocity, 'accepts_classes'> {
  accepts_classes: string;
}

export async function listReciprocityFor(db: D1Database, jurisdictionId: string): Promise<Reciprocity[]> {
  const { results } = await db
    .prepare('SELECT * FROM jurisdiction_reciprocity WHERE jurisdiction_id = ?')
    .bind(jurisdictionId)
    .all<ReciprocityRow>();
  return (results ?? []).map((r) => ({ ...r, accepts_classes: safeJsonArray(r.accepts_classes) }));
}

export async function listLicenses(db: D1Database, businessId: string): Promise<License[]> {
  const { results } = await db
    .prepare('SELECT * FROM licenses WHERE business_id = ?')
    .bind(businessId)
    .all<License>();
  return results ?? [];
}

export async function listInsurance(db: D1Database, businessId: string): Promise<InsurancePolicy[]> {
  const { results } = await db
    .prepare('SELECT * FROM insurance_policies WHERE business_id = ?')
    .bind(businessId)
    .all<InsurancePolicy>();
  return results ?? [];
}

function safeJsonArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
