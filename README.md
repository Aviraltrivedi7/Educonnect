# Educonnect Implementation Workspace

This project upgrades the supplied Educonnect frontend prototype into a full-stack education operations workspace. The original archive and the earlier audit report are preserved as references; this workspace contains the implementation path.

## Development commands

| Command | Purpose |
|---|---|
| `pnpm install --no-frozen-lockfile` | Synchronize full-stack dependencies after capability upgrades. |
| `pnpm run dev` | Start the Express, tRPC, OAuth, and Vite development service. |
| `pnpm run check` | Run TypeScript validation. |
| `pnpm test` | Run Vitest tests. |
| `pnpm run build` | Build the client and server bundle. |
| `pnpm drizzle-kit generate` | Generate SQL after a deliberate schema change. |

## Environment contract

The managed workspace supplies `DATABASE_URL`, `JWT_SECRET`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID`, and Forge integration variables. Do not add `.env` files or commit secrets. Authentication uses the built-in OAuth callback and session cookie. The server reads the active authenticated user from request context.

## Migration safety

Schema updates follow one rule: update `drizzle/schema.ts`, generate SQL, read the migration, apply only reviewed SQL, then verify tables and application queries. Destructive operations such as `DROP`, data-losing `ALTER`, or unenforced bulk changes require a backup, an explicit user approval, and a rollback plan. Timestamps are persisted in UTC and localized only in the UI.

## Authorization model

`user` is the framework-compatible student role. `teacher` can author and manage instructional workflows. `admin` can initialize a school workspace, manage roles, review audit events, and request backup jobs. Client navigation is role-aware, but every protected write operation repeats authorization on the server.

## AI boundary

The study-plan assistant is server-side only. It discovers an available managed model at runtime, creates an optional low-risk study-plan draft, stores the prompt version and output in `aiRuns`, and keeps the draft at `pending` until an administrator accepts or rejects it. Learners see only their accepted plans. The assistant must not be used for grading, admissions, eligibility, diagnosis, risk scoring, or other high-impact decisions.

## Production follow-up

| Area | Implemented behavior | Operator follow-up |
|---|---|---|
| OAuth and sessions | Managed OAuth completes at the supplied callback and protected routes use the signed session cookie. | Confirm the production redirect origin remains registered. Test sign-in, sign-out, and an unauthenticated protected route after publishing. |
| Database migrations | Migrations `0000` through `0003` define the platform schema, including the `schoolInvites` table. | For every future schema change, generate SQL, review it, apply it once, and verify table/index state before deploying application code. |
| School membership | An admin can generate a seven-day, one-time invite for a student, teacher, or additional administrator. An unassigned authenticated account can redeem it once; unused codes can be revoked. | Share invite codes only through approved school channels. Revoke an exposed unused code immediately; do not send codes in public posts. |
| Learning resources and submissions | Assignment attachments and lesson resources are uploaded through the authenticated `/api/educonnect/uploads` route into managed storage. The route allows PDF, TXT, DOCX, PNG, JPEG, and WEBP files up to 8 MB. | Confirm retention, acceptable-use, malware-scanning, and student-data policies before using attachments with real learners. |
| AI study plans | A generated study-plan draft is stored pending admin review; accepted plans are visible only to the requester. | Designate reviewers, document approval criteria, and periodically audit `aiRuns` plus audit-log events. |
| Backup and export artifacts | Admin actions generate school-scoped JSON backups and JSON/CSV reports, transition the record through lifecycle states, store the artifact in managed storage, and present a download only after it is ready. | Test restoration from a downloaded backup in a separate non-production environment before adopting a recovery policy. |
| Assessment outcomes | Attempt scores are durable; teachers can add feedback, learners can view their own outcomes, and notification links open the relevant workspace section. | Establish assessment-review turnaround standards and confirm staff feedback is appropriate before it is saved. |
| Staff communication | Teachers and administrators can send scoped notifications to school members and see whether each recipient has read updates they created. | Use the sent-state view for follow-up, but avoid putting sensitive content in notification bodies. |
| Validation and delivery | `pnpm run check`, `pnpm test`, and `pnpm run build` pass; GitHub Actions runs the same checks. The production bundle is split into React core, data, Radix, icon, UI, application, and general vendor chunks. | Run the CI workflow from the connected repository and perform a real three-role acceptance test after publishing. |

## Accessibility checks

The protected workspace uses native buttons, labelled fields, visible focus styles from the UI system, a keyboard skip link to the main content region, an announced loading status, labelled mobile navigation, and responsive desktop/mobile verification.

The final implementation audit verified the skip link and `role="status"` live announcement, **52** explicit labels or accessible names, and **34** form controls across the application pages. The mobile and desktop previews were reviewed after the responsive navigation work. Before a school-wide launch, complete a manual keyboard-only acceptance run for every student, teacher, and administrator flow, and include assistive-technology testing with the school’s supported browser/device mix.

> **Important:** This workspace is intentionally not published automatically. Create or review a checkpoint, then use the project interface’s **Publish** control when you are ready to release it.
