# Domain Docs

How the engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: this repo's glossary. Where a skill says `GLOSSARY.md`, read this file.
- **`docs/adr/`**: ADRs that touch the area you're about to work in.
- **`docs/specs/beta-aberto.md`**: the living spec. It overrides `docs/specs/mvp.md` and older ADRs where they differ.

The repo is one context, even though it is a monorepo: there is one glossary and one ADR folder.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a test name), use the term as defined in `CONTEXT.md`. If the concept isn't there yet, either you're inventing language or there's a real gap: a new term goes into `CONTEXT.md` in the same PR.

## Flag conflicts

If your output contradicts the spec, an ADR or `CONTEXT.md`, don't decide: ask. See `AGENTS.md`.
