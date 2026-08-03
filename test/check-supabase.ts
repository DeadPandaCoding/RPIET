/**
 * Verifies Supabase connection: table existence, read + write (RLS) access.
 * Run with: VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npx tsx test/check-supabase.ts
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

console.log('Project URL:', url)

const sb = createClient(url, anonKey)

const tables = ['properties', 'units', 'tenants', 'incomes', 'expenses']

let missing = 0
for (const t of tables) {
  const { data, error } = await sb.from(t).select('*').limit(1)
  if (error) {
    missing++
    console.log(`  ✗ ${t}: ${error.message}`)
  } else {
    console.log(`  ✓ ${t}: readable (${data?.length ?? 0} rows fetched)`)
  }
}

if (missing > 0) {
  console.log(`\n${missing} table(s) missing. Run supabase/schema.sql in the SQL Editor:\n  https://supabase.com/dashboard/project/duddziumwdgxcaztciig/sql`)
  process.exit(0)
}

// --- Write probe: does the anon key have RLS-granted insert on properties? ---
console.log('\nWrite (RLS) probe on properties:')
const { data: inserted, error: insErr } = await sb
  .from('properties')
  .insert({ name: '__probe__', address: '__probe__', notes: null })
  .select('id')
  .single()

if (insErr) {
  console.log(`  ✗ INSERT blocked: ${insErr.message} (RLS policies may be missing)`)
} else {
  console.log(`  ✓ INSERT allowed (id=${inserted?.id})`)
  const { error: delErr } = await sb.from('properties').delete().eq('id', inserted!.id)
  console.log(delErr ? `  ✗ cleanup delete failed: ${delErr.message}` : '  ✓ probe row cleaned up')
}
