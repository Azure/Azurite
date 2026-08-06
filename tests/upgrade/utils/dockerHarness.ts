import { execFileSync } from "child_process";

export interface DockerContainerOptions {
  image: string;
  containerName: string;
  /** Host directory bind-mounted to the container's /data volume. */
  volumeHostDir: string;
  blobPort: number;
  queuePort: number;
  tablePort: number;
}

/** Thin wrapper around the `docker` CLI - no assumptions about image origin (pulled or locally built). */
export function pullImage(image: string): void {
  execFileSync("docker", ["pull", image], { stdio: "inherit" });
}

export function buildLocalImage(tag: string, contextDir: string): void {
  execFileSync(
    "docker",
    ["build", "-t", tag, "-f", "Dockerfile", "."],
    { stdio: "inherit", cwd: contextDir }
  );
}

export function runContainer(options: DockerContainerOptions): void {
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      options.containerName,
      "-p",
      `${options.blobPort}:10000`,
      "-p",
      `${options.queuePort}:10001`,
      "-p",
      `${options.tablePort}:10002`,
      "-v",
      `${options.volumeHostDir}:/data`,
      options.image,
      // The image's Dockerfile only declares CMD (no ENTRYPOINT), so any
      // args passed here replace it entirely - re-specify the default
      // startup args and add --skipApiVersionCheck, since the SDK client
      // under test may send a newer x-ms-version than an older published
      // image supports.
      "azurite",
      "-l",
      "/data",
      "--blobHost",
      "0.0.0.0",
      "--queueHost",
      "0.0.0.0",
      "--tableHost",
      "0.0.0.0",
      "--skipApiVersionCheck"
    ],
    { stdio: "inherit" }
  );
}

export function stopAndRemoveContainer(containerName: string): void {
  try {
    execFileSync("docker", ["stop", containerName], { stdio: "ignore" });
  } catch {
    // Container may already be stopped/removed - nothing to do.
  }
  try {
    execFileSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
  } catch {
    // Already removed.
  }
}

export function removeImage(tag: string): void {
  try {
    execFileSync("docker", ["rmi", "-f", tag], { stdio: "ignore" });
  } catch {
    // Best-effort cleanup only.
  }
}

/**
 * Azurite runs as root inside the container, so files it writes into a
 * bind-mounted volume are root-owned on the host. On CI runners (non-root
 * user) that leaves the test process unable to delete them afterwards.
 * Reset ownership back to the current host user via a throwaway container
 * using `image` (which must still be present locally) before cleanup.
 */
export function resetVolumeOwnership(volumeHostDir: string, image: string): void {
  try {
    const uid = process.getuid?.() ?? 0;
    const gid = process.getgid?.() ?? 0;
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "--entrypoint",
        "chown",
        "-v",
        `${volumeHostDir}:/data`,
        image,
        "-R",
        `${uid}:${gid}`,
        "/data"
      ],
      { stdio: "ignore" }
    );
  } catch {
    // Best-effort - if this fails, the subsequent rmSync may also fail,
    // but we don't want cleanup issues to mask the actual test result.
  }
}

// Readiness polling is shared with every other harness - see ./httpProbe.
export { waitForHttpUp } from "./httpProbe";

