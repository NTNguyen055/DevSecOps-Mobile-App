'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const checker = path.join(__dirname, 'check-npm-audit.js');
const policyPath = path.join(__dirname, '../security/npm-audit-exceptions.json');
const acceptable = {
  auditReportVersion: 2,
  vulnerabilities: {
    braces: { name: 'braces', severity: 'high', via: [{ name: 'braces', severity: 'high', url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }] },
    micromatch: { name: 'micromatch', severity: 'high', via: ['braces'] },
    'metro-file-map': { name: 'metro-file-map', severity: 'high', via: ['micromatch'] },
    'node-forge': { name: 'node-forge', severity: 'high', via: [{ name: 'node-forge', severity: 'high', url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv' }] },
    '@expo/code-signing-certificates': { name: '@expo/code-signing-certificates', severity: 'high', via: ['node-forge'] },
    expo: { name: 'expo', severity: 'high', via: ['metro-file-map', '@expo/code-signing-certificates'] }
  },
  metadata: { vulnerabilities: { high: 6, critical: 0, moderate: 0, low: 0, info: 0, total: 6 } }
};

function runGate(report, policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'))) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-gate-test-'));
  try {
    const auditPath = path.join(temp, 'audit.json');
    const exPath = path.join(temp, 'exceptions.json');
    fs.writeFileSync(auditPath, JSON.stringify(report));
    fs.writeFileSync(exPath, JSON.stringify(policy));
    return spawnSync(process.execPath, [checker, auditPath, exPath], { encoding: 'utf8' });
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

function altered(mod) { const data = structuredClone(acceptable); mod(data); return data; }

test('PASS with exactly two approved advisory roots and transitive packages', () => {
  const result = runGate(acceptable);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /not fixed/);
});

test('FAIL on new HIGH advisory, even if package is a known one', () => {
  const result = runGate(altered(data => {
    data.vulnerabilities.braces.via.push({ name: 'braces', severity: 'high', url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz' });
  }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unapproved direct advisory/);
});

test('FAIL on unapproved CRITICAL package', () => {
  const result = runGate(altered(data => {
    data.vulnerabilities.malicious = { name: 'malicious', severity: 'critical', via: [{ name: 'malicious', url: 'https://github.com/advisories/GHSA-0000-1111-2222' }] };
    data.metadata.vulnerabilities.critical = 1;
  }));
  assert.equal(result.status, 1);
});

test('FAIL when the report is an npm network/error response', () => {
  const result = runGate({ error: { code: 'ENOTFOUND' } });
  assert.equal(result.status, 1);
});

test('FAIL when the vulnerability metadata does not match entries', () => {
  const result = runGate(altered(data => { data.metadata.vulnerabilities.high = 0; }));
  assert.equal(result.status, 1);
});

test('FAIL on expired risk acceptance', () => {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  policy.expiresOn = '2026-10-01';
  const result = runGate(acceptable, policy);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /expired/);
});

test('FAIL when policy extends the approved date', () => {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  policy.expiresOn = '2026-12-31';
  const result = runGate(acceptable, policy);
  assert.equal(result.status, 1);
});

test('FAIL when policy adds extra advisory', () => {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  policy.allowedAdvisories.push({ id: 'GHSA-bbbb-cccc-dddd', package: 'another' });
  const result = runGate(acceptable, policy);
  assert.equal(result.status, 1);
});

test('PASS if advisories have been remediated and no HIGH/CRITICAL remain', () => {
  const result = runGate({ auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { high: 0, critical: 0 } } });
  assert.equal(result.status, 0, result.stderr);
});

// This graph mirrors the 15 HIGH entries reported by Expo/Metro in PR #99.
// In particular, metro, metro-config, and virtualized-lists create cycles.
function expoAuditWithCycles() {
  const data = structuredClone(acceptable);
  const items = data.vulnerabilities;
  delete items.expo;
  items['@expo/metro'] = { name: '@expo/metro', severity: 'high', via: ['metro', 'metro-config', 'metro-file-map', 'metro-transform-worker'] };
  items.metro = { name: 'metro', severity: 'high', via: ['metro-config', 'metro-file-map', 'metro-transform-worker'] };
  items['metro-config'] = { name: 'metro-config', severity: 'high', via: ['metro'] };
  items['metro-transform-worker'] = { name: 'metro-transform-worker', severity: 'high', via: ['metro'] };
  items['@expo/metro-config'] = { name: '@expo/metro-config', severity: 'high', via: ['@expo/metro'] };
  items['@expo/cli'] = { name: '@expo/cli', severity: 'high', via: ['@expo/code-signing-certificates', '@expo/metro', '@expo/metro-config', 'node-forge'] };
  items.expo = { name: 'expo', severity: 'high', via: ['@expo/cli', '@expo/metro', '@expo/metro-config'] };
  items['@react-native/community-cli-plugin'] = { name: '@react-native/community-cli-plugin', severity: 'high', via: ['metro', 'metro-config'] };
  items['@react-native/virtualized-lists'] = { name: '@react-native/virtualized-lists', severity: 'high', via: ['react-native'] };
  items['react-native'] = { name: 'react-native', severity: 'high', via: ['@react-native/community-cli-plugin', '@react-native/virtualized-lists'] };
  data.metadata.vulnerabilities.high = Object.keys(items).length;
  data.metadata.vulnerabilities.total = Object.keys(items).length;
  return data;
}

test('PASS on real-shaped Expo/Metro dependency cycles rooted in both approved advisories', () => {
  const result = runGate(expoAuditWithCycles());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /HIGH=15, CRITICAL=0/);
});

test('FAIL on a cycle with no path to an approved advisory', () => {
  const data = expoAuditWithCycles();
  data.vulnerabilities['metro-config'].via = ['metro-transform-worker'];
  data.vulnerabilities.metro.via = ['metro-config'];
  data.vulnerabilities['metro-transform-worker'].via = ['metro'];
  const result = runGate(data);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /no path to an approved advisory|No approved advisory/);
});

test('FAIL when a cyclic graph has a side branch without an approved advisory', () => {
  const data = expoAuditWithCycles();
  data.vulnerabilities.unresolved = { name: 'unresolved', severity: 'high', via: ['unresolved'] };
  data.vulnerabilities['@expo/metro'].via.push('unresolved');
  data.metadata.vulnerabilities.high++;
  const result = runGate(data);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /no path to an approved advisory/);
});

test('FAIL on a new direct HIGH advisory inside a cyclic graph', () => {
  const data = expoAuditWithCycles();
  data.vulnerabilities.metro.via.push({ name: 'metro', severity: 'high', url: 'https://github.com/advisories/GHSA-new1-new2-new3' });
  const result = runGate(data);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /Unapproved direct advisory/);
});

test('FAIL on a missing package in a cyclic graph', () => {
  const data = expoAuditWithCycles();
  data.vulnerabilities['metro-config'].via.push('missing-package');
  const result = runGate(data);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /Missing vulnerability chain/);
});
