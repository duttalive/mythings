# Contributing to mythings

Thanks for helping! mythings aims to stay small, fast and calm, so contributions follow a simple rule: **bug fixes are welcome straight away; features start with an issue.**

## Before you start

- **Bugs:** [open a bug report](https://github.com/duttalive/mythings/issues/new?template=bug_report.yml), or send a pull request with the fix and a test that fails without it.
- **Features and larger changes:** [open a feature request](https://github.com/duttalive/mythings/issues/new?template=feature_request.yml) first and wait until the approach is agreed. This saves you from writing code that doesn't fit the product. [SPEC.md](SPEC.md) describes the design and §15 lists ideas already considered.
- **Security issues:** never in public issues. See [SECURITY.md](SECURITY.md).

## Setting up

Follow [Run it locally](README.md#run-it-locally) in the README. In short:

```bash
corepack pnpm install
cp .dev.vars.example .dev.vars
corepack pnpm db:migrate:local
corepack pnpm dev
```

## Making a change

1. Fork the repository and create a branch from `main`.
2. Make your change, following the conventions in [CLAUDE.md](CLAUDE.md). The main ones:
   - Sizes are in `rem`, never `px` font sizes; colours come from the theme variables in `src/styles.css`.
   - On phones, rows are at least 44px tall (`pointer-coarse:`) and fields at least 16px.
   - Shared logic (schemas, dates, views) lives in `shared/` and is used by both client and server.
   - D1 schema changes are a **new** numbered file in `worker/db/migrations/`; Durable Object schema changes are appended to `worker/do-migrations.ts`. Never edit a migration that has shipped.
   - Account flows must not reveal whether an email has an account.
3. Add or update tests: worker behaviour in `tests/worker/`, client logic in `tests/client/`, shared code in `tests/shared/`, and user flows in `e2e/`.
4. Run the checks:

   ```bash
   corepack pnpm lint
   corepack pnpm typecheck
   corepack pnpm test
   corepack pnpm e2e
   ```

5. Write commit subjects as user-facing changes ("Show or hide your password while typing it", not "fix PasswordInput"). Release notes are generated from them.
6. Open a pull request and fill in the template. Keep it focused on one change.

Maintainers handle versions, the changelog and releases (`pnpm release`), so please don't bump the version or edit `CHANGELOG.md` in your pull request.

## Licensing of contributions

mythings is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).

By submitting a contribution (code, documentation, or other material) to this repository, you agree that:

1. you have the right to submit it, and it is your original work or you have permission to contribute it under these terms;
2. your contribution is licensed under AGPL-3.0-only, the same as the project; and
3. you grant the project maintainer (Akaash Dutta) and their successors a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, modify, sublicense and distribute your contribution under other license terms as well, including proprietary or commercial ones.

You keep the copyright to your contribution. The pull request template asks you to confirm this.

## Code of Conduct

Everyone taking part in this project is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
