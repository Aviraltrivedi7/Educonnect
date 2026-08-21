# Administrator Acceptance and Refined-Control Evidence

## Real persisted-data acceptance workflow

The automated acceptance test in `server/admin-acceptance.test.ts` creates an isolated school with a real administrator and teacher record in the managed database. It then persists a saved comparison view, enables a seven-day password-protected share link, verifies that missing and incorrect passwords return `password_required`, and verifies that the correct password returns the ready-only view payload.

The same test persists a teacher reminder template, submits it to the administrator queue, rejects it using a meaningful comment, and verifies both the stored rejection comment and the teacher’s generated in-app notification body. The cleanup hook removes the temporary school, users, templates, views, notifications, preferences, and audit records. The subsequent database check returned zero temporary schools, comparisons, templates, and notifications.

## Refined administrator controls

The protected comparison panel now includes a show/hide password toggle, an inline quick-copy icon beside an active link, and the existing full Copy link action. The review card now locks inputs during a rejection mutation, uses a spinner and `Submitting…` label, announces that feedback and the teacher notification are being sent, and renders a success status after completion in addition to the success toast.

## Responsive inspection

Authenticated administrator dashboard captures were completed on a 1280 × 720 desktop viewport and a 375 × 812 mobile viewport. The administrator-only collaboration, monthly audit, revocation, and review sections remained accessible in the complete dashboard layout. On mobile, these panels stacked without horizontal clipping. The temporary acceptance records are intentionally absent from the visible workspace after cleanup; their persisted workflow is covered by the managed-database acceptance test described above.

## Validation result

The final validation run completed successfully: strict TypeScript checking, the 17-test suite (including the real-data acceptance test), and the production build all passed.
