# Changesets

This directory holds [Changesets](https://github.com/changesets/changesets)
declarations — small markdown files that describe how a change affects the
released version of `jerling.org`.

## Why this exists

Releases of `jerling.org` are produced by `.github/workflows/release.yml`. The
workflow needs to know two things to ship a release:

1. What version number to assign (`v1.0.0`, `v1.0.1`, ...).
2. What to write in the changelog so a future reader can tell what changed.

Changesets answers both. Each contributor declares the impact of their change
alongside the code, and the release workflow aggregates declarations into a
single version bump and changelog entry.

## How to add a changeset

When your PR makes a user-visible change, run:

```
npx changeset
```

The CLI asks for a bump type (`patch`, `minor`, or `major`) and a one-line
summary. It writes a file like `.changeset/quiet-foxes-dance.md`. Commit that
file with your PR.

Bump-type guidance (SemVer):

- `patch` — bug fixes, typo fixes, copy tweaks.
- `minor` — new content or pages, backward-compatible additions.
- `major` — incompatible changes to URLs, removed pages, or layout that breaks
  inbound links.

If your PR is internal-only (CI tweak, refactor, dependency bump with no
user-visible effect), you do not need a changeset.

## What happens after merge

When your PR merges to `main`, the release workflow opens (or updates) a PR
titled "Release: version packages". That PR aggregates all pending changesets
into a single bump of `package.json` and a new entry in `CHANGELOG.md`, then
deletes the consumed changeset files. Merging that PR is what triggers the
actual release.
