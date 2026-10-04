// NOT re-exported from this barrel on purpose. `previewUserShader.ts` and
// `ArtexShaderPreview.tsx` pull BUILTIN_SHADER_LIBRARY_ITEMS from here, and both
// sit in the PUBLIC /art route closure — so a barrel re-export drags the whole
// authorship registry onto every public artwork page (check_route_closures put
// PublicStaticArtworkPage and PublicArtworkManageBar ~37.5 kB brotli over
// baseline). Consumers import the subpath instead:
//   import { ... } from "@artex/shaders/builtin-shader-authorship";
export * from "./builtinShaderLibrary";
export * from "./hiddenBuiltinShaders";
export * from "./sharedShaderLicenses";
