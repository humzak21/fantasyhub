/**
 * `cn` had two definitions: this file and src/lib/utils.js. They were
 * identical, which is exactly why the duplication was invisible — the two
 * would only diverge the first time someone edited one of them.
 *
 * src/lib/utils.js is the single source. This file stays because
 * components.json maps the shadcn `utils` alias to `@/lib`, which vite.config
 * resolves here — so `npx shadcn add <component>` writes
 * `import { cn } from "@/lib/utils"` and must keep working.
 */
export * from '../src/lib/utils.js'
