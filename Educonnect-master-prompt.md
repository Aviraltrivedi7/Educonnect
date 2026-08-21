# Educonnect Master Implementation Prompt

You are a senior full-stack product engineer. Continue the existing Educonnect React + TypeScript + Vite + Tailwind + shadcn frontend without rewriting the visual language unnecessarily.

## Repository reality

- The UI already has student, teacher, admin, auth, course, assignment, schedule, reporting, settings, and dashboard routes.
- Current data is local/static. There are no API calls, no database adapter, no auth/session implementation, and no browser persistence.
- Preserve the existing route structure and reusable UI components where they are sound, but replace demo-only behavior with real domain services.
- Do not treat hardcoded dashboard metrics, seeded users, example.com video URLs, toast-only saves, console.log submissions, or simulated backup timers as production behavior.

## Goal

Turn the current frontend prototype into a production-ready educational platform with secure role-based access, persistent data, real learning delivery, teacher operations, admin governance, analytics, and carefully scoped AI assistance.

## Required implementation order

1. Define the product contract and domain model for School, User, Role, Course, Module, Lesson, Enrollment, Assignment, Submission, Grade, Exam, Question, ScheduleEvent, MistakeEntry, Notification, Conversation, Report, AuditLog, and BackupJob.
2. Add a backend and database integration using the project’s approved full-stack conventions. Store secrets only in environment variables. Add migrations and seed only non-user demo content when explicitly approved.
3. Implement authentication: signup, login, logout, password reset, session refresh, protected routes, role guards, and server-side permission checks. Never trust a client-only role prop.
4. Add typed API/service functions for every domain operation. Return loading, empty, validation-error, permission-error, and server-error states in the UI. Do not call APIs directly from many components; centralize the data layer.
5. Replace static course data with database-backed courses, modules, lessons, resources, enrollments, and progress events. Replace example.com video URLs with a real media/storage strategy. Implement lesson completion, resume position, quiz attempts, grading, and discussion persistence.
6. Make teacher workflows transactional: create/update/publish assignments and exams, accept submissions, grade with validation, show student progress, and persist communications/notifications.
7. Make admin workflows real: user/course/schedule/academic CRUD, permission management, audit log, persisted settings, real report queries, export/print, and backup/restore through server-side jobs and storage.
8. Define analytics events and metrics before building charts. Use server-computed metrics with date filters, role filters, empty states, and data freshness labels. Do not present invented numbers as live analytics.
9. Integrate AI only behind explicit service boundaries. Add prompt/version logging, privacy controls, rate limits, fallback states, human review for high-impact recommendations, and clear labels that generated suggestions are advisory.
10. Fix the current navigation gaps: either implement routes for `/features`, `/about`, `/blog`, `/careers`, `/contact`, `/demo`, `/faq`, `/help`, `/pricing`, `/privacy`, `/terms`, `/forgot-password`, `/settings`, and `/logout`, or remove/repoint those links. Ensure every role shell has an escape route and correct settings/logout destination.
11. Improve engineering quality: remove lint errors and unsafe `any` types, add unit/component tests for auth guards, forms, course progress, quiz grading, permissions, and admin operations, add CI scripts, update stale dependencies intentionally, and split the large bundle with route-level lazy loading.
12. Preserve accessibility and responsive behavior: keyboard navigation, labels, focus states, semantic tables, error announcements, contrast, reduced-motion support, and mobile layouts.

## Acceptance criteria

- A new user can sign up, log in, log out, reset a password, and see only the routes allowed by their role.
- Student course progress, mistakes, assignments, quiz attempts, and schedule survive refresh and are isolated per user.
- Teacher-created assignments/exams and grades are persisted and visible to the correct students.
- Admin changes, backups, reports, and settings are server-backed, permission-checked, auditable, and recoverable.
- Every chart is based on a documented query/metric, shows loading/empty/error states, and never implies that sample data is live.
- `npm run build`, `npm run lint`, and the test suite pass in CI.
- No placeholder copy remains in primary learning, grading, auth, analytics, backup, or communication flows.

## Deliverables

- Updated source code and migrations.
- Environment variable documentation with no secrets committed.
- API/domain documentation and permission matrix.
- Test coverage summary.
- A short migration note explaining which existing UI modules changed from demo to real behavior.
