import { describe, it, expect } from "vitest";
import {
  CREDIT_LEDGER_ENTRY_KINDS,
  CREDIT_ADDING_KINDS,
  CREDIT_REMOVING_KINDS,
} from "./creditLedger";

describe("credit ledger kind partitions", () => {
  it("adding and removing kinds are disjoint", () => {
    const overlap = CREDIT_ADDING_KINDS.filter((k) => CREDIT_REMOVING_KINDS.includes(k));
    expect(overlap).toEqual([]);
  });

  it("adding + removing kinds cover every entry kind exactly once", () => {
    const union = [...CREDIT_ADDING_KINDS, ...CREDIT_REMOVING_KINDS].sort();
    expect(union).toEqual([...CREDIT_LEDGER_ENTRY_KINDS].sort());
  });

  it("only grants add credit", () => {
    expect([...CREDIT_ADDING_KINDS]).toEqual(["grant"]);
  });
});
