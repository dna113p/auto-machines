import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { github } from "../src/github.ts";
import { tk } from "../src/tk.ts";
import { startDaemon } from "../src/daemon.ts";
import { readTicket, ticket, until, workspace } from "./helpers.ts";

test("local and GitHub tickets share one hosted Machine and retain their own results", async (t) => {
  const root = await workspace(t);
  await ticket(root, "local-task", "machine: candidate\ninput:\n  repository: example\n");
  await writeFile(join(root, ".machines", "candidate.ts"), `
export const description = "Retains a candidate from either ticket source";
export default function ({ machine, operation, final }, envelope) {
  if (!envelope.ticket.id || !envelope.ticket.body || envelope.input.repository !== "example") {
    throw new Error("Both sources must supply the same task envelope");
  }
  return machine({
    initial: "work",
    output: () => ({ action: "hold", summary: "Candidate for " + envelope.ticket.source }),
    states: {
      work: operation(() => ({ type: "prepared" }), { prepared: "done" }),
      done: final(),
    },
  });
}
`);
  const issue = {
    id: 12345,
    node_id: "I_fixture_12345",
    number: 17,
    title: "GitHub task",
    body: "Implement the acceptance criteria.",
    state: "open",
    state_reason: null,
    labels: [{ name: "ready" }],
    html_url: "https://github.com/example/backend/issues/17",
    url: "https://api.github.com/repos/example/backend/issues/17",
    repository_url: "https://api.github.com/repos/example/backend",
    updated_at: "2026-09-19T00:00:00Z",
  };
  const comments: { id: number; body: string }[] = [];
  let scans = 0;
  const transport: typeof fetch = async (request, init) => {
    const url = new URL(String(request));
    const method = init?.method ?? "GET";
    assert.equal(url.origin, "https://api.github.com");
    const reply = (value: unknown, status = 200) => Response.json(value, { status });
    if (method === "GET" && url.pathname === "/repos/example/backend/issues") {
      scans++;
      return reply([issue]);
    }
    if (method === "GET" && url.pathname === "/repos/example/backend/issues/17") return reply(issue);
    if (method === "GET" && url.pathname === "/repos/example/backend/issues/17/dependencies/blocked_by") return reply([]);
    if (url.pathname === "/repos/example/backend/issues/17/comments") {
      if (method === "GET") return reply(comments);
      if (method === "POST") {
        const body = JSON.parse(String(init?.body)) as { body: string };
        const comment = { id: comments.length + 1, body: body.body };
        comments.push(comment);
        return reply(comment, 201);
      }
    }
    throw new Error(`Unexpected GitHub effect: ${method} ${url.pathname}`);
  };
  const daemon = await startDaemon({
    stateDir: join(root, "state"),
    intervalMs: 25,
    sources: [
      tk({ id: "local", cwd: root, home: join(root, "home") }),
      github({
        id: "github", cwd: root, home: join(root, "home"),
        repository: "example/backend", requiredLabels: ["ready"],
        defaultMachine: "candidate", input: { repository: "example" },
        token: "fixture-token", fetch: transport,
      }),
    ],
  });
  t.after(() => daemon.close());
  const attempts = await until(
    () => daemon.engine.store.list(),
    (items) => items.length === 2 && items.every((item) => item.delivery === "applied"),
  );
  assert.ok(attempts.every((item) => item.status === "completed"));
  assert.deepEqual(attempts.map((item) => item.source).sort(), ["github", "local"]);
  assert.match(await readTicket(root, "local-task"), /Candidate for local/);
  assert.match(await readTicket(root, "local-task"), /status: open/);
  assert.equal(comments.length, 1);
  assert.match(comments[0]!.body, /Candidate for github/);
  assert.equal(issue.state, "open");

  // Unrelated later activity must not manufacture another execution request.
  issue.title = "GitHub task with clarified title";
  issue.updated_at = "2026-09-19T01:00:00Z";
  const previousScans = scans;
  await until(() => scans, (count) => count >= previousScans + 2);
  assert.equal(daemon.engine.store.list().length, 2);
  assert.equal(comments.length, 1);
});
