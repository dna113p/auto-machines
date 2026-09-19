import type { JsonValue, MachinePrimitives } from "@dna113p/machines";
export const description =
  "Researches a demo ticket and routes it to implementation.";
export const agentRoles = { researcher: "Research this ticket" };
export default function (
  { machine, agent, final }: MachinePrimitives,
  input: JsonValue,
) {
  return machine({
    initial: "research",
    output: () => ({
      action: "route",
      machine: "implement",
      summary: "Research complete; implementation is ready.",
      input,
    }),
    states: {
      research: agent(
        `Inspect this demonstration: ${JSON.stringify(input)}`,
        { completed: "done" },
        { using: "researcher" },
      ),
      done: final(),
    },
  });
}
