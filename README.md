# Flagpole

Self-hosted feature flags for small teams and side projects. Gradually release features and use kill switches without a paid flag service.

## Privacy

Evaluation contexts use an opaque `key` and non-identifying attributes. **Never send emails, names, or personal data.** Contexts are evaluated in memory and never persisted.

## Stack

Node.js 24, pnpm workspaces, strict TypeScript, NestJS, Next.js, PostgreSQL, Prisma, React.

## Development

Use Node.js 24 and pnpm 10. Run `pnpm install`, then `pnpm build`.
Run `pnpm check` for lint, typechecking, tests, and builds.

## Status

Phase 1 implementation in progress. The build contract is in [docs/SPEC.md](docs/SPEC.md). Planned follow-up work will be documented in ROADMAP.md.
