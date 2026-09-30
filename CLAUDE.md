<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Project notes

- Design source of truth: `inb-sh.pen` (encrypted — read it with the pencil MCP only). The dashboard
  mirrors it with HeroUI v3 components; exact colors live as overrides in `apps/web/src/styles.css`.
- Backend is one Cloudflare Worker (`apps/worker/src/index.ts`) exporting fetch/queue/scheduled and the
  `EndpointHub` Durable Object. D1 migrations are forward-only strings in `apps/worker/src/db/migrate.ts`
  and must stay in sync with `db/schema.ts`.
- Shared logic (conditions, templates, catalog) lives in `packages/shared` and is imported as TS source.
- Transforms are JSONata (Workers can't eval JS).
- Single stage (`production`), deployed from the dev machine with `pnpm run deploy`. Local dev is
  `pnpm dev` (wrangler + Vite); `apps/worker/wrangler.jsonc` is local-only and must mirror the bindings
  in `sst.config.ts` / `src/env.ts`.
