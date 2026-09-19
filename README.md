# auto-machines

A local daemon that runs Machines from registered ticket sources. Each source
owns its ticket format, dependencies, and result updates. Machines own the actual
workflow: implementation, research, reviews, repository safety, and cleanup.

The first adapter uses [tk](https://github.com/wedow/ticket)'s native Markdown
files. It does not require a second ticket database or a running `tk` process.
The daemon supports Linux and Node 24 or newer.

## Build from source

This checkout depends on the new Machines 0.3 host interface. Until that Machines
version is published, bootstrap against a local Machines checkout:

```sh
node scripts/install-local.mjs ../machines
npm run check
npm run build
node dist/src/cli.js help
```

The bootstrap script builds and installs a packed Machines package without saving
machine-specific paths in package metadata. After Machines 0.3 is available on
npm, ordinary `npm install` works. Neither package is published by these commands.

## Register a ticket source

Create `auto-machines.config.ts`:

```ts
export default ({ tk }) => [
  tk({
    id: "op",
    cwd: "./op",
    ticketsDir: ".tickets",
    defaultMachine: "research",
  }),
  tk({ id: "another-project", cwd: "./another-project" }),
];
```

`cwd` is relative to the configuration file; `ticketsDir` is relative to `cwd`.
Optional `agents` maps Machine roles to existing Agent preset names. Optional
`home` selects a Machines configuration home, relative to `cwd`. Otherwise normal
Machines global/project discovery applies. Restart to reload registrations.

One registration can cover a workspace containing several repositories. Put its
shared tickets in one directory, and include repository names or relative paths
in ticket input. The Machine decides how to work in those repositories.

Configuration and discovered Machine files are trusted executable code. Tickets
select exact catalog names; ticket-supplied file paths are not executed.

## Start and inspect

```sh
auto-machines start --config ./auto-machines.config.ts
auto-machines sources
auto-machines status
auto-machines status ATTEMPT_ID --json
auto-machines logs ATTEMPT_ID
auto-machines respond ATTEMPT_ID REQUEST_ID approve
auto-machines cancel ATTEMPT_ID
auto-machines retry ATTEMPT_ID
auto-machines stop
```

Use `node dist/src/cli.js` in place of `auto-machines` when working directly from
this checkout. `daemon --config ...` runs in the foreground for a service manager
or debugging. `start` detaches and returns after the local socket becomes ready.
All commands accept `--state-dir`; clients must use the daemon's state directory.
Add `--json` for compact machine-readable output.

State defaults to `$XDG_STATE_HOME/auto-machines`, or
`~/.local/state/auto-machines`. The directory contains the local control socket,
execution journal, singleton lock database, and background daemon log. Pending
Human questions and Agent observations are available through status and logs.
No credentials or home-directory paths are added to ticket files automatically.
Machine-authored summaries are written as supplied.

Closing a client does not stop runs. Stopping the daemon interrupts its runs and
terminates their ordinary owned subprocesses. Deliberately detached or otherwise
uncooperative processes retain Machines' existing lifecycle limitations.

## Tickets and eligibility

Use `tk` normally to create tickets and manage dependencies. Add optional fields
through your editor:

```yaml
---
id: op-123
status: open
deps: [op-100]
machine: implement
input:
  task: Add the new endpoint
  acceptanceCriteria:
    - The integration check passes
  repositories: [api, web]
  attachments: [designs/request.png]
agents:
  implementer: codex
---
# Add the endpoint

Further context, design notes, and acceptance criteria belong here.
```

Every unfinished, unblocked ticket is considered: both `open` and `in_progress`,
matching `tk` readiness. No automation label or concurrency limit exists.
Register only ticket sources you intend to automate. Tickets without a Machine
use the registration default; without either selection they show an error.
An invalid explicit Machine never falls back to the default.

Missing dependencies, cycles, malformed tickets, and invalid selections are
reported by `sources`. Other eligible work continues. Machine preparation checks
Agent bindings; each definition validates its own input shape before Operations.
Validation/import failures that happen before admission are reconsidered on a
later poll. A failed hosted attempt requires deliberate retry after fixing it.

A tk-backed Machine receives:

```ts
{
  ticket: { id, source, title, body, metadata },
  input: /* ticket input field, or null */
}
```

Paths in `input` are references, resolved by the Machine relative to its configured
workspace. The adapter neither copies attachments nor makes a text-only Agent
multimodal. A ticket's input is snapshotted for each attempt.

## Return a ticket outcome

Define the Machine's top-level XState `output` as one of these JSON objects:

```ts
{ action: "complete", summary: "Verified and approved." }
{ action: "hold", summary: "Research complete; a decision is needed." }
{ action: "route", machine: "implement", input: { task: "..." }, summary: "Ready to implement." }
```

`complete` appends the summary and closes the ticket. `hold` appends findings and
leaves it open without launching it again locally. `route` appends findings,
updates its Machine and optional input/agents, and creates a new execution request.
A missing or malformed outcome is retained as a writeback conflict; it never
closes the ticket. A Machine's final state alone is not a ticket outcome.

The adapter manages `auto-machines-request` for routed work and puts attempt
markers in result notes. Replaying a writeback does not append duplicate notes.
Ordinary edits and polling do not rerun an already-recorded request. Use `retry`
for deliberate re-execution of an eligible ticket, including a reopened ticket.

Ticket changes detected before writeback produce a visible conflict instead of
replacing newer content. Inspect the local result and reconcile the ticket; do
not rerun a completed Machine merely to publish its old result. Transient I/O
failures retry automatically, independently of execution. Brief metadata writes
serialize within the adapter; Machine runs remain parallel. Independent editors
and `tk` processes do not share that write queue, so simultaneous external edits
are still optimistic rather than a cross-process transaction.

## Recovery and multiple computers

The journal records an attempt before launch, and records its result before
updating tickets. Restart marks unfinished attempts interrupted and invalidates
old Human responses. It never automatically replays uncertain work. Inspect
prior effects before retrying; a retry is a new attempt, not workflow resumption.

Local deduplication covers one daemon state directory. Git moves ticket files;
it does not coordinate independent computers. Two computers can execute the same
eligible ticket. Use explicit work assignment or tracker-specific coordination
when needed. The daemon performs no repository locking, Git synchronization,
cleanliness checks, or automatic worktree creation.

## Custom sources

The exported `WorkSource` interface has three operations:

- `scan()` returns eligible items and optional diagnostic messages.
- `prepare(item)` rechecks eligibility and returns Machines launch parameters,
  or `undefined` if the item changed or is no longer eligible.
- `apply(report)` interprets a terminal execution report and updates the source.

Each item has a stable execution `key`, a stable ticket identifier in `label`, and
an opaque JSON `ref`. A new execution request needs a new key; changing unrelated
metadata must not generate one. `prepare` must not execute workflow effects.
Only exact discovered Machine names are accepted in its launch request.

`apply` must tolerate retries with the same `attemptId`. Throw `ReportConflict`
for invalid output or changes requiring intervention; ordinary errors retry.
A source owns its graph and output convention. A custom adapter can therefore
use GitHub or Beads without teaching the daemon those ticket schemas.

Configurations can return any conforming source alongside `tk(...)` registrations.
The exported `request` client lets a future MCP or Pi adapter use the same daemon;
the first version supplies CLI access rather than separate harness plugins.

## Demonstration and checks

Copy `examples/demo` into a temporary workspace, then start its configuration.
Its fake research Agent routes a ticket to a fake implementation Agent, which
asks for Human approval. Respond `approve` to close the ticket or `hold` to retain
it for attention. The demo uses no model credentials or network calls.

```sh
npm run check
npm run build
npm run smoke:package
npm run test:tk
```

The package smoke installs real tarballs into a temporary consumer and completes
the demo through the installed CLI. `test:tk` downloads pinned upstream commit
`194b71a8bbc3771da1ce9f579395937c976bbddc` and checks file interoperability. Other
tests use local fake runners and temporary tickets. Real agent workflows need
their harnesses and credentials configured explicitly.
