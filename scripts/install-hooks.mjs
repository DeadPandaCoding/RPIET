#!/usr/bin/env node
/**
 * Installs a git pre-commit hook that runs the secret scanner on staged
 * changes. Called automatically by `npm install` (the `prepare` script).
 *
 * This script is deliberately bulletproof: every step is wrapped so it can
 * NEVER fail an install (important on CI / Vercel, where `prepare` runs and
 * must always succeed). It always exits 0.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

try {
  const root = process.cwd()
  const gitDir = join(root, '.git')
  if (!existsSync(gitDir)) {
    console.log('install-hooks: no .git directory, skipping')
    process.exit(0)
  }
  const hooksDir = join(gitDir, 'hooks')
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true })
  const hook = [
    '#!/bin/sh',
    '# Runs the secret scanner on staged changes (installed by scripts/install-hooks.mjs).',
    '# Skip with: git commit --no-verify',
    'node scripts/scan-secrets.mjs --staged',
    '',
  ].join('\n')
  const hookPath = join(hooksDir, 'pre-commit')
  writeFileSync(hookPath, hook)
  try {
    const { chmodSync } = await import('node:fs')
    chmodSync(hookPath, 0o755)
  } catch {
    // chmod may fail on some platforms — the hook still works when run via sh.
  }
  console.log('install-hooks: pre-commit secret scanner installed')
} catch (err) {
  // Never fail the install — worst case the hook just isn't installed.
  console.log('install-hooks: skipped (' + (err instanceof Error ? err.message : String(err)) + ')')
}
process.exit(0)
