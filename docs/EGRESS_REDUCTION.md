# Database traffic and the 5 GB budget

The 11 November investigation measured about 762 KB leaving Supabase for each TV refresh. A TV left on all day refreshes 2,880 times, explaining roughly 2.2 GB/day. The owner confirmed Shared Pooler accounted for 99.9% of usage. Most of that data was private notifications and fixture audit history discarded before returning the TV response.

## What changed

- TV and public pages use a smaller SQL projection. It never fetches notifications, leave or join requests; excludes draft fixtures/seasons and private profile fields; retains only the event timestamps needed for result ordering; and fetches reserved bookings in the current London-day/seven-day window. Existing public allowlists still control the actual HTTP responses.
- Each API process holds at most two snapshots: public and full. PostgreSQL hashes the relevant rows and returns a small fingerprint. Only a changed fingerprint or cold process fetches another snapshot. Child tables, inserts, updates and deletions are included, including direct SQL changes and writes from other API instances. Public notifications/read receipts and outbox delivery attempts do not invalidate the public cache. The public booking window refreshes at London midnight, including BST.
- Authenticated reads validate Supabase identity and the current active application profile every time. Recipient filtering runs on a clone of the full cached snapshot. Signed photo URLs never enter that shared snapshot. Private HTTP responses remain `no-store`; this is server-side data caching, not a shared browser/CDN cache.
- Commands still read fresh state under the existing transaction/revision lock. They never validate mutations against the read cache. A read transaction checks its fingerprint and loads a miss in the same repeatable-read snapshot. Failed change checks fail the request rather than presenting unchecked cached availability as fresh.
- Foreground TV refreshes remain every 30 seconds. Hidden app/TV tabs pause polling and reload when visible/focused again; overlapping refreshes are suppressed. Clock/countdown updates still work. The database pool keeps idle connections for 90 seconds instead of 20, avoiding a new TLS handshake for every 30-second poll.
- Signed photo URLs are reused for up to four minutes, renewing before their five-minute expiry. Successful upload/removal invalidates the serving process's URL cache immediately. Other processes may show the previous photo until their URL cache refreshes; private Storage and upload permissions are unchanged.

## Measured comparison

One read-only transaction against the configured cloud database, with byte counters around each operation:

| Read | Supabase query-response bytes |
| --- | ---: |
| Original full snapshot | 761,901 |
| New public snapshot, cold cache | 123,208 |
| Unchanged public refresh | 164 |
| Second unchanged public refresh | 164 |
| Unchanged authenticated snapshot check | 164 |

Public and TV responses matched the original projections exactly for the measured data. Unchanged query-response traffic fell by about **4,646×**. The unchanged TV check alone projects to roughly **14 MB over 30 days**, instead of ~66 GB. This is not a whole-project billing forecast: it excludes connection/transaction overhead, cold starts, changed data, writes, Auth, Storage and additional API processes. Authenticated requests also perform an active-profile lookup. Each process warms independently; more cold starts increase cache misses. PostgreSQL still scans/hashes the small office dataset internally, trading modest database work for much less outgoing data.

The 5 GB limit is a project-wide operating target, not a guaranteed cap. Frequent writes still read full transactional state, and unusually high activity or many cold processes could need further optimization. Do not weaken authentication or remove audit/history records to reduce bytes.

## Rollout and verification

1. Review, commit and deploy the frontend **and API** together through the existing GitHub Actions workflow. No migration, Azure/Supabase environment setting, extra service or paid resource is required. No deployment was performed by this change.
2. Reload the TV. Open browser sessions should reload; installed PWAs should accept the offered update when convenient. The API improvement also benefits older client bundles because the endpoint contracts are unchanged.
3. Verify that a new booking/result/name change appears on the TV within the normal refresh interval, result approvals still update standings, and inactive accounts remain denied. Check across two sessions/devices.
4. Compare the next full 24-hour period of **Shared Pooler** usage with the previous daily baseline. Usage metrics lag; previously accrued usage does not disappear. Track multiple days, including a weekend with the TV left on, before treating the monthly budget as established.
5. If traffic remains high, check actual `/api/display`, `/api/public-state` and `/api/state` request counts, unexpected public callers, frequent worker restarts, other projects in the organization and write/automation activity. API responses can be small while Supabase-to-Azure traffic is larger; measure at the database boundary.

Implementation: `api/src/stateCache.ts`, `api/src/state.ts`, `api/src/service.ts`, `api/src/avatars.ts`, `src/app/LeagueProvider.tsx` and `src/pages/Display.tsx`. No migration or historical data deletion is involved. Rolling back these application files restores the previous behavior without a schema rollback.
