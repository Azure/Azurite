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
      options.image
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

// Readiness polling is shared with every other harness - see ./httpProbe.
export { waitForHttpUp } from "./httpProbe";

