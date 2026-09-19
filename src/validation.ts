import * as v from "valibot";
import type { JsonValue } from "./contracts.ts";
export const jsonValue: v.GenericSchema<JsonValue> = v.lazy(() =>
  v.union([
    v.null(),
    v.boolean(),
    v.pipe(v.number(), v.finite()),
    v.string(),
    v.array(jsonValue),
    v.record(v.string(), jsonValue),
  ]),
);
export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
export const record = v.record(v.string(), v.unknown());
export const stringMap = v.record(v.string(), v.string());
export const nonempty = v.pipe(
  v.string(),
  v.nonEmpty(),
  v.check((s) => s.trim() === s),
);
