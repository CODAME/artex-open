// Work relationship graph — typed bidirectional links between works.
// Phases 0+1 shipped; this file now includes types for Phases 2–6A.

// ── Core work types ───────────────────────────────────────────────────────

export type WorkKind = "experience" | "print";

export type WorkRelationType =
  | "derived-from"  // this work was derived from another (inverse: exported-to)
  | "exported-to"   // this work was exported / forked to another (inverse: derived-from)
  | "inspired-by"   // loosely inspired — symmetric
  | "paired-with";  // curated pairing — symmetric

export const INVERSE_RELATION: Record<WorkRelationType, WorkRelationType> = {
  "derived-from": "exported-to",
  "exported-to": "derived-from",
  "inspired-by": "inspired-by",
  "paired-with": "paired-with",
};

export const WORK_RELATION_TYPES: WorkRelationType[] = [
  "derived-from",
  "exported-to",
  "inspired-by",
  "paired-with",
];

export const isValidWorkKind = (value: unknown): value is WorkKind =>
  value === "experience" || value === "print";

export const isValidWorkRelationType = (value: unknown): value is WorkRelationType =>
  WORK_RELATION_TYPES.includes(value as WorkRelationType);

// ── Relation & graph (Phase 0+1, extended in Phase 2) ────────────────────

// A single directed relation document stored in `workRelations/{id}`.
// Bidirectional consistency is maintained by the API: every write creates
// both the source→target doc and its inverse target→source doc atomically.
export interface WorkRelation {
  id: string;
  relationType: WorkRelationType;
  sourceWorkId: string;
  sourceWorkKind: WorkKind;
  targetWorkId: string;
  targetWorkKind: WorkKind;
  targetWorkTitle: string;
  // Phase 2: slug of the target's published artwork, null if not yet published.
  targetWorkSlug: string | null;
  ownerUserId: string;
  createdAt: string;
}

export interface WorkGraphSummary {
  derivedFromCount: number;
  hasDerivedCount: number;
  inspiredByCount: number;
  pairedWithCount: number;
}

// Denormalized graph field embedded on each work document (projects/{id}.graph).
// Kept in sync by the API on every relation write. Clients never write this field
// directly — Firestore rules block it.
export interface WorkGraph {
  workId: string;
  relations: WorkRelation[];
  summary: WorkGraphSummary;
  updatedAt: string;
}

export const emptyGraph = (workId: string): WorkGraph => ({
  workId,
  relations: [],
  summary: {
    derivedFromCount: 0,
    hasDerivedCount: 0,
    inspiredByCount: 0,
    pairedWithCount: 0,
  },
  updatedAt: new Date().toISOString(),
});

export const computeGraphSummary = (relations: WorkRelation[]): WorkGraphSummary => ({
  derivedFromCount: relations.filter((r) => r.relationType === "derived-from").length,
  hasDerivedCount: relations.filter((r) => r.relationType === "exported-to").length,
  inspiredByCount: relations.filter((r) => r.relationType === "inspired-by").length,
  pairedWithCount: relations.filter((r) => r.relationType === "paired-with").length,
});

// ── Phase 3A — Editions ───────────────────────────────────────────────────

