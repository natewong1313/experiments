import type { TestEnv } from "./worker";

declare global {
  namespace Cloudflare {
    interface Env extends TestEnv {}
  }
}
