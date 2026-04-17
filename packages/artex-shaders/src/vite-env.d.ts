// Augments ImportMeta with Vite's import.meta.glob API so tsc is satisfied
// when type-checking outside a Vite build context.
interface ImportMeta {
  glob(
    pattern: string,
    options?: { eager?: boolean; query?: string; import?: string },
  ): Record<string, string>;
}
