import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { installAndRunVsixSession } from "./installAndRunVsixSession";
import { resolveVsixToTest } from "./resolveVsixToTest";
import { getFreePorts } from "../utils/freePorts";

/**
 * Drives the "install vsix, activate, start, stop" regression scenario:
 * downloads a real VS Code test instance, installs the target .vsix into an
 * isolated profile (exactly like a user running `code --install-extension`),
 * then launches it with a tiny driver extension whose test suite calls
 * `azurite.start` / `azurite.close` against the real, installed extension.
 */
async function main(): Promise<void> {
  const { vsixPath, tempDir: vsixTempDir } = await resolveVsixToTest();
  const workspaceDir = mkdtempSync(join(tmpdir(), "azurite-vsix-workspace-"));

  try {
    // Never probe the well-known default ports here - an already-running
    // developer Azurite instance would be mistaken for this installed VSIX
    // (VSCServerManagerBase.start() swallows EADDRINUSE and the lifecycle
    // suite's probe treats any HTTP response as success).
    const [blobPort, queuePort, tablePort] = await getFreePorts(3);

    await installAndRunVsixSession(
      vsixPath,
      workspaceDir,
      join(__dirname, "suite", "index.js"),
      {
        AZURITE_VSIX_LIFECYCLE_BLOB_PORT: String(blobPort),
        AZURITE_VSIX_LIFECYCLE_QUEUE_PORT: String(queuePort),
        AZURITE_VSIX_LIFECYCLE_TABLE_PORT: String(tablePort)
      }
    );
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
    if (vsixTempDir) {
      rmSync(vsixTempDir, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
