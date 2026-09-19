import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tk } from "../src/tk.ts";
import { workspace } from "./helpers.ts";
const revision = "194b71a8bbc3771da1ce9f579395937c976bbddc";
test("pinned upstream tk creates, reads, and updates adapter-managed tickets", async (t) => {
  const root = await workspace(t);
  const response = await fetch(
    `https://raw.githubusercontent.com/wedow/ticket/${revision}/ticket`,
  );
  assert.equal(response.status, 200);
  const script = join(root, "tk");
  await writeFile(script, await response.text());
  await chmod(script, 0o700);
  const execute = promisify(execFile);
  const run = async (...args: string[]) =>
    (
      await execute(script, args, {
        cwd: root,
        env: { ...process.env, TICKETS_DIR: join(root, ".tickets") },
      })
    ).stdout;
  const id = (
    await run(
      "create",
      "Interoperate",
      "--assignee",
      "test",
      "--acceptance",
      "Preserve metadata",
    )
  ).trim();
  const path = join(root, ".tickets", `${id}.md`);
  await writeFile(
    path,
    (await readFile(path, "utf8")).replace(
      "status: open",
      "status: open\nmachine: research\ninput:\n  task: Validate tk compatibility",
    ),
  );
  const source = tk({ id: "test", cwd: root });
  const item = (await source.scan()).items[0]!;
  await source.apply({
    attemptId: "route",
    item,
    status: "completed",
    result: {
      state: "done",
      output: { action: "route", machine: "implement", summary: "Researched" },
    },
  });
  await run("start", id);
  await run("add-note", id, "Human edited this ticket");
  assert.match(await run("show", id), /Human edited/);
  assert.match(await readFile(path, "utf8"), /machine: implement/);
  const next = (await source.scan()).items[0]!;
  await source.apply({
    attemptId: "complete",
    item: next,
    status: "completed",
    result: {
      state: "done",
      output: { action: "complete", summary: "Verified" },
    },
  });
  assert.match(await run("show", id), /status: closed/);
  assert.doesNotMatch(await run("ready"), new RegExp(id));
});
