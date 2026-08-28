import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

function percentile(sortedSamples, percentileValue) {
  const position = (sortedSamples.length - 1) * percentileValue;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedSamples[lower];
  return sortedSamples[lower] + (sortedSamples[upper] - sortedSamples[lower]) * (position - lower);
}

export function summarizeDurations(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new TypeError("At least one duration sample is required");
  }
  const sorted = samples.map(Number).sort((a, b) => a - b);
  if (sorted.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new TypeError("Duration samples must be finite non-negative numbers");
  }
  return {
    medianMs: percentile(sorted, 0.5),
    p75Ms: percentile(sorted, 0.75),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1),
  };
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function benchmarkDashboard() {
  loadEnvFile(".env.local");
  const supabase = createClient(
    requireEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: organizations, error: organizationError } = await supabase
    .from("organizations")
    .select("id")
    .limit(1);
  if (organizationError) throw organizationError;
  const organizationId = organizations?.[0]?.id;
  if (!organizationId) throw new Error("No organization available for benchmark");

  const businessDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const durations = [];
  let expectedSnapshot;
  let responseBytes = 0;
  let mismatches = 0;

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const startedAt = performance.now();
    const { data, error } = await supabase.rpc("get_dashboard_snapshot_v1", {
      p_organization_id: organizationId,
      p_business_date: businessDate,
    });
    const duration = performance.now() - startedAt;
    if (error) throw error;
    assert.equal(data?.length, 1, "dashboard RPC must return exactly one row");
    const serialized = JSON.stringify(data[0]);
    responseBytes = Buffer.byteLength(serialized);
    if (expectedSnapshot === undefined) expectedSnapshot = serialized;
    else if (serialized !== expectedSnapshot) mismatches += 1;
    if (iteration >= 2) durations.push(duration);
  }

  const latency = summarizeDurations(durations);
  const summary = {
    median_ms: Math.round(latency.medianMs * 100) / 100,
    p75_ms: Math.round(latency.p75Ms * 100) / 100,
    p95_ms: Math.round(latency.p95Ms * 100) / 100,
    max_ms: Math.round(latency.maxMs * 100) / 100,
    request_groups: 1,
    response_bytes: responseBytes,
    fallbacks: 0,
    mismatches,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (mismatches > 0) process.exitCode = 1;
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryPoint) {
  benchmarkDashboard().catch((error) => {
    process.stderr.write(`Dashboard benchmark failed: ${error?.message ?? "unknown error"}\n`);
    process.exitCode = 1;
  });
}
