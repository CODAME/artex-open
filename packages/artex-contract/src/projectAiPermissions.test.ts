import { describe, expect, it } from "vitest";
import { resolveWorkAiPermissionsWrite, workPermissions } from "./projectAiPermissions";

const LISTED = { listed: true, licenseId: "cc_by_4_0", rightsConfirmed: true } as const;

describe("workPermissions", () => {
  it("a record with none of the fields grants nothing", () => {
    expect(workPermissions({})).toEqual({ exhibit: false, remix: false, train: false, derive: false });
  });

  it("an existing published work reads as no training and no derivatives without a write", () => {
    expect(workPermissions({ status: "published" })).toEqual({
      exhibit: true,
      remix: false,
      train: false,
      derive: false,
    });
  });

  it("training alone grants training and nothing else", () => {
    expect(workPermissions({ allowAiTraining: true })).toEqual({
      exhibit: false,
      remix: false,
      train: true,
      derive: false,
    });
  });

  it("derivatives alone grant derivatives and nothing else", () => {
    expect(workPermissions({ allowAiDerivatives: true })).toEqual({
      exhibit: false,
      remix: false,
      train: false,
      derive: true,
    });
  });

  // The rule the whole model rests on: listing, a licence and publishing
  // never imply either machine permission.
  it("a listed, licensed, published work still says no to training and derivatives", () => {
    const permissions = workPermissions({ ...LISTED, status: "published" });
    expect(permissions.remix).toBe(true);
    expect(permissions.exhibit).toBe(true);
    expect(permissions.train).toBe(false);
    expect(permissions.derive).toBe(false);
  });

  it("explicit false reads as no", () => {
    const permissions = workPermissions({ allowAiTraining: false, allowAiDerivatives: false });
    expect(permissions.train).toBe(false);
    expect(permissions.derive).toBe(false);
  });

  it("a half-migrated or hand-edited row is never read as a grant", () => {
    const loose = { allowAiTraining: "true", allowAiDerivatives: 1 } as unknown as Parameters<typeof workPermissions>[0];
    expect(workPermissions(loose)).toMatchObject({ train: false, derive: false });
  });

  it("remix follows the listing rule, so a listed flag with no licence is not remix", () => {
    expect(workPermissions({ listed: true }).remix).toBe(false);
    expect(workPermissions({ listed: true, licenseId: "cc0-1.0" }).remix).toBe(false);
  });

  it("a draft is not exhibited, whatever else it carries", () => {
    expect(workPermissions({ ...LISTED, status: "draft", allowAiTraining: true }).exhibit).toBe(false);
  });
});

describe("resolveWorkAiPermissionsWrite", () => {
  it("writes nothing when nothing was asked", () => {
    expect(resolveWorkAiPermissionsWrite({ allowAiTraining: true }, {})).toEqual({});
  });

  // A collaborator's save sends the form's false for a field the record never
  // had. Writing it would be a change the rules refuse from a non-owner.
  it("does not write false over an absent field", () => {
    expect(resolveWorkAiPermissionsWrite({}, { allowAiTraining: false, allowAiDerivatives: false })).toEqual({});
  });

  it("does not rewrite a value that is already stored", () => {
    expect(resolveWorkAiPermissionsWrite(
      { allowAiTraining: true, allowAiDerivatives: false },
      { allowAiTraining: true, allowAiDerivatives: false },
    )).toEqual({});
  });

  it("replaces a stored value that is not a boolean with the answer given", () => {
    expect(resolveWorkAiPermissionsWrite({ allowAiTraining: "false" }, { allowAiTraining: false }))
      .toEqual({ allowAiTraining: false });
  });

  it("writes a grant and a withdrawal", () => {
    expect(resolveWorkAiPermissionsWrite({}, { allowAiTraining: true })).toEqual({ allowAiTraining: true });
    expect(resolveWorkAiPermissionsWrite({ allowAiDerivatives: true }, { allowAiDerivatives: false }))
      .toEqual({ allowAiDerivatives: false });
  });
});
