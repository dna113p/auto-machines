import { request as httpRequest } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
export function defaultStateDir(): string {
  return join(
    process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
    "auto-machines",
  );
}
export function request(
  stateDir: string,
  operation: string,
  payload: unknown = {},
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = httpRequest(
      {
        socketPath: join(stateDir, "daemon.sock"),
        path: `/${operation}`,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("error", reject);
        res.on("end", () => {
          try {
            const value: unknown = JSON.parse(
              Buffer.concat(chunks).toString("utf8"),
            );
            if (res.statusCode !== 200)
              reject(
                new Error(
                  typeof value === "object" &&
                  value !== null &&
                  "error" in value
                    ? String(value.error)
                    : "Daemon request failed",
                ),
              );
            else resolve(value);
          } catch (cause) {
            reject(cause);
          }
        });
      },
    );
    req.setTimeout(30_000, () =>
      req.destroy(
        new Error("Daemon request timed out; inspect status before retrying"),
      ),
    );
    req.once("error", reject);
    req.end(body);
  });
}
