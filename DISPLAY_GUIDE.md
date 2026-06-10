# ARTEX Display — Setup and Usage Guide

## macOS: "app is damaged" on first launch

macOS blocks unsigned apps downloaded from the internet. Run this once in Terminal after installing:

```bash
xattr -cr /Applications/artex-display.app
```

Then open the app normally. You only need to do this once.

> This is a known limitation of the current build. A signed and notarized release is planned.

---

## Installation

### macOS

1. Download `artex-display-*-arm64.dmg` (Apple Silicon) or `artex-display-*-x64.dmg` (Intel) from the [latest release](https://github.com/CODAME/artex-open/releases/latest).
2. Open the DMG and drag **ARTEX Display** to your Applications folder.
3. On first launch, run the `xattr` command above if macOS blocks it.

### Linux

1. Download `artex-display-*.AppImage` from the [latest release](https://github.com/CODAME/artex-open/releases/latest).
2. Make it executable and run it:

```bash
chmod +x artex-display-*.AppImage
./artex-display-*.AppImage
```

---

## What it does

ARTEX Display turns any Mac or Linux machine into a fullscreen art player. It loads any published ARTEX project, plays it edge to edge, and lets you manage it remotely from a phone or tablet.

---

## Modes

Open the admin panel with **Cmd+Shift+K** (macOS) or **Ctrl+Shift+K** (Linux) at any time. Three modes are available:

| Mode | What it does |
|---|---|
| **Boot to a piece** | Loads a specific project slug on every start. Checks for a local package first, then the platform. |
| **Wait for remote command** | Starts on a holding screen and waits for a venue admin to push a piece via the ARTEX platform. |
| **Offline** | Plays a bundled local package with no network calls. |

---

## Running a piece

1. Open the admin panel (**Cmd+Shift+K** / **Ctrl+Shift+K**).
2. Select **Boot to a piece**.
3. Choose a project from the dropdown, or enter a custom slug.
4. Click **Apply** — Display restarts and plays the piece fullscreen.

To get the slug of a project: open it in [ARTEX Studio](https://artex.xyz/create), go to its published page, and copy the slug from the URL.

---

## Remote control

You can start, stop, and switch pieces from any phone or tablet on the same network:

1. Open the admin panel and note the Display's IP address shown at the bottom.
2. On your phone, go to **artex.xyz/remote** and enter the Display ID.
3. Use the remote to change pieces or pause playback.

Alternatively, a venue admin can push pieces remotely from [ARTEX Stage](https://artex.xyz/home) — set Display to **Wait for remote command** mode.

---

## Playlists and scheduling

In the admin panel, switch to **Boot to a piece** and select a playlist slug instead of a single project. Playlists sequence pieces, support run-time limits per piece, and can change through the day.

Playlists are managed in ARTEX Stage under your organization's display settings.

---

## Automatic updates

ARTEX Display checks for updates on launch. When a new version is available, it downloads in the background and prompts you to restart.

> macOS auto-updates require a signed build. Until signing is set up, download the latest DMG from the [releases page](https://github.com/CODAME/artex-open/releases) to update manually.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Shift+K` / `Ctrl+Shift+K` | Open the admin panel |

---

## Questions

Open an issue on this repo or reach out via [artex.xyz](https://artex.xyz).
