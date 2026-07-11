import { handleRequest } from './router';
import { repairStaleJobs } from './jobs';
import type { Env } from './env';

export { CreationWorkflow } from './CreationWorkflow';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env, ctx);
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: 'worker-fetch',
          error: error instanceof Error ? error.message : String(error),
        })
      );
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(repairStaleJobs(env));
  },
};
