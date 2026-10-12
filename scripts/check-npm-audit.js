#!/usr/bin/env node
'use strict';

// Fail-closed npm audit gate for the Mobile Client. Do not use for the Backend.
// Usage: node scripts/check-npm-audit.js client/npm-audit-client.json security/npm-audit-exceptions.json

const fs = require('node:fs');

// Only these two risk acceptances were approved by the project maintainer.
// A policy-file edit alone cannot silently extend the exception set.
const APPROVED = new Map([
  ['GHSA-vfj7-8cjw-p6xm', 'braces'],
  ['GHSA-86w9-cpqp-85rv', 'node-forge'],
]);
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);
const MAX_APPROVED_EXPIRY = '2026-11-11'; // 30 days after 2026-10-12

function fail(message) {
  throw new Error(message);
}

function loadJson(file) {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (err) {
    fail(`Cannot read ${file}: ${err.message}`);
  }
  try {
    return JSON.parse(content);
  } catch (err) {
    fail(`Invalid JSON in ${file}: ${err.message}`);
  }
}

function validatePolicy(policy) {
  if (policy?.schemaVersion !== 1 || policy.scope !== 'client') {
    fail('Invalid exception policy schema or scope; expected Mobile Client only');
  }
  if (typeof policy.expiresOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(policy.expiresOn)) {
    fail('Missing or invalid policy expiresOn date');
  }
  const expiry = new Date(`${policy.expiresOn}T00:00:00Z`);
  if (Number.isNaN(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== policy.expiresOn) {
    fail('Invalid policy expiry date');
  }
  if (policy.expiresOn > MAX_APPROVED_EXPIRY) {
    fail(`Expiry cannot be extended beyond the approved date ${MAX_APPROVED_EXPIRY}`);
  }
  // The expiration date is valid through the END of that UTC calendar day.
  if (new Date().toISOString().slice(0, 10) > policy.expiresOn) {
    fail(`Risk acceptance expired on ${policy.expiresOn}; review required`);
  }
  if (!Array.isArray(policy.allowedAdvisories) || policy.allowedAdvisories.length !== APPROVED.size) {
    fail('Exception policy must contain exactly two approved advisories');
  }
  const seen = new Set();
  for (const entry of policy.allowedAdvisories) {
    if (!entry?.id || APPROVED.get(entry.id) !== entry.package || seen.has(entry.id)) {
      fail(`Unapproved, mismatched, or duplicate advisory in policy: ${entry?.id}`);
    }
    seen.add(entry.id);
  }
  for (const advisory of APPROVED.keys()) {
    if (!seen.has(advisory)) fail(`Missing required approved advisory: ${advisory}`);
  }
  return policy.expiresOn;
}

function extractGhsa(url) {
  if (typeof url !== 'string') return null;
  const match = /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9-]+)\/?(?:[?#].*)?$/i.exec(url);
  return match ? `GHSA-${match[1].slice(5).toLowerCase()}` : null;
}

function validateAudit(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report) || report.error) {
    fail('npm audit report missing, invalid, or contains an audit error');
  }
  if (report.auditReportVersion !== 2) fail('Unsupported npm audit JSON format; expected auditReportVersion 2');
  if (!report.vulnerabilities || typeof report.vulnerabilities !== 'object' || Array.isArray(report.vulnerabilities)) {
    fail('npm audit report has no valid vulnerabilities object');
  }
  const counts = report.metadata?.vulnerabilities;
  if (!counts || !Number.isInteger(counts.high) || !Number.isInteger(counts.critical)) {
    fail('npm audit metadata is missing or malformed');
  }
  return counts;
}

// Validate every path in the dependency graph; cycles alone are not trusted.
function inspectViaEntry(via, name, downstream, pending, advisoryRoots) {
  if (typeof via === 'string' && via.length > 0) {
    downstream.push(via);
    pending.push(via);
    return null;
  }

  if (!via || typeof via !== 'object' || Array.isArray(via)) {
    return `Malformed via entry for ${name}`;
  }

  const ghsa = extractGhsa(via.url);
  if (!ghsa || APPROVED.get(ghsa) !== name || via.name !== name) {
    return `Unapproved direct advisory for ${name}: ${via.url || 'unknown URL'}`;
  }

  advisoryRoots.add(name);
  return null;
}

