#!/usr/bin/env node
/**
 * Secret scanner for PropertyLedger.
 *
 * Usage:
 *   node scripts/scan-secrets.mjs           # scan all tracked files
 *   node scripts/scan-secrets.mjs --staged  # scan staged changes (pre-commit hook)
 *
 * High-confidence patterns only, so it never blocks a legitimate commit.
 * Exit code 0 = clean, 1 = secrets found.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const PATTERNS = [
  // JWT: header.payload.signature (Supabase anon/service keys). Dots allowed.
  { name: 'JWT / Supabase key', re: /eyJhbGciOi[A-Za-z0-9_.\/\-]{60,}/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[0-9A-Za-z]{30,}\b/ },
  { name: 'Stripe secret key', re: /\bsk_live_[0-9A-Za-z]{20,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'DB connection URL with password', re: /\b(?:postgres|postgresql|mysql|mongodb\+srv|redis):\/\/[^\s"'@]+:[^\s"'@]+@/i },
  { name: 'Hardcoded password', re: /\b(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/i },
  { name: 'Hardcoded API key / token', re: /\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i },
]

const BLOCKED_PATHS = [
  /\.env(?:$|\.)/, // any .env / .env.* file (never commit real env files)
  /\.pem$/, /\.key$/, /\.p12$/, /\.pfx$/, /id_rsa/, /\.keystore$/, /\.jks$/,
]

const isAllowedEnv = (p) => /\.env\.example$/i.test(p)

function scanContent(name, content) {
  const found = []
  for (const { name: pName, re } of PATTERNS) {
    const m = content.match(re)
    if (m) found.push(`${name}: ${pName} (${m[0].slice(0, 24)}…)`)
  }
  return found
}

function checkPath(name) {
  if (isAllowedEnv(name)) return null
  for (const re of BLOCKED_PATHS) {
    if (re.test(name)) return `${name}: blocked filename (${re})`
  }
  return null
}

const problems = []
const warnings = []

if (process.argv.includes('--staged')) {
  const diff = execSync('git diff --cached -U0', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
  for (const line of diff.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue
    problems.push(...scanContent('staged change', line.slice(1)))
  }
  const names = execSync('git diff --cached --name-only', { encoding: 'utf8' }).split('\n').filter(Boolean)
  for (const n of names) {
    const b = checkPath(n)
    if (b) problems.push(b)
  }
} else {
  const tracked = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
    .split('\n').filter(Boolean)
  for (const f of tracked) {
    if (!existsSync(f)) continue
    const b = checkPath(f)
    if (b) problems.push(b)
    const content = readFileSync(f, 'utf8')
    problems.push(...scanContent(f, content))
  }
  // Informational: real env files exist on disk — they must stay untracked.
  for (const f of ['.env', '.env.local', '.env.production', '.env.development']) {
    if (existsSync(f)) warnings.push(`note: '${f}' exists on disk — it is untracked and must never be committed`)
  }
}

for (const w of warnings) console.log(w)
if (problems.length) {
  console.log('SECRET SCAN FAILED:')
  for (const p of problems) console.log('  - ' + p)
  console.log('\nIf this is a false positive, commit with: git commit --no-verify')
  process.exit(1)
}
console.log('Secret scan clean ✅')
process.exit(0)
