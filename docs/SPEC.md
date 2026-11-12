# Flagpole: Specification

> Hand this file to the coding agent as the project brief. Save it in the repository as `docs/SPEC.md`.

## 1. Product

**What it is.** A self-hosted feature flag service: an admin dashboard to create flags per
environment, targeting rules and percentage rollouts, an evaluation API, and a React SDK that reads
flags in the browser.

**Who it is for.** Small teams and side projects that want gradual rollouts and kill switches
without a paid flag service.

**Privacy rule.** Evaluation contexts carry an opaque `key` plus non-identifying attributes
(plan, country, app version). Contexts are evaluated in memory and **never persisted**. The README
must tell users not to send emails or names as attributes.

## 2. Architecture

pnpm workspaces monorepo, Node.js 24 LTS, strict TypeScript.

```
flagpole/
├── apps/
│   ├── api/        # NestJS: admin API, SDK evaluation API, audit log
│   └── web/        # Next.js App Router admin dashboard
├── packages/
│   ├── evaluator/  # pure evaluation engine, shared by api and SDKs
│   ├── sdk-js/     # framework-agnostic client (fetch + cache + polling)
│   ├── sdk-react/  # <FlagpoleProvider>, useFlag, useFlags
│   └── shared/     # zod schemas and types
├── examples/react-app/
├── docker-compose.yml  # postgres
└── .github/workflows/ci.yml
```

PostgreSQL with Prisma. Redis is not needed in Phase 1.

## 3. Domain model (Phase 1)

| Model         | Key fields                                                                                                       | Notes                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `Project`     | id, name, slug                                                                                                   |                                                                    |
| `Environment` | id, projectId, key (`development`, `staging`, `production`), clientSdkKeyHash, serverSdkKeyHash                  | Keys shown once on creation                                        |
| `Flag`        | id, projectId, key (unique per project), type (`boolean`, `string`), variations (jsonb), description, archivedAt |                                                                    |
| `FlagConfig`  | flagId, environmentId, enabled, offVariation, fallthrough (variation or rollout), rules (jsonb), version         | One per flag per environment; `version` increments on every change |
| `AuditEntry`  | id, actor, action, flagId, environmentId, before (jsonb), after (jsonb), createdAt                               | Append-only, written in the same transaction as the change         |

**Rule shape:** `{ id, clauses: [{ attribute, operator, values }], serve: variation | rollout }`.
Operators in Phase 1: `in`, `not_in`, `starts_with`, `ends_with`, `contains`, `semver_gte`, `semver_lt`.

**Rollout shape:** `{ buckets: [{ variation, weight }] }`, weights in basis points summing to 10 000.

## 4. Evaluation rules (packages/evaluator)

1. Flag archived or config missing → error result with reason `FLAG_NOT_FOUND`.
2. `enabled = false` → `offVariation`, reason `OFF`.
3. Rules in order; first rule whose clauses all match wins, reason `RULE_MATCH` with rule id.
4. Otherwise `fallthrough`, reason `FALLTHROUGH`.
5. Rollouts bucket with `murmurhash3(flagKey + "." + salt + "." + context.key) % 10000`, so the same
   key always lands in the same bucket and increasing a weight only moves users in one direction.

The evaluator is pure, returns `{ value, variationIndex, reason }`, and is tested with table-driven
tests plus a property test that 100 000 random keys distribute within ±1 % of the configured weights.

## 5. API (Phase 1)

Errors as `{ code, message }` (`FLAG_KEY_TAKEN`, `INVALID_ROLLOUT_WEIGHTS`, `STALE_FLAG_VERSION`,
`SDK_KEY_INVALID`).

| Method      | Path                                               | Auth           | Description                                                                        |
| ----------- | -------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `GET/POST`  | `/api/projects/:slug/flags`                        | Admin          | List / create flags                                                                |
| `GET/PATCH` | `/api/projects/:slug/flags/:key`                   | Admin          | Flag detail / edit metadata                                                        |
| `PUT`       | `/api/projects/:slug/flags/:key/environments/:env` | Admin          | Replace config; requires `expectedVersion` (optimistic lock, `409` on mismatch)    |
| `POST`      | `/api/projects/:slug/flags/:key/archive`           | Admin          | Archive                                                                            |
| `GET`       | `/api/projects/:slug/audit?flag=&env=`             | Admin          | Paginated audit log                                                                |
| `POST`      | `/sdk/v1/evaluate`                                 | Client SDK key | Body `{ context }`; returns all non-archived flags for that environment, evaluated |
| `GET`       | `/sdk/v1/flags`                                    | Server SDK key | Raw configs for server-side local evaluation, with `ETag`                          |
| `GET`       | `/health`                                          | None           | Liveness                                                                           |

