import { z } from "zod";

export const centavoStringSchema = z.string().regex(/^-?(0|[1-9]\d*)$/, "Use an integer centavo string.");

export type CentavoString = z.infer<typeof centavoStringSchema>;

export function addCentavos(...values: readonly CentavoString[]): CentavoString {
  return values.reduce((total, value) => total + BigInt(value), 0n).toString();
}

