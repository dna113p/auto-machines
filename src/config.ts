import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tk, type TkOptions } from "./tk.ts";
import { github, type GitHubOptions } from "./github.ts";
import type { WorkSource } from "./contracts.ts";
export interface ConfigurationPrimitives {
  tk: (options: TkOptions) => WorkSource;
  github: (options: GitHubOptions) => WorkSource;
}
export type Configuration = (
  helpers: ConfigurationPrimitives,
) => readonly WorkSource[] | Promise<readonly WorkSource[]>;
export async function loadConfiguration(
  path: string,
): Promise<readonly WorkSource[]> {
  const absolute = resolve(path);
  const loaded: { default?: unknown } = await import(
    pathToFileURL(absolute).href
  );
  if (typeof loaded.default !== "function")
    throw new Error("Configuration must default-export a registration factory");
  const sources: unknown = await loaded.default({
    github: (options: GitHubOptions) =>
      github({
        ...options,
        cwd: resolve(dirname(absolute), options.cwd),
      }),
    tk: (options: TkOptions) => {
      const cwd = resolve(dirname(absolute), options.cwd);
      return tk({
        ...options,
        cwd,
        ...(options.ticketsDir === undefined
          ? {}
          : { ticketsDir: resolve(cwd, options.ticketsDir) }),
      });
    },
  });
  if (!Array.isArray(sources) || !sources.length)
    throw new Error("Configuration must return at least one source");
  for (const source of sources) {
    if (
      !source ||
      typeof source.id !== "string" ||
      !["scan", "prepare", "apply"].every(
        (name) => typeof source[name] === "function",
      )
    )
      throw new Error("Invalid source registration");
  }
  return sources;
}
