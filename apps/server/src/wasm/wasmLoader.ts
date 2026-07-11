// ──────────────────────────────────────────────
// WASM Solver Loader
// ──────────────────────────────────────────────
// Loads the compiled WebAssembly solver module
// at server startup and provides a typed async
// interface for the transaction service.
//
// Falls back to the TypeScript solver if WASM
// binary is not available (e.g. during dev).
// ──────────────────────────────────────────────

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import type { DebtEdge, Settlement } from "../types/api.js";
import {
  EXACT_SOLVER_ACTIVE_BALANCE_LIMIT,
  getActiveBalanceCount,
  solveDebtSettlements,
  type SolverOutcome,
} from "../services/solver.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the compiled WASM module
const WASM_PATH = join(__dirname, "..", "..", "..", "..", "packages", "solver", "dist", "solver.js");

interface WasmSolverModule {
  ccall: (
    name: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[]
  ) => unknown;
  cwrap: (
    name: string,
    returnType: string,
    argTypes: string[]
  ) => (...args: unknown[]) => unknown;
  UTF8ToString: (ptr: number) => string;
}

let wasmModule: WasmSolverModule | null = null;
let useWasm = false;

export interface RuntimeSolverOutcome extends SolverOutcome {
  engine: "wasm" | "typescript";
}

/**
 * Initialize the WASM solver module.
 * Call once at server startup.
 */
export async function initSolver(): Promise<void> {
  if (existsSync(WASM_PATH)) {
    try {
      const SolverModule = (await import(WASM_PATH)).default;
      wasmModule = await SolverModule();
      useWasm = true;

      // Verify the module loaded correctly
      const version = wasmModule!.ccall("get_version", "number", [], []) as number;
      console.log(`[SOLVER] WASM solver loaded (v${Math.floor(version / 100)}.${version % 100}.0)`);
    } catch (err) {
      console.warn("[SOLVER] Failed to load WASM module, falling back to TypeScript solver:", err);
      useWasm = false;
    }
  } else {
    console.log("[SOLVER] WASM solver not built; using TypeScript fallback solver.");
    if (process.env.SOLVER_DEBUG === "true") {
      console.log(`[SOLVER] Expected WASM wrapper at: ${WASM_PATH}`);
    }
    useWasm = false;
  }
}

/**
 * Solve debt minimization using the WASM or fallback solver.
 *
 * @param edges - Array of debt edges with userId strings
 * @param userNames - Map of userId to display name
 * @returns Minimized settlement array
 */
export async function solveDebts(
  edges: DebtEdge[],
  userNames: Map<string, string>
): Promise<RuntimeSolverOutcome> {
  const activeBalances = getActiveBalanceCount(edges);
  const exact = activeBalances <= EXACT_SOLVER_ACTIVE_BALANCE_LIMIT;

  if (!useWasm || !wasmModule) {
    return { ...solveDebtSettlements(edges, userNames), engine: "typescript" };
  }

  try {
    // Map string userIds to numeric indices for the WASM solver
    const userIdList = Array.from(new Set([...edges.map((e) => e.from), ...edges.map((e) => e.to)]));
    const userIdToIndex = new Map<string, number>();
    userIdList.forEach((id, idx) => userIdToIndex.set(id, idx));

    // Convert to WASM input format
    const wasmInput = JSON.stringify({
      edges: edges.map((e) => ({
        from: userIdToIndex.get(e.from)!,
        to: userIdToIndex.get(e.to)!,
        amount: e.amount,
      })),
      numNodes: userIdList.length,
    });

    // Call WASM solver
    const resultPtr = wasmModule.ccall("solve", "number", ["string"], [wasmInput]) as number;
    const resultJson = wasmModule.UTF8ToString(resultPtr);
    wasmModule.ccall("free_result", null, [], []);

    // Parse WASM output and map indices back to userIds
    const wasmSettlements = JSON.parse(resultJson) as { from: number; to: number; amount: number }[];

    const settlements: Settlement[] = wasmSettlements.map((s) => ({
      from: userIdList[s.from],
      fromName: userNames.get(userIdList[s.from]) ?? userIdList[s.from],
      to: userIdList[s.to],
      toName: userNames.get(userIdList[s.to]) ?? userIdList[s.to],
      amount: s.amount,
    }));

    return {
      settlements,
      strategy: exact ? "exact" : "greedy",
      exact,
      activeBalances,
      engine: "wasm",
    };
  } catch (err) {
    console.error("[SOLVER] WASM execution failed, falling back to TypeScript:", err);
    return { ...solveDebtSettlements(edges, userNames), engine: "typescript" };
  }
}
