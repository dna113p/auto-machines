import type { Configuration } from "@dna113p/auto-machines";
export default (({ tk }) => [
  tk({ id: "demo", cwd: ".", defaultMachine: "research" }),
]) satisfies Configuration;
