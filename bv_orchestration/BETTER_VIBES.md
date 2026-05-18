# BetterVibes — Project Conventions

This project uses BetterVibes for human-reviewed, task-based code
orchestration. Tasks are written by humans (or generated from PRDs), worked
by an Agent SDK worker subprocess, reviewed at each iteration, and either
greenlit or redlit by the reviewer. This file is the single source of truth
for the project's BV conventions and the operator-side procedure for
running, reviewing, and resuming tasks.

## Layout

`bv_orchestration/` is this project's BetterVibes root. Everything BV
touches lives under it.

```
bv_orchestration/
├── BETTER_VIBES.md                           # this file
├── plans/                                    # PRD-derived task plans (workpapers between PRD and task)
│   └── <plan-name>.md
├── tasks/
│   ├── new/                                  # tasks waiting to run
│   │   └── T-NN-YYYY-MM-DD.md
│   ├── stage/                                # tasks in flight (one or more worker reports attached, awaiting greenlight)
│   │   └── T-NN-YYYY-MM-DD.md
│   └── done/                                 # greenlit tasks
│       └── T-NN-YYYY-MM-DD.md
├── logs/
│   └── worker-reports/                       # every worker report ever produced, red and green
│       └── WR-NN-<feature-slug>-YYYY-MM-DD.md
└── checkpoint.sqlite                         # LangGraph runtime state (gitignored)
```

## Task lifecycle

A task has one location at a time. It can accumulate multiple worker reports
(1:M).

1. **new** — task spec is written to `tasks/new/`.
2. **stage** — `bettervibes run T-NN` moves the task to `tasks/stage/`,
   delegates to a worker, and produces a worker report under
   `logs/worker-reports/`. The task's `worker-reports` frontmatter array
   accumulates a reference to each report.
3. **done** — on greenlight, the orchestrator moves the task to
   `tasks/done/`. Reports stay in `logs/worker-reports/` regardless of
   color.

A redlight does not move the task; it stays in `stage/` and the array grows
on the next run.

## PRDs

Tasks reference their source PRD via the `prd-source` frontmatter field — a
filesystem path relative to project root. This project keeps PRDs at
`docs/prds/PRD-NN-<slug>-v<n>.md`.

## Task template

Tasks live in `bv_orchestration/tasks/{new,stage,done}/T-NN-YYYY-MM-DD.md`
and follow the shape below. The frontmatter is required; body sections are
optional unless noted.

```
---
author: <"Joseph, as told to <AI-Model>" | "<AI-Model>, from <prd-source>">
date: YYYY-MM-DD
prd-source: <path relative to project root, e.g., docs/prds/PRD-NN-<slug>-v1.md>
worker-reports: []
status: new | stage | done
idempotency_check: false
---

# Task: <slug>

<One-paragraph description of what the task is and why. Reads like a
self-contained brief — a worker can act on this without external context
beyond the PRD reference.>

## Boundary

*Optional. The task's positive scope. Tag each segment by kind: `flow:`
temporal endpoints, `span:` topological endpoints, `io:` input/output
endpoints, `covers:` atomic shorthand. Atomic tasks may use `covers:` only.*

- covers: <noun phrase for atomic tasks>
- flow: from <event> to <event>
- span: from <component> to <component>
- io:   from <input> to <output>

## Acceptance Criteria

*Optional. Concrete, verifiable conditions. The worker reports against these
in `## Acceptance Criteria Status` in its report.*

- <criterion>
- <criterion>

## Touches

*Optional. Files or modules expected to change.*

- `path/to/file.ts`
- `path/to/another.ts`

## Spec Sections

*Optional. PRD section references.*

- §<n.m> (<slug>)

## Out of Scope

*Optional. Explicit anti-list. Anchor each entry to its source in the PRD
(rejected alternative, deferred direction, future-conversation item).*

- <item> (<source reference>)

## Dependencies

*Optional. Task ids that must complete before this one can run.*

- T-NN, T-NN

## Ambiguities to Resolve

