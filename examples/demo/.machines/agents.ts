import type { AgentRunner } from "@dna113p/machines";
const runner: AgentRunner = (_request, report) => {
  report?.({ type: "identity", harness: "demo", model: "deterministic" });
  report?.({
    type: "output",
    text: "Demo work verified. No model or network was used.",
  });
  return { type: "completed" };
};
export default () => ({
  researcher: { description: "Deterministic research demonstration", runner },
  implementer: {
    description: "Deterministic implementation demonstration",
    runner,
  },
});
