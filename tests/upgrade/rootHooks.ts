import { cleanupCachedNpmInstalls } from "./utils/npmVersionInstaller";

// Mocha root hook plugin: since blob/queue/table upgrade suites share a single
// cached npm install (see npmVersionInstaller.ts), cleanup must happen once,
// after every suite has finished, rather than in each file's own after() hook.
export const mochaHooks = {
  afterAll(): void {
    cleanupCachedNpmInstalls();
  }
};
