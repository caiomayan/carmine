# Domain Docs

How the engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- **** at the repo root: this repo's glossary. Where a skill says , read this file.
- ****: ADRs that touch the area you're about to work in.
- ****: the living spec. It overrides  and older ADRs where they differ.

The repo is one context, even though it is a monorepo: there is one glossary and one ADR folder.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a test name), use the term as defined in . If the concept isn't there yet, either you're inventing language or there's a real gap: a new term goes into  in the same PR.

## Flag conflicts

If your output contradicts the spec, an ADR or , don't decide: ask. See .
