# Example Media Input (Sandbox)

**Track:** `media-input-research`
**Stability:** `stable` (Reference Implementation)

This sandbox contains an example of how to implement the `MediaInputAdapter`
and register a custom media input extension.

## What it does

It generates synthetic `uAudioLevel` and `uBassLevel` signals using sine
waves instead of pulling from a real acoustic/microphone source.

## Why it exists

To provide a working reference for contributors looking to build real
adapters (e.g. MIDI, OSC, Web Audio, Bluetooth sensors) and plug them
into the ARTEX `ExtensionHost`.

## Usage

In an app environment with an `ExtensionHost`, you can register this sandbox
like so:

```typescript
import {
  OscillatorMediaAdapter,
  exampleMediaInputExtension
} from "@artex/experiments/sandboxes/example-media-input";

// 1. Create your host
const host = createExtensionHost({
  allowedCapabilities: ["media-input:register"],
});

// 2. Register the adapter implementation
host.registerAdapter("oscillator-adapter", new OscillatorMediaAdapter());

// 3. Register the conceptual media-input extension
host.registerMediaInput(exampleMediaInputExtension);
```
