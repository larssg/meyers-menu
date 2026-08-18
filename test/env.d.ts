/// <reference types="vite/client" />
/// <reference types="@cloudflare/vitest-pool-workers/types" />

declare module 'cloudflare:test' {
  import type { Env } from '../src/index'

  export const env: Env
  export function createExecutionContext(): ExecutionContext
  export function waitOnExecutionContext(ctx: ExecutionContext): Promise<void>
}

declare module '*.html?raw' {
  const content: string
  export default content
}

declare module '*.ics?raw' {
  const content: string
  export default content
}
