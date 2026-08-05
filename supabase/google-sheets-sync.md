# PropertyLedger → Google Sheets nightly backup

Copies all five data tables (Properties, Units, Tenants, Incomes, Expenses) into a
Google Sheet in your Drive every night, so you always have an Excel-friendly copy
that you can open anywhere — even if the site or database is unavailable.

**Files:**
- `google-sheets-sync.gs` — the Apps Script (paste into Google Apps Script editor)
- This guide

---

## One-time setup (≈ 10 minutes)

### 1. Get your Supabase keys
Open **Supabase Dashboard → Project Settings → API**. Copy three values:
- **Project URL** → `SUPABASE_URL`
- **anon / public key** → `ANON_KEY`
- **service_role key** (click *Reveal*) → `SERVICE_KEY`

> ⚠️ The `service_role` key bypasses security rules. It is **only** ever stored
> inside your private Google script — never share it and never put it in code
> that gets pushed to a repository.

### 2. Create the spreadsheet
1. Go to [sheets.new](https://sheets.new) (signed into the Google account you want the backup in).
2. Name it **PropertyLedger Backup** (or anything you like).
3. Leave it open.

### 3. Add the script
1. In the spreadsheet: **Extensions → Apps Script**.
2. Delete any starter code, paste the **entire contents of `google-sheets-sync.gs`**.
3. Fill in the three keys at the top of the file (the `CONFIGURATION` section).
4. Click **Save** (💾 icon), name the project **PropertyLedger Sync**.

### 4. First sync (test it)
1. In the Apps Script editor toolbar, run the function **`setupTabs`** → Authorize when prompted
   (choose your Google account, click **Advanced → Go to ProjectLedger Sync (unsafe)** → **Allow**).
   The authorization is Google's standard prompt for scripts that write to your spreadsheet.
2. Reload the spreadsheet. A new menu appears: **PropertyLedger Sync**.
3. Click **PropertyLedger Sync → ▶ Sync now**. A **Sync Log** tab appears with
   “All tables OK” and each tab fills with your data.
4. If any tab shows `ERROR`, open **Extensions → Apps Script → 🕒 Executions** to see the
   exact error (usually a wrong key, or the service_role key needs *Reveal*).

### 5. Schedule the nightly run
1. Back in the Apps Script editor, run the function **`installNightlyTrigger`** (toolbar) and authorize.
2. Done — the sync now runs automatically every day around **3:00 AM**, even when your
   computer is off (Google runs it in the cloud).

You can change the time by editing `atHour(3)` in `installNightlyTrigger`.

---

## Using it
- Open the spreadsheet anytime to browse your data (or **File → Download → .xlsx** for a
  real Excel file).
- The **Sync Log** tab shows the last sync time and row counts.
- To force a refresh any time: **PropertyLedger Sync → ▶ Sync now**.
- To re-run authorization or check failures: **Extensions → Apps Script → 🕒 Executions**.

## Troubleshooting
| Symptom | Fix |
|---|---|
| “Configuration incomplete” | Fill in the three keys at the top of the script and save. |
| `HTTP 401` | Wrong `SERVICE_KEY` — re-copy the **service_role** key (reveal it) from Settings → API. |
| `HTTP 404` | Wrong `SUPABASE_URL`, or tables not created (run `supabase/schema.sql`). |
| Sync runs but tabs are empty | `SERVICE_KEY` points at a different Supabase project. |
| Trigger not firing | Extensions → Apps Script → 🕒 Triggers (clock icon): confirm the time-driven trigger exists and is enabled. |

## Security notes
- The spreadsheet and script live **only in your Google account**.
- The `service_role` key lets the script read your entire database. If you ever share the
  spreadsheet, do **not** share the Apps Script project with anyone.
- This sync is a *read-only copy*. Changes you make in the sheet do **not** write back to
  the app — use the app for edits, or the encrypted Backup & Restore in Settings for
  full restores.
