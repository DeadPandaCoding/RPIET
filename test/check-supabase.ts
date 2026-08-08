/**
 * Verifies Supabase connection: table existence, read + write (RLS) access.
 * When SUPABASE_SERVICE_ROLE_KEY is also set, verifies the pg_cron prune job
 * (schedule, command, active, last run) through the public.cron_job_status()
 * window function — the cron schema itself is never exposed to the REST API.
 * Run with: VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... [SUPABASE_SERVICE_ROLE_KEY=...] npx tsx test/check-supabase.ts
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

const { data: sessionData } = await sb.auth.getSession()
console.log(
  sessionData.session
    ? `Auth: signed in as ${sessionData.session.user.email}`
    : 'Auth: no session — owner RLS hides all rows from anonymous clients',
)

const tables = ['properties', 'units', 'tenants', 'incomes', 'expenses']

let missing = 0
for (const t of tables) {
  const { data, error } = await sb.from(t).select('*').limit(1)
  if (error) {
    missing++
    console.log(`  ✗ ${t}: ${error.message}`)
  } else {
    const n = data?.length ?? 0
    console.log(
      `  ✓ ${t}: readable (${n} row(s) fetched${n === 0 ? ' — 0 rows may mean owner RLS is hiding them' : ''})`,
    )
  }
}

if (missing > 0) {
  console.log(`\n${missing} table(s) missing. Run supabase/schema.sql in the SQL Editor:\n  https://supabase.com/dashboard/project/YOUR-PROJECT-REF/sql`)
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
  const msg = `${insErr.message}`
  if (/row.?level security|permission denied|policy/i.test(msg)) {
    console.log(`  ✓ INSERT blocked by RLS as expected (${msg})`)
    console.log('    Per-user RLS is active — sign in with an account to read/write.')
  } else {
    console.log(`  ✗ INSERT failed: ${msg}`)
  }
} else {
  console.log(`  ✓ INSERT allowed (id=${inserted?.id}) — check that per-user policies are installed`)
  const { error: delErr } = await sb.from('properties').delete().eq('id', inserted!.id)
  console.log(delErr ? `  ✗ cleanup delete failed: ${delErr.message}` : '  ✓ probe row cleaned up')
}

// --- pg_cron prune job: schedule + run history ------------------------------
// The cron schema is not exposed to PostgREST, so this check goes through the
// public.cron_job_status() security-definer window function (schema.sql
// MAINTENANCE block) and therefore needs the service-role key. Without it the
// check is skipped, not failed — the basic connection checks above still run.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
console.log('\npg_cron prune job (public.cron_job_status):')
if (!serviceKey) {
  console.log('  – skipped: set SUPABASE_SERVICE_ROLE_KEY to verify the schedule and run history')
} else {
  let cronFailures = 0
  const cronCheck = (cond: boolean, msg: string) => {
    if (cond) {
      console.log(`  ✓ ${msg}`)
    } else {
      cronFailures++
      console.error(`  ✗ FAIL: ${msg}`)
    }
  }
  const srv = createClient(url, serviceKey)
  const { data, error } = await srv.rpc('cron_job_status')
  if (error) {
    cronFailures++
    const msg = error.message
    const code = (error as { code?: string }).code ?? ''
    // PGRST202 = "not in the schema cache". That is ambiguous, so spell out the
    // three real causes and the exact fix for each instead of a vague hint.
    let hint = ''
    if (code === 'PGRST202' || /schema cache|could not find the function/i.test(msg)) {
      hint =
        ' — cron_job_status() is missing from the PostgREST schema cache. Either:\n' +
        '      1) never created → run the MAINTENANCE block of supabase/schema.sql (prune_session_revocations + cron_job_status)\n' +
        '      2) created but cache stale → in the SQL Editor run: notify pgrst, \'reload schema\';\n' +
        '      3) created but service_role lacks execute → in the SQL Editor run: grant execute on function public.cron_job_status() to service_role;'
    } else if (/permission denied for function/i.test(msg)) {
      hint =
        ' — service_role lacks EXECUTE on cron_job_status(). In the SQL Editor run: grant execute on function public.cron_job_status() to service_role;'
    }
    console.error(`  ✗ FAIL: cron_job_status() unreachable: ${msg}${hint}`)
  } else {
    const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []
    cronCheck(
      rows.length === 1,
      `job 'prune-session-revocations' exists${rows.length === 0 ? ' — run the MAINTENANCE block of supabase/schema.sql' : ''}`,
    )
    const job = rows[0]
    if (job) {
      cronCheck(
        job.schedule === '0 3 * * *',
        `schedule is '0 3 * * *' (daily 03:00)${job.schedule ? ` — got '${String(job.schedule)}'` : ''}`,
      )
      cronCheck(
        typeof job.command === 'string' && job.command.includes('prune_session_revocations'),
        `command runs prune_session_revocations${job.command ? ` — got '${String(job.command)}'` : ''}`,
      )
      cronCheck(job.active === true, `job is active${job.active === false ? ' — enable it in Database → Cron' : ''}`)
      if (job.last_run_status == null) {
        console.log('  – job has not run yet — first run is tonight at 03:00 (or press Run now in Database → Cron)')
      } else {
        cronCheck(
          job.last_run_status === 'succeeded',
          `last run ${job.last_run_status}${job.last_run_status === 'succeeded' ? '' : ' — check Database → Cron for details'} at ${String(job.last_run_at)}${job.last_run_msg ? ` (${String(job.last_run_msg)})` : ''}`,
        )
      }
    }
    // Security posture: the window function must never be anon-callable.
    const anonRpc = await sb.rpc('cron_job_status')
    cronCheck(
      !!anonRpc.error,
      `anon cannot call cron_job_status (${anonRpc.error ? anonRpc.error.message : 'no error — revoke anon/authenticated execute'})`,
    )
  }
  // Unlike the diagnostic checks above, this section hard-fails (exit 1) when
  // the service key is provided, so CI or a nightly run catches a dropped or
  // misconfigured cron job instead of reporting it as a passing connection.
  if (cronFailures > 0) process.exit(1)
}