function buildDependencyGraph(startName, vulnerabilities) {
  const visited = new Set();
  const pending = [startName];
  const dependencies = new Map();
  const advisoryRoots = new Set();

  while (pending.length > 0) {
    const name = pending.pop();
    if (visited.has(name)) continue;
    visited.add(name);

    const vuln = vulnerabilities[name];
    if (!vuln || !Array.isArray(vuln.via) || vuln.via.length === 0) {
      return { error: `Missing vulnerability chain or advisory for ${name}` };
    }

    const downstream = [];
    for (const via of vuln.via) {
      const error = inspectViaEntry(via, name, downstream, pending, advisoryRoots);
      if (error) return { error };
    }
    dependencies.set(name, downstream);
  }

  return { visited, dependencies, advisoryRoots };
}

// Propagate trust backwards only from a directly validated advisory.
function findGroundedPackages(dependencies, advisoryRoots) {
  const grounded = new Set(advisoryRoots);
  let changed;
  do {
    changed = false;
    for (const [name, downstream] of dependencies) {
      if (!grounded.has(name) && downstream.some(dep => grounded.has(dep))) {
        grounded.add(name);
        changed = true;
      }
    }
  } while (changed);
  return grounded;
}

function inspectPackage(startName, vulnerabilities) {
  const graph = buildDependencyGraph(startName, vulnerabilities);
  if (graph.error) return graph.error;
  if (graph.advisoryRoots.size === 0) {
    return `No approved advisory reachable from ${startName}`;
  }

  const grounded = findGroundedPackages(graph.dependencies, graph.advisoryRoots);
  for (const name of graph.visited) {
    if (!grounded.has(name)) {
      return `Dependency branch at ${name} has no path to an approved advisory`;
    }
  }
  return null;
}

function collectFindings(vulnerabilities) {
  const blocked = [];
  const accepted = [];
  let actualHigh = 0;
  let actualCritical = 0;

  for (const [name, vuln] of Object.entries(vulnerabilities)) {
    if (!vuln || typeof vuln !== 'object') {
      blocked.push(`${name}: malformed vulnerability entry`);
      continue;
    }
    if (vuln.severity === 'high') actualHigh++;
    if (vuln.severity === 'critical') actualCritical++;
    if (!BLOCKING_SEVERITIES.has(vuln.severity)) continue;

    const reason = inspectPackage(name, vulnerabilities);
    if (reason) blocked.push(`${name}: ${reason}`);
    else accepted.push(name);
  }

  return { blocked, accepted, actualHigh, actualCritical };
}

function checkReport(report, approvedExpiry) {
  const counts = validateAudit(report);
  const { blocked, accepted, actualHigh, actualCritical } = collectFindings(report.vulnerabilities);

  if (actualHigh !== counts.high || actualCritical !== counts.critical) {
    fail(`Audit count mismatch: metadata HIGH=${counts.high}, CRITICAL=${counts.critical}; listed HIGH=${actualHigh}, CRITICAL=${actualCritical}`);
  }
  console.log(`Mobile audit: HIGH=${counts.high}, CRITICAL=${counts.critical}`);
  if (blocked.length) {
    for (const reason of blocked) console.error(`BLOCKED: ${reason}`);
    fail(`${blocked.length} unapproved or invalid vulnerability entries`);
  }
  console.log(`Risk acceptance applied to ${accepted.length} vulnerability entries (not fixed).`);
  console.log(`Approved upstream advisories: ${[...APPROVED.keys()].join(', ')}`);
  console.log(`Risk acceptance valid through ${approvedExpiry} UTC. New HIGH/CRITICAL findings remain blocking.`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### Mobile npm audit: PASS with temporary risk acceptance\n\n` +
      `- HIGH: ${counts.high}; CRITICAL: ${counts.critical}\n` +
      `- Allowed advisory IDs: ${[...APPROVED.keys()].join(', ')}\n` +
      `- Expiry: ${approvedExpiry} (UTC)\n` +
      `- **Vulnerabilities are accepted temporarily, NOT remediated.**\n\n`);
  }
}

function main() {
  const [reportPath, policyPath, ...rest] = process.argv.slice(2);
  if (!reportPath || !policyPath || rest.length) {
    fail('Usage: node scripts/check-npm-audit.js <audit-report.json> <exceptions.json>');
  }
  const expiry = validatePolicy(loadJson(policyPath));
  checkReport(loadJson(reportPath), expiry);
}

try {
  main();
} catch (err) {
  console.error(`SECURITY GATE FAILED: ${err.message}`);
  process.exitCode = 1;
}
