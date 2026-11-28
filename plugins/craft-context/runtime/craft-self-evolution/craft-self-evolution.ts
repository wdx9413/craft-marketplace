import { readFileSync } from "node:fs";
import { selfEvolutionAccumulate, selfEvolutionFeedback, selfEvolutionPromote, selfEvolutionSearch, type SelfEvolutionStore } from "./context-self-evolution-loop.ts";
import type { JsonObject } from "./context-self-evolution-loop.ts";

type Operation = "accumulate" | "promote" | "search" | "feedback";

function parseArgs(argv: readonly string[]): { operation: Operation; args: JsonObject } {
  const [operation, payload] = argv;
  if (!operation || !["accumulate", "promote", "search", "feedback"].includes(operation)) {
    throw new Error("operation must be accumulate, promote, search or feedback");
  }
  if (!payload) throw new Error("payload is required");
  const parsed: unknown = payload.startsWith("@") ? JSON.parse(readFileSync(payload.slice(1), "utf8")) : JSON.parse(payload);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("payload must be a JSON object");
  return { operation: operation as Operation, args: parsed as JsonObject };
}

export async function runSelfEvolutionCli(store: SelfEvolutionStore, argv: readonly string[]): Promise<JsonObject> {
  const { operation, args } = parseArgs(argv);
  if (operation === "accumulate") return selfEvolutionAccumulate(store, args);
  if (operation === "promote") return selfEvolutionPromote(store, args);
  if (operation === "search") return selfEvolutionSearch(store, args);
  return selfEvolutionFeedback(store, args);
}

