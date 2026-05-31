// The core IP: pure, deterministic compliance evaluation.
// No I/O here — everything is passed in, so it is trivially testable and the
// engine can run at the edge with zero latency.

import type {
  Blocker,
  InsurancePolicy,
  JurisdictionEligibility,
  Jurisdiction,
  License,
  Reciprocity,
  Requirement,
  UpcomingExpiry,
} from './types';

// Warning windows (days) used for "expiring soon".
export const WARN_CRITICAL_DAYS = 30;
export const WARN_DAYS = 60;

export function daysBetween(from: Date, isoDate: string): number {
  const target = new Date(isoDate + 'T00:00:00Z').getTime();
  const base = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((target - base) / 86_400_000);
}

function fmtUsd(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

interface EvaluateArgs {
  jurisdiction: Jurisdiction;
  requirement: Requirement;
  licenses: License[]; // all of the business's licenses (any jurisdiction)
  policies: InsurancePolicy[];
  reciprocity: Reciprocity[]; // rows where jurisdiction_id === this jurisdiction
  now: Date;
}

/**
 * Decide whether a business may bid a given trade in a given jurisdiction, and —
 * crucially — WHY NOT and HOW TO FIX IT when it can't.
 */
export function evaluateCompliance(args: EvaluateArgs): JurisdictionEligibility {
  const { jurisdiction, requirement, licenses, policies, reciprocity, now } = args;
  const blockers: Blocker[] = [];
  const upcoming: UpcomingExpiry[] = [];

  // --- 1. License check (direct, then reciprocity) ---
  const tradeLicenses = licenses.filter((l) => l.trade === requirement.trade);
  const directLicense = tradeLicenses.find((l) => l.jurisdiction_id === jurisdiction.id);

  let licenseSatisfied = false;
  let viaReciprocity: string | undefined;

  if (directLicense) {
    const lic = directLicense;
    if (lic.status !== 'active') {
      blockers.push({
        code: 'LICENSE_INACTIVE',
        detail: `Your ${jurisdiction.name} ${requirement.trade} license is "${lic.status}".`,
        remedy: `Resolve the ${lic.status} status with ${jurisdiction.license_authority ?? jurisdiction.name}.`,
      });
    } else if (classMismatch(lic.classification, requirement.required_classes)) {
      blockers.push({
        code: 'WRONG_CLASS',
        detail: `${jurisdiction.name} requires class ${fmtClasses(requirement.required_classes)} for ${requirement.trade}; you hold "${lic.classification ?? 'none'}".`,
        remedy: `Upgrade/obtain a class ${fmtClasses(requirement.required_classes)} license.`,
      });
    } else if (isExpired(lic.expires_on, now, jurisdiction.grace_period_days)) {
      blockers.push({
        code: 'LICENSE_EXPIRED',
        detail: `Your ${jurisdiction.name} ${requirement.trade} license expired on ${lic.expires_on}.`,
        remedy: `Renew with ${jurisdiction.license_authority ?? jurisdiction.name} immediately.`,
      });
    } else {
      licenseSatisfied = true;
      pushUpcoming(upcoming, 'license', lic.id, `${jurisdiction.name} ${requirement.trade} license`, lic.expires_on, now);
    }
  } else {
    // No direct license — try reciprocity from another jurisdiction we ARE licensed in.
    for (const r of reciprocity) {
      const accepted = tradeLicenses.find(
        (l) =>
          l.jurisdiction_id === r.accepts_from &&
          l.status === 'active' &&
          !isExpired(l.expires_on, now, jurisdiction.grace_period_days) &&
          (r.accepts_classes.length === 0 || (l.classification != null && r.accepts_classes.includes(l.classification))),
      );
      if (accepted) {
        viaReciprocity = `Accepted via your ${accepted.jurisdiction_id} ${requirement.trade} license (reciprocity).`;
        pushUpcoming(upcoming, 'license', accepted.id, `${requirement.trade} license (reciprocity)`, accepted.expires_on, now);
        break;
      }
    }
    if (viaReciprocity) {
      licenseSatisfied = true;
    } else {
      blockers.push({
        code: 'NO_LICENSE',
        detail: `No active ${requirement.trade} license for ${jurisdiction.name}.`,
        remedy: requirement.required_classes.length
          ? `Obtain a ${jurisdiction.name} ${requirement.trade} license (class ${fmtClasses(requirement.required_classes)}).`
          : `Register for a ${jurisdiction.name} ${requirement.trade} contractor license.`,
      });
    }
  }

  // --- 2. Insurance checks ---
  const gl = policies.find((p) => p.coverage_type === 'general_liability');
  if (!gl) {
    blockers.push({
      code: 'NO_GENERAL_LIABILITY',
      detail: `${jurisdiction.name} requires general-liability coverage; none on file.`,
      remedy: `Add a general-liability policy of at least ${fmtUsd(requirement.min_per_occurrence)}/${fmtUsd(requirement.min_aggregate)}.`,
    });
  } else {
    if (isExpired(gl.expires_on, now, 0)) {
      blockers.push({
        code: 'GL_EXPIRED',
        detail: `Your general-liability policy expired on ${gl.expires_on}.`,
        remedy: `Renew general-liability coverage and upload the new COI.`,
      });
    } else {
      pushUpcoming(upcoming, 'insurance', gl.id, 'General-liability COI', gl.expires_on, now);
    }
    if (gl.per_occurrence_limit < requirement.min_per_occurrence) {
      blockers.push({
        code: 'INSUFFICIENT_GL_PER_OCCURRENCE',
        detail: `${jurisdiction.name} requires ${fmtUsd(requirement.min_per_occurrence)} per-occurrence; you carry ${fmtUsd(gl.per_occurrence_limit)}.`,
        remedy: `Increase per-occurrence limit to ${fmtUsd(requirement.min_per_occurrence)}.`,
      });
    }
    if (gl.aggregate_limit < requirement.min_aggregate) {
      blockers.push({
        code: 'INSUFFICIENT_GL_AGGREGATE',
        detail: `${jurisdiction.name} requires ${fmtUsd(requirement.min_aggregate)} aggregate; you carry ${fmtUsd(gl.aggregate_limit)}.`,
        remedy: `Increase aggregate limit to ${fmtUsd(requirement.min_aggregate)}.`,
      });
    }
    if (requirement.additional_insured_required && !gl.additional_insured) {
      blockers.push({
        code: 'NO_ADDITIONAL_INSURED',
        detail: `${jurisdiction.name} requires the city/owner listed as additional insured; your policy is not endorsed.`,
        remedy: `Request an additional-insured endorsement from ${gl.carrier ?? 'your carrier'}.`,
      });
    }
  }

  if (requirement.workers_comp_required) {
    const wc = policies.find((p) => p.coverage_type === 'workers_comp');
    if (!wc || isExpired(wc.expires_on, now, 0)) {
      blockers.push({
        code: 'NO_WORKERS_COMP',
        detail: `${jurisdiction.name} requires active workers' compensation coverage.`,
        remedy: wc ? `Renew your workers' comp policy (expired ${wc.expires_on}).` : `Add a workers' compensation policy.`,
      });
    } else {
      pushUpcoming(upcoming, 'insurance', wc.id, "Workers' comp", wc.expires_on, now);
    }
  }

  // --- 3. Status roll-up ---
  const eligibleToBid = blockers.length === 0 && licenseSatisfied;
  let status: JurisdictionEligibility['status'];
  if (!eligibleToBid) {
    status = 'blocked';
  } else if (upcoming.some((u) => u.severity === 'critical')) {
    status = 'expiring';
  } else if (viaReciprocity) {
    status = 'eligible_via_reciprocity';
  } else {
    status = 'eligible';
  }

  return {
    jurisdictionId: jurisdiction.id,
    jurisdictionName: jurisdiction.name,
    trade: requirement.trade,
    status,
    eligibleToBid,
    blockers,
    upcoming: upcoming.sort((a, b) => a.daysUntil - b.daysUntil),
    via: viaReciprocity,
    source_url: jurisdiction.source_url,
    verified_on: jurisdiction.verified_on,
  };
}

function classMismatch(held: string | null, required: string[]): boolean {
  if (required.length === 0) return false; // class-agnostic trade
  return held == null || !required.includes(held);
}

function fmtClasses(classes: string[]): string {
  return classes.length ? classes.join('/') : 'any';
}

function isExpired(expiresOn: string | null, now: Date, graceDays: number): boolean {
  if (!expiresOn) return false; // unknown expiry is treated as non-blocking
  return daysBetween(now, expiresOn) + graceDays < 0;
}

function pushUpcoming(
  out: UpcomingExpiry[],
  entityType: 'license' | 'insurance',
  entityId: string,
  label: string,
  expiresOn: string | null,
  now: Date,
): void {
  if (!expiresOn) return;
  const daysUntil = daysBetween(now, expiresOn);
  if (daysUntil < 0 || daysUntil > WARN_DAYS) return;
  out.push({
    entityType,
    entityId,
    label,
    expiresOn,
    daysUntil,
    severity: daysUntil <= WARN_CRITICAL_DAYS ? 'critical' : 'warning',
  });
}
