/**
 * Benchmark Runner
 * Compares WASM solver vs TypeScript fallback solver.
 */

import * as fs from "fs";
import * as path from "path";
import Benchmark from "benchmark";
import { minimizeDebts as solveTs } from "../../apps/server/src/services/solver.js";

// We'll dynamically import the main solver. It will try to use WASM, and if not available, fallback to TS.
// To explicitly test WASM vs TS, we'll try to load the wasm module directly.

const dataDir = path.join(__dirname, "data");

async function loadWasmSolver() {
  try {
    const wasmModulePath = path.join(__dirname, "../solver/dist/solver.js");
    if (fs.existsSync(wasmModulePath)) {
      // Dynamic import to avoid crash if it doesn't exist
      const { solve } = await import("file://" + wasmModulePath.replace(/\\/g, "/"));
      return solve;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function runBenchmarks() {
  console.log("Loading datasets...");
  const datasets = [];
  const files = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter(f => f.endsWith(".json")) : [];
  
  if (files.length === 0) {
    console.error("No data found. Run 'npm run generate' first.");
    process.exit(1);
  }

  for (const file of files) {
    const raw = fs.readFileSync(path.join(dataDir, file), "utf8");
    datasets.push({
      name: file.replace(".json", ""),
      data: JSON.parse(raw),
    });
  }
  
  datasets.sort((a, b) => {
    const sizeA = parseInt(a.name.split("_")[1]);
    const sizeB = parseInt(b.name.split("_")[1]);
    return sizeA - sizeB;
  });

  // Try to get actual WASM solver
  const solveWasm = await loadWasmSolver();
  
  if (!solveWasm) {
    console.log("⚠️ WASM module not found or failed to load. Will only benchmark TS solver.");
    console.log("Compile the solver with Emscripten to run full benchmarks.");
  } else {
    console.log("✅ Both WASM and TS solvers available.");
  }

  console.log("\nStarting Benchmark Suite...\n");

  for (const dataset of datasets) {
    console.log(`--- Dataset: ${dataset.name} (${dataset.data.length} edges) ---`);
    
    await new Promise<void>((resolve) => {
      const suite = new Benchmark.Suite();
      
      const userMap = new Map<string, string>();
      for (const e of dataset.data) {
        userMap.set(e.from, e.from);
        userMap.set(e.to, e.to);
      }

      suite.add("TypeScript Fallback", function() {
        solveTs(dataset.data, userMap);
      });
      
      if (solveWasm) {
        suite.add("WebAssembly (C++)", function() {
          solveWasm(dataset.data, userMap);
        });
      }
      
      suite.on("cycle", function(event: any) {
        console.log(String(event.target));
      });
      
      suite.on("complete", function(this: any) {
        if (solveWasm) {
          console.log("Fastest is " + this.filter("fastest").map("name") + "\n");
        } else {
          console.log("Done.\n");
        }
        resolve();
      });
      
      suite.run({ async: true });
    });
  }
}

runBenchmarks().catch(console.error);
