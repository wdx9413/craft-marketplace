import { createHash } from "node:crypto";

export type JsonObject = Record<string, unknown>;
export interface SelfEvolutionStore {
  find(kind: string, id: string, version?: number, hydrate?: boolean): JsonObject | null;
  create(kind: string, id: string, payload: JsonObject): JsonObject;
  save(kind: string, id: string, payload: JsonObject, version?: number): JsonObject;
  list(kind: string, limit?: number, predicate?: (record: JsonObject) => boolean, hydrate?: boolean): JsonObject[];
}

export type SelfEvolutionContentStatus = "candidate" | "current" | "diagnostic" | "revoked";
export type SelfEvolutionFeedbackStatus = "confirmed" | "degraded" | "revoked";

export interface SelfEvolutionVerdict {
  readonly verified: boolean;
  readonly evidence_ref: string;
  readonly verifier: string;
  readonly gates?: { readonly scope_leak_count?: number; readonly unsupported_claim_rate_max?: number };
}

const CONTENT_KIND = "self_evolution_content";
const PROMOTION_KIND = "self_evolution_promotion";

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeScope(value: unknown): string {
  return text(value).replace(/^project:/u, "");
}

function projectScope(args: JsonObject): string {
  const direct = normalizeScope(args.project_scope_id ?? args.scope_id);
  if (direct) return direct;
  if (typeof args.project_root === "string" && args.project_root) return digest(args.project_root).slice(0, 16);
  return "";
}

function contentId(args: JsonObject, scopeId: string): string {
  return `self_evolution_${digest({
    statement_digest: digest(text(args.statement)),
    scenario_key: text(args.scenario_key),
    domain: text(args.domain),
    scope: scopeId,
  }).slice(-24)}`;
}

function verdictAllows(verdict: SelfEvolutionVerdict): boolean {
  const gates = verdict.gates ?? {};
  return verdict.verified === true
    && text(verdict.evidence_ref) !== ""
    && (verdict.verifier === "craft-eval" || verdict.verifier.startsWith("external:"))
    && gates.scope_leak_count === 0
    && gates.unsupported_claim_rate_max === 0;
}

/** Record a candidate without persisting the statement body. */
export function selfEvolutionAccumulate(store: SelfEvolutionStore, args: JsonObject): JsonObject {
  const statement = text(args.statement);
  const scenarioKey = text(args.scenario_key) || "general";
  const domain = text(args.domain) || "knowledge";
  const scopeId = projectScope(args);
  if (!statement || !scopeId) throw new Error("statement and project scope are required");
  const id = contentId(args, scopeId);
  const existing = store.find(CONTENT_KIND, id, undefined, false);
  if (existing) return existing;
  const entry: JsonObject = {
    id,
    statement_digest: digest(statement),
    scenario_key: scenarioKey,
    domain,
    project_scope_id: scopeId,
    source_refs: Array.isArray(args.source_refs) ? args.source_refs.slice(0, 20) : [],
    status: "candidate",
    created_at: new Date().toISOString(),
    history: [{ type: "accumulation", at: new Date().toISOString() }],
    feedback: [],
  };
  return store.create(CONTENT_KIND, id, entry);
}

/** Promote a candidate only from a complete external verdict. */
export function selfEvolutionPromote(store: SelfEvolutionStore, args: JsonObject): JsonObject & { id: string; status: SelfEvolutionContentStatus } {
  const id = text(args.id) || text(args.candidate_id);
  if (!id) throw new Error("id is required");
  const candidate = store.find(CONTENT_KIND, id, undefined, false);
  if (!candidate) throw new Error("candidate not found");
  const verdict = args.verdict;
  if (!verdict || typeof verdict !== "object" || Array.isArray(verdict)) {
    throw new Error("verdict is required");
  }
  const allowed = verdictAllows(verdict as unknown as SelfEvolutionVerdict);
  const status: SelfEvolutionContentStatus = allowed ? "current" : "diagnostic";
  const promotionId = `${id}:${text((verdict as JsonObject).evidence_ref) || "invalid"}`;
  const prior = store.find(PROMOTION_KIND, promotionId, undefined, false);
  if (prior) return prior as JsonObject & { id: string; status: SelfEvolutionContentStatus };
  const promotion: JsonObject = {
    id: promotionId,
    candidate_id: id,
    status,
    evidence_ref: text((verdict as JsonObject).evidence_ref),
    verifier: text((verdict as JsonObject).verifier),
    at: new Date().toISOString(),
  };
  store.save(PROMOTION_KIND, promotionId, promotion);
  store.save(CONTENT_KIND, id, {
    ...candidate,
    status,
    updated_at: new Date().toISOString(),
    history: [...(Array.isArray(candidate.history) ? candidate.history : []), {
      type: "promotion", status, at: new Date().toISOString(), evidence_ref: promotion.evidence_ref,
    }],
  });
  return promotion as JsonObject & { id: string; status: SelfEvolutionContentStatus };
}

/** Find current reusable content for a project scope and scenario. */
export function selfEvolutionSearch(store: SelfEvolutionStore, args: JsonObject): SelfEvolutionSearchResult {
  const scopeId = projectScope(args);
  const scenarioKey = text(args.scenario_key);
  const limit = Math.max(0, Math.min(50, Number(args.limit ?? 10)));
  if (!scopeId || !scenarioKey || limit === 0) return { entries: [], receipt: { scope: scopeId, scenario_key: scenarioKey, entries: [] } };
  const entries = store.list(CONTENT_KIND, 200, (entry) =>
    entry.status === "current" && normalizeScope(entry.project_scope_id) === scopeId && entry.scenario_key === scenarioKey, false)
    .slice(0, limit);
  const receipt = {
    scope: scopeId,
    scenario_key: scenarioKey,
    entries: entries.map((entry) => ({
      id: String(entry.id),
      digest: String(entry.statement_digest ?? ""),
      domain: String(entry.domain ?? ""),
      scenario_key: String(entry.scenario_key),
      status: "current",
    })),
  };
  return { entries, receipt };
}

/** Apply post-use feedback and synchronize the reusable status. */
export function selfEvolutionFeedback(store: SelfEvolutionStore, args: JsonObject): JsonObject {
  const id = text(args.id);
  const status = text(args.status) as SelfEvolutionFeedbackStatus;
  if (!id || !["confirmed", "degraded", "revoked"].includes(status)) throw new Error("id and valid status are required");
  const entry = store.find(CONTENT_KIND, id, undefined, false);
  if (!entry) throw new Error("content entry not found");
  const now = new Date().toISOString();
  const nextStatus: SelfEvolutionContentStatus = status === "revoked"
    ? "revoked"
    : status === "degraded"
      ? "candidate"
      : entry.status as SelfEvolutionContentStatus;
  const updated = {
    ...entry,
    status: nextStatus,
    updated_at: now,
    feedback: [...(Array.isArray(entry.feedback) ? entry.feedback : []), {
      status, reason: text(args.reason), at: now,
    }],
  };
  return store.save(CONTENT_KIND, id, updated);
}

export interface SelfEvolutionSearchResult {
  entries: JsonObject[];
  receipt: {
    scope: string;
    scenario_key: string;
    entries: Array<{ id: string; digest: string; domain: string; scenario_key: string; status: string }>;
  };
}
