import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  displayMediaBlockItems,
  isArtexHostedMediaUrl,
  mediaWorkConfigJson,
  mediaWorkItemPath,
  planMediaWorkPackage,
} from "./mediaWorkPackage";
import { readCodamePackageArchive } from "./packageContract";
import { getRenderableComposition } from "./v3/types";
import type { MediaBlock } from "./v3/types";
import { PieceConfigError, validateMediaBlock, validatePieceConfig } from "./v3/validation";
import type { WorkMediaItem } from "./workMedia";

/** The value, or a failed test: a plan the case expects to exist. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const FILM = "https://storage.googleapis.com/artex-490510.firebasestorage.app/work-media/film.mp4";

const still = (id: string, extra: Partial<WorkMediaItem> = {}): WorkMediaItem => ({
  id,
  kind: "image",
  path: `imports/${id}.jpg`,
  renditions: {
    w480: `https://cdn.example/${id}-480.webp`,
    w960: `https://cdn.example/${id}-960.webp`,
    w1920: `https://cdn.example/${id}-1920.webp`,
    avif960: `https://cdn.example/${id}-960.avif`,
    avif1920: `https://cdn.example/${id}-1920.avif`,
    v: 1,
  },
  ...extra,
});

const animated = (id: string): WorkMediaItem => ({
  id,
  kind: "image",
  path: `imports/${id}.gif`,
  renditions: {
    w960: `https://cdn.example/${id}-960.webp`,
    w1920: `https://cdn.example/${id}-1920.webp`,
    poster: `https://cdn.example/${id}-poster.webp`,
    v: 1,
  },
});

describe("displayMediaBlockItems", () => {
  it("keeps the artist's order and only what Display may play", () => {
    const items = displayMediaBlockItems([
      still("a"),
      { id: "vimeo", kind: "embed", provider: "vimeo", url: "https://vimeo.com/1", display: false },
      still("hidden", { display: false }),
      { id: "raw", kind: "image", path: "imports/raw.jpg" },
      animated("gif"),
      { id: "film", kind: "video", url: FILM, durationSec: 42 },
      { id: "elsewhere", kind: "video", url: "https://cdn.example/film.mp4" },
      { id: "yt", kind: "video", url: "https://www.youtube.com/watch?v=x" },
      still("b"),
    ]);
    expect(items.map((item) => item.id)).toEqual(["a", "gif", "film", "b"]);
    expect(items[0]).toMatchObject({ kind: "image", path: "art/media-a.webp", url: "https://cdn.example/a-1920.webp" });
    expect(items[0].animated).toBeUndefined();
    expect(items[1].animated).toBe(true);
    expect(items[2]).toEqual({ id: "film", kind: "video", url: FILM, durationSec: 42 });
  });

  it("never serves an original: an image with no 1920w rendition waits", () => {
    expect(displayMediaBlockItems([{ id: "x", kind: "image", url: "https://legacy.example/x.jpg" }])).toEqual([]);
  });

  it("keeps package paths directly under art/ whatever the id holds", () => {
    expect(mediaWorkItemPath("../../etc/passwd")).toBe("art/media-______etc_passwd.webp");
  });
});

describe("isArtexHostedMediaUrl", () => {
  it.each([
    ["https://storage.googleapis.com/artex-490510.firebasestorage.app/a.mp4", true],
    ["https://storage.googleapis.com/artex-490510.appspot.com/a.mp4", true],
    ["https://firebasestorage.googleapis.com/v0/b/artex-staging.firebasestorage.app/o/a.mp4?alt=media", true],
    ["https://artex-490510.firebasestorage.app.storage.googleapis.com/a.mp4", true],
    // Bucket names are global: an `artex-` prefix proves nothing.
    ["https://storage.googleapis.com/artex-evil/a.mp4", false],
    ["https://artex-evil.storage.googleapis.com/a.mp4", false],
    ["https://firebasestorage.googleapis.com/v0/b/artex-evil.appspot.com/o/a.mp4", false],
    ["https://storage.googleapis.com/someone-else/a.mp4", false],
    ["https://artex-490510.firebasestorage.app/a.mp4", false],
    ["https://artex-490510.firebasestorage.app.evil.example/a.mp4", false],
    ["https://cdn.example/a.mp4", false],
    ["http://storage.googleapis.com/artex-490510.firebasestorage.app/a.mp4", false],
    ["not a url", false],
  ])("%s → %s", (url, expected) => {
    expect(isArtexHostedMediaUrl(url)).toBe(expected);
  });
});

describe("planMediaWorkPackage", () => {
  it("synthesizes one valid media block", () => {
    const plan = must(planMediaWorkPackage({ id: "w1", title: "ShyBot", media: [animated("gif"), still("a")] }));
    expect(() => { validatePieceConfig(plan.pieceConfig); }).not.toThrow();
    const blocks = getRenderableComposition(plan.pieceConfig);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("media");
    expect(plan.files.map((file) => file.path)).toEqual(["art/media-gif.webp", "art/media-a.webp"]);
  });

  it("is null when nothing can play, or when there is no image to be the base artwork", () => {
    expect(planMediaWorkPackage({ id: "w", media: [] })).toBeNull();
    expect(planMediaWorkPackage({ id: "w", media: [{ id: "e", kind: "embed", provider: "youtube", url: "https://youtu.be/x" }] })).toBeNull();
    expect(planMediaWorkPackage({ id: "w", media: [{ id: "v", kind: "video", url: "https://cdn.example/v.mp4" }] })).toBeNull();
  });

  it("changes its fingerprint when what plays changes, and only then", () => {
    const base = must(planMediaWorkPackage({ id: "w", media: [still("a"), still("b")] }));
    const same = must(planMediaWorkPackage({ id: "w", title: "renamed", media: [still("a", { caption: "new" }), still("b")] }));
    const reordered = must(planMediaWorkPackage({ id: "w", media: [still("b"), still("a")] }));
    const hidden = must(planMediaWorkPackage({ id: "w", media: [still("a"), still("b", { display: false })] }));
    expect(same.fingerprint).toBe(base.fingerprint);
    expect(reordered.fingerprint).not.toBe(base.fingerprint);
    expect(hidden.fingerprint).not.toBe(base.fingerprint);
  });
});

describe("validateMediaBlock", () => {
  const block = (items: unknown[]): MediaBlock["config"] => ({ items } as MediaBlock["config"]);
  const code = (fn: () => void): string | null => {
    try {
      fn();
      return null;
    } catch (error) {
      return error instanceof PieceConfigError ? error.code : "other";
    }
  };

  it("accepts images by path or url and hosted videos", () => {
    expect(code(() => { validateMediaBlock(block([
      { id: "a", kind: "image", path: "art/media-a.webp" },
      { id: "b", kind: "image", url: "https://cdn.example/b.webp", animated: true },
      { id: "c", kind: "video", url: "https://cdn.example/c.mp4", durationSec: 12 },
    ])); })).toBeNull();
  });

  it.each([
    ["no items", []],
    ["an embed kind", [{ id: "e", kind: "embed", url: "https://vimeo.com/1" }]],
    ["a Vimeo page as a video", [{ id: "v", kind: "video", url: "https://player.vimeo.com/video/1" }]],
    ["a YouTube page as an image", [{ id: "y", kind: "image", url: "https://youtu.be/x" }]],
    ["plain http", [{ id: "h", kind: "image", url: "http://cdn.example/h.webp" }]],
    ["a video with no url", [{ id: "v", kind: "video", path: "art/v.mp4" }]],
    ["an image with nothing to load", [{ id: "i", kind: "image" }]],
    ["a path outside art/", [{ id: "p", kind: "image", path: "states/p.webp" }]],
    ["a nested path", [{ id: "p", kind: "image", path: "art/x/p.webp" }]],
    ["duplicate ids", [{ id: "d", kind: "image", path: "art/a.webp" }, { id: "d", kind: "image", path: "art/b.webp" }]],
    ["an animated video", [{ id: "v", kind: "video", url: "https://cdn.example/v.mp4", animated: true }]],
    ["a bad duration", [{ id: "v", kind: "video", url: "https://cdn.example/v.mp4", durationSec: -1 }]],
    ["more than 24 items", Array.from({ length: 25 }, (_, i) => ({ id: `i${i}`, kind: "image", path: `art/${i}.webp` }))],
  ])("refuses %s", (_label, items) => {
    expect(code(() => { validateMediaBlock(block(items)); })).toBe("invalid_media_block");
  });

  it("is reached through validatePieceConfig", () => {
    expect(code(() => {
      validatePieceConfig({
        version: 3,
        id: "w",
        title: "t",
        renderer: { primary: "media" },
        composition: [{ kind: "media", id: "m", config: { items: [] } }],
      });
    })).toBe("invalid_media_block");
  });
});

describe("a synthesized media package round-trips through readCodamePackageArchive", () => {
  it("loads the base artwork and every bundled item, and keeps the piece valid", async () => {
    const work = { id: "w1", title: "Deep Dream Vision Quest", media: [still("a"), animated("gif"), { id: "film", kind: "video" as const, url: FILM }] };
    const plan = must(planMediaWorkPackage(work));
    const zip = new JSZip();
    zip.file("config.json", JSON.stringify(mediaWorkConfigJson(work, plan)));
    for (const file of plan.files) zip.file(file.path, new Uint8Array([82, 73, 70, 70]));
    const loaded = await readCodamePackageArchive(await zip.generateAsync({ type: "uint8array" }));

    expect(loaded.assets.baseImagePath).toBe("art/media-a.webp");
    expect([...loaded.files.keys()].sort()).toEqual(["art/media-a.webp", "art/media-gif.webp"]);
    expect(loaded.warnings).toEqual([]);
    const piece = must(loaded.config.pieceConfigV3);
    expect(() => { validatePieceConfig(piece); }).not.toThrow();
    const media = getRenderableComposition(piece)[0] as MediaBlock;
    expect(media.config.items.map((item) => item.id)).toEqual(["a", "gif", "film"]);
  });

  it("warns, never fails, when a bundled item is missing", async () => {
    const work = { id: "w1", media: [still("a"), still("b")] };
    const plan = must(planMediaWorkPackage(work));
    const zip = new JSZip();
    zip.file("config.json", JSON.stringify(mediaWorkConfigJson(work, plan)));
    zip.file(plan.files[0].path, new Uint8Array([1]));
    const loaded = await readCodamePackageArchive(await zip.generateAsync({ type: "uint8array" }));
    expect(loaded.warnings).toEqual(["Referenced asset is missing from package: art/media-b.webp"]);
  });

  it("leaves a package with no media block exactly as it loaded before", async () => {
    const zip = new JSZip();
    const config = mediaWorkConfigJson({ id: "w" }, must(planMediaWorkPackage({ id: "w", media: [still("a")] })));
    delete config.pieceConfigV3;
    zip.file("config.json", JSON.stringify(config));
    zip.file("art/media-a.webp", new Uint8Array([1]));
    zip.file("art/extra.webp", new Uint8Array([1]));
    const loaded = await readCodamePackageArchive(await zip.generateAsync({ type: "uint8array" }));
    expect([...loaded.files.keys()]).toEqual(["art/media-a.webp"]);
  });
});
