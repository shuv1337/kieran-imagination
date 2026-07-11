/// <reference types="@cloudflare/workers-types" />

declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path?: string);
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): unknown;
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    };
  }
}

declare module 'cloudflare:workers' {
  export class WorkflowEntrypoint<Env = unknown, Params = unknown> {
    protected env: Env;
    constructor(ctx: ExecutionContext, env: Env);
    run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>;
  }

  export interface WorkflowEvent<Params> {
    payload: Params;
    timestamp: Date;
    instanceId: string;
  }

  export interface WorkflowStep {
    do<T>(name: string, callback: () => Promise<T>): Promise<T>;
    do<T>(
      name: string,
      config: { retries?: { limit?: number; delay?: string | number; backoff?: string } },
      callback: () => Promise<T>
    ): Promise<T>;
    sleep(name: string, duration: string | number): Promise<void>;
  }
}
