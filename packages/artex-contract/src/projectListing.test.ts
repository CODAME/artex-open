import { describe, expect, it } from "vitest";
import {
  canListProject,
  isProjectListed,
  LISTING_BLOCKED_REASON,
  resolveProjectListing,
} from "./projectListing";

describe("canListProject", () => {
  it("a licence plus confirmed rights may be offered as a starting point", () => {
    expect(canListProject({ licenseId: "cc0-1.0", rightsConfirmed: true })).toBe(true);
  });

  it("a licence alone is not enough — the author must confirm the rights", () => {
    expect(canListProject({ licenseId: "cc0-1.0", rightsConfirmed: false })).toBe(false);
    expect(canListProject({ licenseId: "cc0-1.0" })).toBe(false);
  });

  it("confirmed rights alone are not enough — terms have to be stated", () => {
    expect(canListProject({ rightsConfirmed: true })).toBe(false);
    expect(canListProject({ licenseId: null, rightsConfirmed: true })).toBe(false);
  });

  // A licence states terms; listing is a separate decision. Conflating them
  // would put every licensed project in front of everyone.
  it("says nothing about whether a project IS listed", () => {
    expect(canListProject({ licenseId: "cc0-1.0", rightsConfirmed: true, listed: false })).toBe(true);
  });

  it("treats an empty or blank licence id as no licence", () => {
    expect(canListProject({ licenseId: "", rightsConfirmed: true })).toBe(false);
    expect(canListProject({ licenseId: "   ", rightsConfirmed: true })).toBe(false);
  });

  it("survives a record with none of the fields", () => {
    expect(canListProject({})).toBe(false);
  });
});

describe("isProjectListed", () => {
  // Terms included, because a listing with none is not honoured (below).
  const BACKED = { licenseId: "cc0-1.0", rightsConfirmed: true };

  it("is true only for an explicit listing", () => {
    expect(isProjectListed({ ...BACKED, listed: true })).toBe(true);
    expect(isProjectListed({ ...BACKED, listed: false })).toBe(false);
    expect(isProjectListed({ ...BACKED })).toBe(false);
    expect(isProjectListed({})).toBe(false);
  });

  // Every project written before the flag existed has no `listed` key. The
  // absent case has to read as private, never as "unknown" — the same asymmetry
  // the rules encode with get(field, null).
  it("reads an absent flag as not listed", () => {
    expect(isProjectListed({ licenseId: "cc0-1.0", rightsConfirmed: true })).toBe(false);
  });

  // Defence in depth against a hand-edited or half-migrated document: a row
  // claiming to be listed with no terms is not treated as listed, so a
  // projection built on this helper cannot leak one into a catalog.
  it("does not honour a listing that lost its terms", () => {
    expect(isProjectListed({ listed: true, licenseId: null, rightsConfirmed: true })).toBe(false);
    expect(isProjectListed({ listed: true, licenseId: "cc0-1.0", rightsConfirmed: false })).toBe(false);
  });
});

describe("LISTING_BLOCKED_REASON", () => {
  it("names what is missing, so the UI can say why the toggle is off", () => {
    expect(LISTING_BLOCKED_REASON({ rightsConfirmed: true })).toBe("license");
    expect(LISTING_BLOCKED_REASON({ licenseId: "cc0-1.0" })).toBe("rights");
    expect(LISTING_BLOCKED_REASON({})).toBe("license");
    expect(LISTING_BLOCKED_REASON({ licenseId: "cc0-1.0", rightsConfirmed: true })).toBe(null);
  });
});

// The save path's guard. firestore.rules REFUSES a project write whose merged
// document is listed with no licence or no rights confirmation, and a refused
// write reaches the artist as "Missing or insufficient permissions" in the
// middle of publishing. So the client resolves the state it is allowed to ask
// for rather than asking and losing.
describe("resolveProjectListing", () => {
  it("keeps a listing that is properly backed", () => {
    expect(resolveProjectListing({
      requestedListed: true,
      licenseId: "cc0-1.0",
      rightsConfirmed: true,
    })).toEqual({ listed: true, licenseId: "cc0-1.0", rightsConfirmed: true });
  });

  it("refuses to ask for a listing with no licence, instead of taking a denial", () => {
    expect(resolveProjectListing({ requestedListed: true, rightsConfirmed: true }).listed).toBe(false);
    expect(resolveProjectListing({ requestedListed: true, licenseId: null, rightsConfirmed: true }).listed).toBe(false);
  });

  it("refuses to ask for a listing with unconfirmed rights", () => {
    expect(resolveProjectListing({ requestedListed: true, licenseId: "cc0-1.0" }).listed).toBe(false);
    expect(resolveProjectListing({
      requestedListed: true,
      licenseId: "cc0-1.0",
      rightsConfirmed: false,
    }).listed).toBe(false);
  });

  // Losing the licence takes the listing down with it, rather than leaving a
  // listed project with no terms — a state the rules refuse on the next write
  // anyway, which would strand the artist mid-publish.
  it("drops the listing when the licence is cleared", () => {
    expect(resolveProjectListing({
      requestedListed: true,
      licenseId: "",
      rightsConfirmed: true,
    })).toEqual({ listed: false, licenseId: "", rightsConfirmed: true });
  });

  it("normalises an absent request to not listed", () => {
    expect(resolveProjectListing({}).listed).toBe(false);
    expect(resolveProjectListing({ licenseId: "cc0-1.0", rightsConfirmed: true }).listed).toBe(false);
  });

  it("passes the terms through untouched, so a licence can be stated without listing", () => {
    const resolved = resolveProjectListing({ licenseId: "mit", rightsConfirmed: true });
    expect(resolved.licenseId).toBe("mit");
    expect(resolved.rightsConfirmed).toBe(true);
    expect(resolved.listed).toBe(false);
  });
});
