# Kadi project instructions

Kadi is an online multiplayer card game for 2 to 6 players, with group text chat per room.

## Stack

- Front end: Next.js App Router, TypeScript, and Tailwind; mobile-first. Located in `apps/web`.
- Server: Next.js route handlers in `apps/web`, deployed to Vercel and backed by Supabase Postgres. There is no Socket.IO server.
- Shared rules engine: pure TypeScript in `packages/engine`, used by both the client and server.

## Required practices

- The server is authoritative. Clients send intents only and never decide whether an action is legal.
- Use zod to validate every payload.
- Before changing any code, read and follow `docs/RULES.md`, `docs/SECURITY.md`, and `docs/LAUNCH.md`.
