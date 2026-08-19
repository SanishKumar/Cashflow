#!/usr/bin/env node
/**
 * Audits production dependencies and fails on high or critical advisories.
 *
 * `npm audit` has no native way to accept a known finding, so anything we have
 * consciously decided to live with is listed in ALLOWLIST below, with the
 * reasoning and a date to look at it again. Everything else still fails the
 * build, which is the part plain `npm audit` was giving us.
 */
import { execSync } from "node:child_process";

const ALLOWLIST = [
  {
    id: "GHSA-ggr8-5vv4-36mx",
    package: "deepmerge-ts",
    url: "https://github.com/advisories/GHSA-ggr8-5vv4-36mx",
    reviewBy: "2026-11-19",
    reason: [
      "Stack exhaustion in deepmerge-ts <8.0.0, reachable only through the",
      "Prisma CLI's config loader. @prisma/client peer-depends on prisma, so npm",
      "counts the CLI as a production dependency even though it is a devDependency",
      "here and runs only at generate and migrate time. The deployed server imports",
      "the generated client and never the CLI, so no request data reaches the merge.",
      "Every published @prisma/config, latest 7.9.1 included, hard-pins",
      "deepmerge-ts 7.1.5, so neither an upgrade nor an npm override clears this",
      "today. Drop this entry once Prisma ships a release on deepmerge-ts >=8.",
    ].join(" "),
  },
];

const BLOCKING = new Set(["high", "critical"]);

function runAudit() {
  try {
    // Run through a shell so this works against npm's .cmd shim on Windows too.
    return execSync("npm audit --omit=dev --json", {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // npm exits non-zero whenever it finds anything, so the report still
    // arrives on stdout. Only a genuinely empty stdout is a real failure.
    if (typeof error.stdout === "string" && error.stdout.trim()) return error.stdout;
    throw error;
  }
}

const report = JSON.parse(runAudit());

if (report.auditReportVersion !== 2) {
  console.error(`Unexpected npm audit report version: ${report.auditReportVersion}`);
  process.exit(1);
}

// One advisory shows up on every package it travels through, so collect them by
// id. Entries that are plain strings are just the onward path to a package that
// carries the advisory object itself.
const found = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via !== "object" || !via.url) continue;
    if (!BLOCKING.has(via.severity)) continue;
    const id = via.url.split("/").pop();
    found.set(id, {
      id,
      title: via.title,
      severity: via.severity,
      package: via.name,
      range: via.range,
      url: via.url,
    });
  }
}

const allowed = new Map(ALLOWLIST.map((entry) => [entry.id, entry]));
const blocking = [...found.values()].filter((advisory) => !allowed.has(advisory.id));
const accepted = [...found.values()].filter((advisory) => allowed.has(advisory.id));

const today = new Date().toISOString().slice(0, 10);

for (const advisory of accepted) {
  const entry = allowed.get(advisory.id);
  console.log(`Accepted: ${advisory.id} (${advisory.severity}) in ${advisory.package} ${advisory.range}`);
  console.log(`  ${advisory.title}`);
  console.log(`  ${entry.reason}`);
  console.log(`  Review by ${entry.reviewBy} - ${advisory.url}`);
  if (today > entry.reviewBy) {
    console.log(`  NOTE: past its review date. Check whether this is still needed.`);
  }
  console.log();
}

for (const entry of ALLOWLIST) {
  if (!found.has(entry.id)) {
    console.log(`Stale allowlist entry: ${entry.id} no longer appears. Remove it from scripts/audit-prod.mjs.`);
    console.log();
  }
}

if (blocking.length > 0) {
  console.error(`Found ${blocking.length} unreviewed high or critical advisory(ies) in production dependencies:`);
  console.error();
  for (const advisory of blocking) {
    console.error(`  ${advisory.id} (${advisory.severity}) in ${advisory.package} ${advisory.range}`);
    console.error(`    ${advisory.title}`);
    console.error(`    ${advisory.url}`);
  }
  console.error();
  console.error("Upgrade the dependency, or add it to ALLOWLIST in scripts/audit-prod.mjs with a reason.");
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `No unreviewed high or critical advisories in production dependencies ` +
    `(${accepted.length} accepted, ${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low).`
);
