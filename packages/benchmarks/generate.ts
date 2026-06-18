/**
 * Generate Benchmark Data
 * Creates random debt graphs of various sizes.
 */

import * as fs from "fs";
import * as path from "path";

interface Debt {
  from: string;
  to: string;
  amount: number;
}

function generateGraph(size: number, density: number = 0.3): Debt[] {
  const debts: Debt[] = [];
  const members = Array.from({ length: size }, (_, i) => `user_${i}`);

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (i !== j && Math.random() < density) {
        debts.push({
          from: members[i],
          to: members[j],
          amount: Math.floor(Math.random() * 1000) + 1,
        });
      }
    }
  }

  return debts;
}

const sizes = [10, 50, 100, 500, 1000];
const dataDir = path.join(__dirname, "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

for (const size of sizes) {
  const debts = generateGraph(size, 0.2);
  const file = path.join(dataDir, `graph_${size}.json`);
  fs.writeFileSync(file, JSON.stringify(debts, null, 2));
  console.log(`Generated graph_${size}.json with ${debts.length} edges.`);
}
