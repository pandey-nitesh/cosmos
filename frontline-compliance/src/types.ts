// Domain types for Frontline.

export interface Env {
  DB: D1Database;
  RULES_CACHE: KVNamespace;
  DOCS: R2Bucket;
  ALERT_QUEUE: Queue<AlertJob>;
  ASSETS: Fetcher;
}

export interface Jurisdiction {
  id: string;
  name: string;
  state: string;
  license_authority: string | null;
  has_local_license: number;
  renewal_period_months: number | null;
  grace_period_days: number;
  source_url: string | null;
  verified_on: string | null;
  notes: string | null;
}

export interface Requirement {
  id: string;
  jurisdiction_id: string;
  trade: string;
  required_classes: string[]; // parsed from JSON
  min_per_occurrence: number;
  min_aggregate: number;
  workers_comp_required: number;
  additional_insured_required: number;
  notes: string | null;
}

export interface Reciprocity {
  id: string;
  jurisdiction_id: string; // accepting city
  accepts_from: string; // issuing city
  accepts_classes: string[];
  notes: string | null;
}

export interface Business {
  id: string;
  name: string;
  trade: string;
  primary_email: string | null;
  primary_phone: string | null;
  home_city: string | null;
}

export interface License {
  id: string;
  business_id: string;
  person_id: string | null;
  jurisdiction_id: string;
  trade: string;
  classification: string | null;
  license_number: string | null;
  issued_on: string | null;
  expires_on: string | null;
  status: string;
  r2_key: string | null;
  uploaded_at: string | null;
}

export interface InsurancePolicy {
  id: string;
  business_id: string;
  coverage_type: 'general_liability' | 'workers_comp';
  carrier: string | null;
  policy_number: string | null;
  per_occurrence_limit: number;
  aggregate_limit: number;
  additional_insured: number;
  waiver_of_subrogation: number;
  expires_on: string | null;
  r2_key: string | null;
  uploaded_at: string | null;
}

// ---- Compliance engine output (the actionable answer, not just a boolean) ----

export type EligibilityStatus = 'eligible' | 'eligible_via_reciprocity' | 'expiring' | 'blocked';

export interface Blocker {
  code:
    | 'NO_LICENSE'
    | 'LICENSE_EXPIRED'
    | 'LICENSE_INACTIVE'
    | 'WRONG_CLASS'
    | 'INSUFFICIENT_GL_PER_OCCURRENCE'
    | 'INSUFFICIENT_GL_AGGREGATE'
    | 'GL_EXPIRED'
    | 'NO_GENERAL_LIABILITY'
    | 'NO_WORKERS_COMP'
    | 'NO_ADDITIONAL_INSURED';
  detail: string; // human-readable, with the exact gap
  remedy: string; // the fix path
}

export interface UpcomingExpiry {
  entityType: 'license' | 'insurance';
  entityId: string;
  label: string;
  expiresOn: string;
  daysUntil: number;
  severity: 'critical' | 'warning';
}

export interface JurisdictionEligibility {
  jurisdictionId: string;
  jurisdictionName: string;
  trade: string;
  status: EligibilityStatus;
  eligibleToBid: boolean;
  blockers: Blocker[];
  upcoming: UpcomingExpiry[];
  via?: string; // reciprocity explanation when status === eligible_via_reciprocity
  source_url: string | null;
  verified_on: string | null;
}

export interface AlertJob {
  businessId: string;
  entityType: 'license' | 'insurance';
  entityId: string;
  dueOn: string;
  severity: 'overdue' | 'critical' | 'warning';
  message: string;
}