*Optional. Decisions the worker must make and log when the PRD does not
resolve a choice the task faces. Each entry cites the PRD section.*

- §<n.m> — <ambiguity to be decided and logged>
```

## CLI

```
bettervibes init                                   # one-time per project
bettervibes run <T-NN> [--include <path1> [<path2> ...]]
bettervibes resume < <resume-json>
```

- `bettervibes init` creates `bv_orchestration/`. Refuses if already
  initialized in cwd or any ancestor.
- `bettervibes run <T-NN>` starts a task. From anywhere inside the project
  tree the walk-up resolver finds `bv_orchestration/`. `--include <path>`
  attaches extra files (PRD, conventions, schemas) to the orchestrator's
  prompt; paths resolve against the project root and ENOENT fails the run
  with `Include file not found: <path>`.
- `bettervibes resume` reads a single decision JSON from stdin.
- `--project-root <path>` works on any subcommand to operate from outside
  the tree.

Coarse events on stdout (one per invocation, then the process exits):

| Event | Shape |
| ----- | ----- |
| `human_review` | `{"status":"interrupted","interrupt":"human_review","task_id":"T-NN","iteration":N,"report_path":"bv_orchestration/logs/worker-reports/WR-NN-<slug>-YYYY-MM-DD.md"}` |
| `clarify` | `{"status":"interrupted","interrupt":"clarify","task_id":"T-NN","question":"…"}` |
| `done` | `{"status":"done","task_id":"T-NN","iterations":N}` |
| `no_active_task` | `{"status":"no_active_task","message":"…"}` — `resume` was called with no pending interrupt; treat as a no-op for the user. |

Fine events (mid-run, do **not** end the process):

- `permission_request` → answer with a `permission_response` line on the
  run process's stdin without exiting.

Exit codes: `0` on success or coarse interrupt, `1` on runtime error, `2` on
argv/stdin protocol error or `no_active_task`.

## Operator workflow

This procedure applies when the user asks to run, resume, or review a task.

1. **Confirm the task id and PRD.** Verify
   `bv_orchestration/tasks/new/T-NN-*.md` exists. Read the top of the file
   to inspect its frontmatter — `prd-source:` names the PRD the task was
   generated from. **Pass that path to `--include`** when starting the run
   so the orchestrator has the source-of-truth context. Include any
   additional references the body lists (schemas, conventions). If the
   user gave an ambiguous task reference, ask before proceeding.

2. **Start the run as a background task.** Use the Bash tool with
   `run_in_background: true`:

   ```
   bettervibes run T-NN --include <prd-source-path> [<other-paths>...]
   ```

   Never start a run without the spec named in the task's frontmatter.
   Note the returned task id and output file path. Do **not** run in the
   foreground — the orchestrator interrupts via JSON events on stdout, and
   human-review steps can take a long time.

3. **Arm a Monitor on the output file.** Tail the output with a filter for
   the events you act on, so each interrupt arrives as a notification:

   ```
   tail -f <output-file> | grep -E --line-buffered "human_review|clarify|done|no_active_task|permission_request|error|Error|ERROR|failed|FAILED"
   ```

   Set `persistent: true` so the monitor lives for the whole run.

4. **Handle each event in natural language.**
   - `human_review` → read the `report_path` file, summarize the staged
     report, run verification (see below) if signals warrant it, and ask
     greenlight or redlight.
   - `clarify` → relay the orchestrator's question and wait for the
     user's answer.
   - `permission_request` → surface the tool + args, ask the user, and
     write the response to the **run process's** stdin (not a fresh
     `resume` invocation):

     ```json
     {"kind":"permission_response","request_id":"r-…","decision":"allow"}
     ```

     Valid decisions: `allow`, `deny`, `allow_session` (approves that
     tool for the rest of this process; does not survive `resume`).
   - `done` → confirm completion. On greenlight the graph has already
     moved the task spec from `tasks/stage/` to `tasks/done/` and cleared
     the checkpoint thread automatically. Reports never move — they live
     permanently in `logs/worker-reports/` regardless of color.
   - `no_active_task` → tell the user there's nothing in flight; suggest
     `bettervibes run <T-NN>` to start.

5. **Resume by piping a decision JSON to `bettervibes resume`.**
   - Greenlight: `echo '{"decision":"greenlight"}' | bettervibes resume`
   - Redlight:  `echo '{"decision":"redlight","feedback":"<text>"}' | bettervibes resume`
   - Clarify:   `echo '{"decision":"clarify","answer":"<text>"}' | bettervibes resume`

   `feedback` and `answer` must be non-empty.

6. **Clean up the background tasks** on `done` (or abort).
   - `TaskStop` the Monitor task id. The `bettervibes run` Bash task
     usually exits on its own at `done`, but if it is still alive, stop
     it too.
   - Do not leave the monitor armed across sessions — its filter will
     keep firing on stale lines.

## Verification at greenlight

The worker can write tests without running them, claim "tests pass" without
executing them, and invent passing acceptance criteria. Trust nothing in
the staged report that has an executable counterpart — verify it on the
human-review side.

**When to verify.** Run verification before greenlighting if any of these
appear in the staged report or the changed files:

- New or modified test files (`*.test.ts`, `*.test.tsx`, `*.spec.ts`,
  `__tests__/` additions).
- A new `package.json` or modified dependencies in an existing one.
- The report claims "tests pass", "all tests passing", "verified", or
  similar.
- A new package directory was created (e.g., `functions/`, a new
  workspace).

If none of these signals appear (docs-only, rules-only, config-only tasks),
skip verification and judge the report on its own.

**What to run.** Inside each affected package:

```
npm install      # only if node_modules/ is missing
npm test         # always, when verification is required
```

If the package uses a different runner (Vitest, Bun test), use the script
the package's own `test` field points at — do not invent commands.

**What to do with the result.**

- **Tests pass** → proceed to summarize and ask for greenlight as usual;
  mention that verification ran clean.
- **Tests fail or `npm install` errors** → do not greenlight. Surface the
  failure with the exact error output and ask whether to redlight (sending
  the failure as feedback) or attempt a manual fix.
- **No tests were actually written, despite the report claiming coverage**
  → redlight with feedback naming the gap.

Verification lives on the human-review side, not in the worker's
instructions, because the worker can be told to run tests and ignore the
instruction. The human-review checkpoint is the one place that cannot be
deceived.

## Anti-patterns

- **Starting a run without `--include`-ing the PRD named in the task
  frontmatter.** Read the top of the task file first; whatever the
  `prd-source:` field points to must be passed to `--include`. Skipping
  it strips the orchestrator of source-of-truth context.
- **Running `bettervibes run` in the foreground.** Human-review interrupts
  can sit for minutes or hours. Always background it.
- **Polling the output file with sleep loops.** Use a Monitor — each new
  event becomes a notification automatically.
- **Forgetting to stop the Monitor on `done`.** A persistent monitor stays
  armed across the rest of the session and keeps firing on stale lines.
- **Resuming without reading the staged report.** Always read
  `report_path` before summarizing or asking for a decision — the user is
  trusting that summary to greenlight.
- **Inventing decision shapes.** Only the three documented JSON forms are
  valid (`greenlight`, `redlight` + `feedback`, `clarify` + `answer`).
  `feedback` / `answer` must be non-empty.
- **Manually moving task specs `stage/` → `done/` on greenlight.** The
  graph promotes specs automatically and clears the checkpoint thread;
  doing it by hand causes `push target exists` errors on the next
  greenlight.
- **Manually moving worker reports.** Reports never move on greenlight;
  they stay in `bv_orchestration/logs/worker-reports/` permanently
  regardless of color.
- **Spawning `bettervibes resume` for a `permission_request`.** Permission
  responses go on the run process's stdin, not a fresh resume invocation.
- **Deleting `bv_orchestration/checkpoint.sqlite` without asking.** That
  nukes orchestrator state for the project. Confirm first.

## Authentication

BV uses the Claude Agent SDK, which reads `CLAUDE_CODE_OAUTH_TOKEN` from the
environment.