Phase 1 admin auth: single admin password (hash in `ADMIN_PASSWORD_HASH`), HttpOnly session
cookie, `actor` in audit entries is `admin`. CORS for `/sdk` is restricted to origins configured per
environment.

## 6. Dashboard (Phase 1)

- Flags list per project with environment tabs, on/off toggle (with confirmation in production), search.
- Flag editor: variations, rules builder, rollout slider with live percentage preview, diff preview before saving.
- "Test a context" panel that runs the evaluator in the browser and shows the reason.
- Audit log page with before/after diff.
- Loading, empty, error and conflict (stale version) states.

## 7. React SDK (Phase 1)

```tsx
<FlagpoleProvider
  clientKey="..."
  apiUrl="..."
  context={{ key: userId, plan: 'pro' }}
>
  <App />
</FlagpoleProvider>;

const showNewCheckout = useFlag('new-checkout', false);
```

- Fetch on mount and on context change, poll every 30 s (configurable), keep last values on error.
- `useFlag(key, defaultValue)` never throws and returns the default until loaded.
- SSR-safe: accepts `initialFlags` for Next.js server rendering.
- Tests with React Testing Library and MSW.

## 8. Phase 1 build order (commit after each step)

1. Repo hygiene: LICENSE, README skeleton, `.gitignore`, `.env.example`, pnpm workspace, lint/format/TS, CI.
2. `packages/evaluator` with table-driven and distribution tests.
3. Prisma schema, migration, seed with a made-up demo project and flags.
4. Admin API with optimistic locking and transactional audit log; integration tests against real Postgres.
5. SDK evaluation endpoints with SDK key auth and CORS; tests.
6. `sdk-js` and `sdk-react` with tests; `examples/react-app` using a flag.
7. Dashboard pages and states.
8. Playwright E2E: create a flag, add a rule, see the example app change.
9. README complete, ROADMAP.md, `docs/ISSUES.md`.

**Stop after step 9.** Do not publish packages and do not implement roadmap items.

## 9. Roadmap (write to ROADMAP.md and docs/ISSUES.md, do not implement)

Each item needs a title, problem, scope and acceptance criteria.

1. Publish `sdk-js` and `sdk-react` to npm with changesets and provenance.
2. Server-sent events streaming instead of polling.
3. Node server SDK with local evaluation from `/sdk/v1/flags`.
4. Segments: reusable groups of rules.
5. Scheduled changes (turn on at a date and time).
6. Multi-user auth with roles (viewer, editor, admin) and per-environment approvals for production.
7. Flag prerequisites (flag A requires flag B on).
8. Stale flag detection (no evaluations in 30 days) using aggregated, anonymous counters.
9. Webhooks on flag change.
10. Import and export flags as JSON between environments.
11. OpenFeature provider for the JS SDK.
12. Rate limiting on the SDK endpoints.
13. Load test: 1 000 evaluations/s with p95 under 20 ms.
14. Docker image and deploy guide.

## 10. Repository rules (apply to all work)

- **License:** MIT, `Copyright (c) 2026 fernandaquerino`, in `LICENSE` at the root.
- **README:** what it does, who it is for, privacy rule for contexts, stack, how to run, how to test, status, link to ROADMAP.md.
- **Secrets:** never commit secrets. Only `.env.example` with placeholders; `.env*` (except `.env.example`) in `.gitignore`.
- **Data:** only made-up sample data. No real personal or customer data.
- **Git:** commit after each completed step with Conventional Commits. Do not squash, rewrite history, backdate commits or force-push. Use the git identity already configured on the machine.
- **Quality gates before each commit:** lint, typecheck, tests and build pass. Report only commands that were actually run.
- **Scope:** small, focused files; no business logic in controllers; no `any` or `@ts-ignore` without a written reason.
