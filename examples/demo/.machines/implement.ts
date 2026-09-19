import type { Event, JsonValue, MachinePrimitives } from "@dna113p/machines";
export const description =
  "Implements a demo ticket and asks for Human approval.";
export const agentRoles = { implementer: "Implement and verify the ticket" };
export default function (
  { machine, agent, human, final }: MachinePrimitives,
  input: JsonValue,
) {
  let approved = false;
  return machine({
    initial: "implement",
    output: () => ({
      action: approved ? "complete" : "hold",
      summary: approved
        ? "Implementation verified and approved."
        : "Implementation awaits further review.",
    }),
    states: {
      implement: agent(
        `Perform this demonstration: ${JSON.stringify(input)}`,
        { completed: "review" },
        { using: "implementer" },
      ),
      review: human(
        "Approve this demo implementation?",
        {
          submitted: {
            target: "done",
            actions: ({ event }: { event: Event }) => {
              approved = event.value === "approve";
            },
          },
        },
        { choices: ["approve", "hold"] },
      ),
      done: final(),
    },
  });
}
