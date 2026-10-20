# Next Codex task - validation only

Read AGENTS.md, PROJECT.md, docs/DATABASE_DESIGN.md and docs/DATABASE_SETUP.md. Review the new initial SQL migration against the existing domain models and booking rules.

For this milestone only, validate the migration in a disposable LOCAL Supabase database and run its pgTAP tests and database linting. Inspect the Auth-to-profile trigger, database permissions, score checks, and overlapping-booking constraint. Fix only issues needed for this milestone and document changes.

Do not apply anything to the cloud, implement API endpoints, replace the mock repository, refactor the UI, or commit/push. If local prerequisites are missing, report them and stop rather than switching to the live database. Report checks actually run and update IMPLEMENTATION_STATUS.md, then stop.
