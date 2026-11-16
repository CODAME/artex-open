// A work's ordered media list: every photo, video and embed beside its cover
// (docs/plans/multi-media-works-plan.md §3, owner decision 2026-11-09: one
// work with an ordered list, never a split into a collection).
//
// Stored on `publishedArtworks/{id}.media`. The cover fields
// (`coverImageUrl` / `coverDataUrl` / `customPreviewAssetUrl`) stay where they
// are and every surface keeps reading them; this list is additive. A work with
// no `media` renders exactly as it did before the field existed.
//
// The work's public page renders it as a stage (docs/public-artwork-page.md);
// Display plays a media-only work's list through a synthesized package with one
// `media` block (mediaWorkPackage.ts, docs/display-playback-modes.md). The first writer is the
// CODAME archive backfill (docs/archive-work-media-backfill-runbook.md).
// Read the stored value through `readWorkMediaList()`, never raw, so a
// hand-edited or half-written row reads as fewer items rather than as a crash.
//
// A dependency-free leaf on purpose: no imports, so `scripts/` can load it
// directly (Node type stripping) and the contract never imports @artex/core
// (scripts/check_workspace_boundaries.mjs).

/** At most this many items are kept on one work. */
export const WORK_MEDIA_MAX_ITEMS = 24;

export const WORK_MEDIA_KINDS = ["image", "video", "embed"] as const;
export type WorkMediaKind = (typeof WORK_MEDIA_KINDS)[number];

/** Embeds are framed only through these, by `resolveVideoSource()`. */
export const WORK_MEDIA_EMBED_PROVIDERS = ["vimeo", "youtube"] as const;
export type WorkMediaEmbedProvider = (typeof WORK_MEDIA_EMBED_PROVIDERS)[number];

/** "documentation" is a making-of, an install shot, process. */
export const WORK_MEDIA_ROLES = ["work", "documentation"] as const;
export type WorkMediaRole = (typeof WORK_MEDIA_ROLES)[number];

/**
 * Written by the rendition writer (step 1, `generateWorkMediaRenditions` in
 * projectCoverThumbnails.mjs), never by an import: an import leaves it unset.
 * `w*` are WebP (the universal fallback), `avif*` AVIF, mirroring the cover
 * ladder. An animated GIF item gets an animated WebP (owner decision
 * 2026-11-09). `v` and `source` (the `path ?? url` the set was derived from)
 * let a stale set be detected without a download, as `coverThumbs` does.
 * `frames` and `pixels` (all frames together) record the source's size on any
 * set derived from a GIF or an animation. An animation over the writer's caps
 * gets `poster` and no rungs, so it keeps playing its original; the recorded
 * size lets the writer re-derive it once the caps cover it.
 */
export interface WorkMediaRenditions {
  w480?: string;
  w960?: string;
  w1920?: string;
  avif480?: string;
  avif960?: string;
  avif1920?: string;
  poster?: string;
  v?: number;
  source?: string;
  frames?: number;
  pixels?: number;
}

const RENDITION_URL_KEYS = ["w480", "w960", "w1920", "avif480", "avif960", "avif1920", "poster"] as const;

export interface WorkMediaItem {
  /** Stable across reorders. */
  id: string;
  kind: WorkMediaKind;
  /** Storage path for an image or video (preferred, like the cover paths). */
  path?: string | null;
  /** Hosted https URL, or the https page for an embed. */
  url?: string | null;
  /** Embeds only. */
  provider?: WorkMediaEmbedProvider;
  width?: number;
  height?: number;
  durationSec?: number | null;
  renditions?: WorkMediaRenditions;
  alt?: string | null;
  caption?: string | null;
  /** Photographer. */
  credit?: string | null;
  role?: WorkMediaRole;
  /** Default true for image/video; always false for an embed (never played on Display). */
  display?: boolean;
  /** True on the one item the work's cover fields were taken from. */
  isCover?: boolean;
  /**
   * The point a Display's Fill crop keeps in view, x and y in 0..1 of the
   * item's own frame (docs/display-playback-modes.md, "Works with a media
   * list"). Absent is the centre. Photos and films only; never on an embed.
   * Read from the record by the Display route; never written into a package.
   */
  focus?: { x: number; y: number };
  /** Import provenance: where the item was found. */
  sourceUrl?: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const httpsUrlOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^https:\/\/\S+$/i.test(trimmed) ? trimmed : null;
};

const textOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

/**
 * A focal point as the contract stores it: both coordinates finite and in
 * 0..1, rounded to 3 places; anything else is no focal point (the centre).
 */
export const readWorkMediaFocus = (value: unknown): { x: number; y: number } | undefined => {
  if (!isRecord(value)) return undefined;
  const { x, y } = value;
  const unit = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
  if (!unit(x) || !unit(y)) return undefined;
  return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
};

const positiveIntOrUndefined = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined =>
  (values as readonly unknown[]).includes(value) ? (value as T) : undefined;

/** The hosts each embed provider's page lives on. An embed URL on any other host is refused. */
const EMBED_PROVIDER_HOSTS: Record<WorkMediaEmbedProvider, readonly string[]> = {
  youtube: ["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"],
  vimeo: ["vimeo.com", "player.vimeo.com"],
};

const isProviderUrl = (provider: WorkMediaEmbedProvider, url: string): boolean => {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return EMBED_PROVIDER_HOSTS[provider].includes(host);
  } catch {
    return false;
  }
};

/**
 * One stored item as the contract shape, or null when it cannot be shown at
 * all (no id, unknown kind, nothing to load, an embed with no provider or a
 * URL off its provider's hosts).
 * Unknown keys are dropped; an embed's `display` is forced to false.
 */
export const readWorkMediaItem = (value: unknown): WorkMediaItem | null => {
  if (!isRecord(value)) return null;
  const id = textOrNull(value.id);
  const kind = oneOf(WORK_MEDIA_KINDS, value.kind);
  if (!id || !kind) return null;
  const url = httpsUrlOrNull(value.url);
  const path = textOrNull(value.path);
  if (!url && !path) return null;
  const provider = oneOf(WORK_MEDIA_EMBED_PROVIDERS, value.provider);
  if (kind === "embed" && (!provider || !url || !isProviderUrl(provider, url))) return null;

  const item: WorkMediaItem = { id, kind };
  if (path) item.path = path;
  if (url) item.url = url;
  if (kind === "embed" && provider) item.provider = provider;
  const width = positiveIntOrUndefined(value.width);
  const height = positiveIntOrUndefined(value.height);
  if (width && height) {
    item.width = width;
    item.height = height;
  }
  if (typeof value.durationSec === "number" && Number.isFinite(value.durationSec) && value.durationSec > 0) {
    item.durationSec = value.durationSec;
  }
  if (isRecord(value.renditions)) {
    const renditions: WorkMediaRenditions = {};
    for (const key of RENDITION_URL_KEYS) {
      const rendition = httpsUrlOrNull(value.renditions[key]);
      if (rendition) renditions[key] = rendition;
    }
    const version = positiveIntOrUndefined(value.renditions.v);
    if (version) renditions.v = version;
    const source = textOrNull(value.renditions.source);
    if (source) renditions.source = source;
    const frames = positiveIntOrUndefined(value.renditions.frames);
    if (frames) renditions.frames = frames;
    const pixels = positiveIntOrUndefined(value.renditions.pixels);
    if (pixels) renditions.pixels = pixels;
    if (Object.keys(renditions).length > 0) item.renditions = renditions;
  }
  for (const key of ["alt", "caption", "credit", "sourceUrl"] as const) {
    const text = textOrNull(value[key]);
    if (text) item[key] = text;
  }
  const role = oneOf(WORK_MEDIA_ROLES, value.role);
  if (role) item.role = role;
  item.display = kind === "embed" ? false : value.display !== false;
  if (value.isCover === true) item.isCover = true;
  const focus = kind === "embed" ? undefined : readWorkMediaFocus(value.focus);
  if (focus) item.focus = focus;
  return item;
};

/**
 * The stored list as the contract shape: unreadable items dropped, duplicate
 * ids kept once (first wins), at most one cover, capped at
 * {@link WORK_MEDIA_MAX_ITEMS}. Null when nothing readable remains.
 */
export const readWorkMediaList = (value: unknown): WorkMediaItem[] | null => {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const items: WorkMediaItem[] = [];
  let coverSeen = false;
  for (const raw of value) {
    if (items.length >= WORK_MEDIA_MAX_ITEMS) break;
    const item = readWorkMediaItem(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    if (item.isCover) {
      if (coverSeen) delete item.isCover;
      coverSeen = true;
    }
    items.push(item);
  }
  return items.length > 0 ? items : null;
};
