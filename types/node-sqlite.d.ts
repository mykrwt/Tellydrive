// Minimal type declarations for Node's experimental `node:sqlite` module
// (available in Node 22+). Not shipped by @types/node@20, so declared here.
declare module "node:sqlite" {
  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export interface StatementSync {
    get(...params: unknown[]): Record<string, any> | undefined;
    all(...params: unknown[]): Record<string, any>[];
    run(...params: unknown[]): StatementResultingChanges;
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