// A numbered, finite print run derived from one Experience.
export interface WorkEdition {
  id: string;
  ownerUserId: string;
  sourceExperienceId: string;
  title: string;
  description: string | null;
  totalCount: number;
  issuedCount: number;
  openForMinting: boolean;
  coverDataUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// One print's slot within an edition.
export interface WorkEditionEntry {
  editionId: string;
  printWorkId: string;
  editionNumber: number;
  mintedAt: string;
}

// ── Phase 3B — Collections ────────────────────────────────────────────────

export interface WorkCollection {
  id: string;
  ownerUserId: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: "private" | "public";
  coverDataUrl: string | null;
  workIds: string[];
  publishedSlugs: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * List-shape projection of `WorkCollection`, as returned by
 * `GET /work-collections`.
 *
 * `coverDataUrl` is deliberately absent. It holds a base64 data URL stored
 * inline in the document, so returning it per row makes the list response grow
 * with total cover bytes rather than with row count (#2723). Read the detail
 * route when you need the cover.
 *
 * `ownerUserId` is absent because the route is scoped to the caller — every row
 * it can return is already theirs.
 */
export type WorkCollectionSummary = Omit<WorkCollection, "coverDataUrl" | "ownerUserId">;

/** Detail shape: the owner's summary plus the one cover the surface renders. */
export type WorkCollectionDetail = WorkCollectionSummary & {
  coverDataUrl: string | null;
};

/** One work as it appears on a public collection page. */
export interface PublicWorkCollectionEntry {
  slug: string;
  title: string;
  coverImageUrl: string | null;
}

/**
 * `GET /public/collections/:slug` — the public collection page payload.
 *
 * Mirrors `projectPublicCollection` in
 * `.services/artex-platform-api/workCollections.mjs`; the workspace boundary
 * rules forbid the service importing this package, so the shapes are duplicated
 * and pinned by tests on both sides.
 *
 * Carries no `ownerUserId` and no `id`: the public surface attributes works to
 * their artists, and neither the curator's user id nor the document id is public
 * data. It carries no cover either: a collection cover is a base64 `data:` URL
 * stored inline, unusable in `og:image` and with no hero surface to render it in,
 * so it is the largest thing in the response and pays for nothing. A hosted
 * cover field lands here when covers move to GCS. `workCount` counts the works that RESOLVED to public entries, so it
 * always equals `works.length` — it exists so a caller can render a count
 * without walking the array.
 */
export interface PublicWorkCollection {
  slug: string;
  title: string;
  description: string | null;
  updatedAt: string | null;
  workCount: number;
  /** True when membership exceeded the server's per-page cap and was cut. */
  truncated: boolean;
  works: PublicWorkCollectionEntry[];
}

// ── Phase 3C — Series (org-level) ────────────────────────────────────────

export interface OrgSeriesEntry {
  workId: string;
  publishedSlug: string | null;
  /**
   * Present only for a reader with manage access to the series (an org admin or
   * manager, or a platform admin).
   *
   * Optional because the server omits it otherwise. It identifies a person, and
   * a member reading a `members`-visible series has no curator task that needs
   * to tell two same-named artists apart. It was unconditional until the org
   * series read routes were found to have no authorization at all.
   */
  artistUserId?: string;
  artistName: string;
  addedAt: string;
  note: string | null;
}

export interface OrgSeries {
  id: string;
  orgId: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: "private" | "public" | "members";
  coverDataUrl: string | null;
  entries: OrgSeriesEntry[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Fields every series response carries beyond the stored document.
 *
 * `truncated` is reported rather than left implicit so a caller can say "showing
 * the first 200" instead of silently rendering a subset (AGENTS.md: no silent
 * caps). `entryCount` is the count AFTER capping, so it always matches the array
 * beside it.
 */
export interface OrgSeriesCounts {
  entryCount: number;
  truncated: boolean;
}

/**
 * A series as the list route returns it.
 *
 * `coverDataUrl` is deliberately absent. It holds a base64 data URL stored
 * inline in the document, so shipping it per row makes the response grow with
 * total image size rather than with row count (#2739, the same reasoning as
 * `WorkCollectionSummary`). Read the detail route when the cover is needed.
 */
export type OrgSeriesSummary = Omit<OrgSeries, "coverDataUrl"> & OrgSeriesCounts;

/** A series as the detail, create, and update routes return it — cover included. */
export type OrgSeriesDetail = OrgSeries & OrgSeriesCounts;

// ── Phase 5 — Authorship credits negotiation ─────────────────────────────

export type CreditProposalStatus =
  | "pending"
  | "accepted"
  | "amended"
  | "declined";

export interface CreditProposal {
  id: string;
  relationId: string;
  derivedWorkId: string;
  derivedWorkTitle: string;
  sourceWorkId: string;
  sourceWorkTitle: string;
  proposerUserId: string;
  recipientUserId: string;
  proposedTags: string[];
  counterTags: string[] | null;
  status: CreditProposalStatus;
  message: string | null;
  responseMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ArtexNotificationType =
  // Person -> org credit claims: someone asks an organization to credit them
  // on one of its records, and the organization decides.
  // Canonical: docs/association-claims.md
  | "association_claim"
  | "association_claim_approved"
  | "association_claim_declined"
  /** An org credited this account on one of its records; removable from the profile (#4780). */
  | "org_credit_added"
  // An imported work moving to the artist who claimed it, and an org taking one
  // back (docs/imported-work-transfer-on-claim.md).
  | "work_transfer_proposed"
  | "work_transfer_approved"
  | "work_transfer_returned"
  | "credit_proposal"
  | "credit_accepted"
  | "credit_amended"
  | "credit_declined"
  | "fork_requested"
  | "fork_approved"
  | "fork_declined"
  // Call for Artists — artist-facing
  | "program_application_submitted"
  | "program_application_accepted"
  | "program_application_rejected"
  /** A curator asked about a submission before deciding ("Ask the artist"). */
  | "program_application_question"
  // Call for Artists — curator-facing
  | "program_application_received"
  | "program_application_withdrawn"
  /** The artist answered a curator's question. */
  | "program_application_replied"
  // Print Club
  | "print_club_event_order"
  | "print_club_edition_won"
  /** An edition is ready to post and this recipient has no delivery address (#4799). */
  | "print_club_address_needed"
  /** An org manager asked ARTEX to refund a subscription payment (to platform admins, #4805). */
  | "subscription_refund_requested"
  /** ARTEX approved and issued a requested refund (to the manager who asked). */
  | "subscription_refund_approved"
  /** ARTEX declined a requested refund (to the manager who asked). */
  | "subscription_refund_declined"
  /** A member's subscription payment was refunded (to the member). */
  | "subscription_refund_issued"
  // Org / lifecycle
  | "org_vote_closed"
  /** A vote this person may cast a ballot in has opened. */
  | "program_vote_opened"
  /** That vote closes soon and this person has not voted yet. */
  | "program_vote_closing_soon"
  | "org_broadcast"
  | "legacy_sunset_reminder"
  // Offerings — request lifecycle (both parties; Phase 3 licensing & services)
  | "offering_request_received"
  | "offering_request_updated"
  | "offering_request_accepted"
  | "offering_request_declined"
  | "offering_request_cancelled"
  | "offering_request_paid"
  | "offering_request_fulfilled"
  // Sponsorship — application lifecycle (both parties; Capability D)
  | "sponsorship_application_received"
  | "sponsorship_application_updated"
  | "sponsorship_application_accepted"
  | "sponsorship_application_declined"
  | "sponsorship_application_cancelled"
  | "sponsorship_application_paid"
  | "sponsorship_application_fulfilled"
  // Artist followers — sent TO a follower ABOUT an artist they follow (COD-140).
  // Distinct from every type above, which notify a party to their own
  // transaction. Delivered in-app to any follower with a linked account and by
  // email only to those with marketing consent.
  | "artist_published_work"
  | "artist_work_entered_pool"
  | "artist_work_won_cycle"
  // New followers — sent TO the followed party, not to the follower. The artist
  // notice goes to the artist; the org notice goes to that org's admins and
  // managers, which is why the two are separate types rather than one with a
  // recipient flag: they resolve to different preference rows.
  | "artist_new_follower"
  | "org_new_follower"
  // Digests and platform announcements. Declared late (#2754): `server.mjs`
  // wrote all three while the union declared none of them, so an exhaustive
  // `switch` compiled clean with three real types falling through, and a
  // `Record` label map typechecked while missing three keys — the shape that
  // produces `undefined` in the UI rather than a build error.
  /** An org's activity digest is ready to read. Carries a url. */
  | "org_digest_ready"
  /**
   * A platform announcement. Deliberately carries no url: the body is the whole
   * update, and no client surface reads the type.
   */
  | "platform_update"
  /**
   * A platform-wide digest is ready for an admin. No url yet — `AdminPage` has
   * no digest-review sub-tab to point at. Wire it when that surface lands.
   */
  | "platform_digest_ready"
  /**
   * Someone registered on ARTEX through an org's outreach link (COD-157).
   * Sent to that org's admins and managers under the program_artist_signup
   * preference row; carries a url to the org's Artists tab.
   */
  | "org_attributed_registration"
  // Invite lifecycle — an invitation the recipient accepted, reported back to
  // whoever sent it. Two types on purpose: the org notice resolves to the
  // `org_membership` preference row and links the org's Manage tab; the
  // platform-admin notice is uncatalogued (like `platform_digest_ready`) and
  // links the admin Users page, and its distinct type keeps the Inbox from
  // deriving a settings link that would gate nothing.
  /** Someone accepted an invitation to this org — sent to its admins and managers. Carries a url. */
  | "invite_accepted"
  /** Someone accepted an invitation this platform admin created. Carries a url. */
  | "platform_invite_accepted"
  /**
   * Someone self-registered on ARTEX — sent to every platform admin so a new
   * account never sits unseen. Uncatalogued like the other platform-admin
   * alerts; carries a url to that person's row on the Users page.
   */
  | "platform_registration"
  /**
   * Daily rollup to platform admins: how many self-registrations still wait on
   * a reply. Uncatalogued like the per-registration notice; carries a url to
   * the Users page's Needs reply view.
   */
  | "platform_registration_queue"
  /**
   * A new organization was created (self-serve start, an organizer role grant,
   * an invite accept, or an admin's create). Sent to every platform admin but
   * the one who did it; uncatalogued like the other platform-admin alerts;
   * carries a url to the org's page.
   */
  | "platform_org_created"
  /**
   * A work went public for the first time. Sent to every platform admin but
   * the one who published it; uncatalogued like the other platform-admin
   * alerts; carries a url to the work's /art/ page.
   */
  | "platform_work_published"
  /**
   * Daily rollup to an org's admins and managers: how many join requests have
   * sat in its queue past a week. Carries a url to the org's Invites tab.
   */
  | "org_join_queue_stale"
  /**
   * A referral credit landed on an organization: someone who joined ARTEX
   * through its outreach paid for a plan. Sent to the org's admins and
   * managers; carries a url to the org's Outreach tab, where the balance shows.
   */
  | "referral_credit_granted"
  /**
   * Referral credit landed on a PERSON's account: as referrer (someone they
   * invited paid) or as referee (their own one-time welcome credit). Not
   * preference-gated. Carries a url to the plan tab.
   */
  | "referral_credit_earned"
  /**
   * Daily rollup to platform admins: how many invitations carrying no org have
   * gone unanswered. Uncatalogued like the registration rollup; carries a url
   * to the Invites page.
   */
  | "platform_invite_queue_stale"
  /**
   * Daily rollup to an org's admins and managers: how many invitations it sent
   * have gone unanswered. Carries a url to the org's Members tab, where the
   * pending list with resend and revoke lives.
   */
  | "org_invite_queue_stale";

export interface ArtexNotification {
  id: string;
  type: ArtexNotificationType;
  referenceId: string;
  title: string;
  body: string;
  /**
   * Optional in-app destination for this notification (a relative app path,
   * e.g. the program/gallery the submission went to). When set, the bell and
   * the dashboard Messages list make the notification a link. Older
   * notifications written before this field are simply non-clickable.
   */
  url?: string | null;
  /**
   * Static, point-in-time context captured when the notification was written,
   * so the Messages list and bell can show *where* a message came from without
   * a live join. `orgName` is the organization (e.g. "CODAME"); `sourceLabel`
   * is the specific program/gallery the event relates to (e.g. "AI Art Book").
   * Both optional: older notifications and event types with no natural source
   * omit them, and the UI falls back to the type-derived category chip.
   */
  orgName?: string | null;
  sourceLabel?: string | null;
  read: boolean;
  /**
   * Archive flag for inbox triage. When true the notification is "done" and
   * leaves the active inbox (it still exists, surfaced under the Done filter and
   * restorable). Optional + defaulting to false keeps older notifications
   * written before this field in the active inbox. Done items are excluded from
   * the unread count and the bell, even when still unread.
   */
  done?: boolean;
  /**
   * Which notification-preference row governed this notification, stamped at
   * write time (#2186). The `type` alone cannot always answer that: the same
   * type reaches both sides of a transaction (`offering_request_paid` goes to
   * the provider AND the buyer), and the catalog splits those into different
   * rows, so only the writer knows which side this copy was for.
   *
   * Absent on notifications written before this field and on types with no
   * catalog row (the fork notices), in which case the reader falls back to
   * `notificationPrefKeyForType(type)` and accepts its coarser answer.
   * Consumed by the Inbox "Notification settings" deep link.
   */
  prefKey?: string | null;
  createdAt: string;
}

export const isValidCreditProposalStatus = (value: unknown): value is CreditProposalStatus =>
  ["pending", "accepted", "amended", "declined"].includes(value as string);

// ── Phase 6A — Fork permissions ───────────────────────────────────────────

export type ForkPolicy = "open" | "ask" | "royalty" | "closed";

export interface WorkForkPolicyConfig {
  policy: ForkPolicy;
  // Basis points (1–10000); null unless policy === "royalty"
  royaltyBasisPoints: number | null;
  message: string | null;
}

/**
 * A work with no stored policy permits nothing (owner decision, 2026-09-02,
 * COD-225). It was "open" from Phase 6A until then, which meant every work
 * carried an effective "anyone may derive from this" its artist never chose —
 * harmless only while no code path could act on it, and wrong the moment a
 * Remix surface or a forkable-work listing ships. Artists opt in at publish;
 * a stored "open" is an explicit choice and is honoured as one.
 */
export const DEFAULT_FORK_POLICY: WorkForkPolicyConfig = {
  policy: "closed",
  royaltyBasisPoints: null,
  message: null,
};

export const isValidForkPolicy = (value: unknown): value is ForkPolicy =>
  ["open", "ask", "royalty", "closed"].includes(value as string);

export interface ForkRequest {
  id: string;
  sourceWorkId: string;
  sourceWorkTitle: string;
  sourceWorkOwnerId: string;
  requesterUserId: string;
  requesterDisplayName: string;
  requesterWorkId: string | null;
  message: string | null;
  status: "pending" | "approved" | "declined";
  createdAt: string;
  updatedAt: string;
}

export const isValidForkRequestStatus = (value: unknown): value is "pending" | "approved" | "declined" =>
  ["pending", "approved", "declined"].includes(value as string);
