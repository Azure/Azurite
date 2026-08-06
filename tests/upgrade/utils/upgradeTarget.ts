import {
  allServicesReady,
  AzuriteProcessHandle
} from "./processHarness";
import {
  DockerContainerOptions,
  runContainer,
  stopAndRemoveContainer,
  waitForHttpUp
} from "./dockerHarness";

export interface UpgradeTargetPorts {
  blobPort: number;
  queuePort: number;
  tablePort: number;
}

/**
 * Common lifecycle shared by every "thing we run an old/new version of
 * Azurite as" in the upgrade suites - an npm-installed process, a locally
 * spawned build, or a Docker container. Test files depend on this interface
 * rather than on a specific harness, so the seed -> stop -> upgrade -> verify
 * orchestration reads identically regardless of how the target is hosted.
 */
export interface UpgradeTarget {
  /** Starts the target and blocks until all three services are reachable. */
  start(): Promise<void>;
  /** Stops (and best-effort cleans up) the target. */
  stop(): Promise<void>;
}

/** Adapts an npm-installed or locally-built Azurite process to `UpgradeTarget`. */
export class NpmProcessTarget implements UpgradeTarget {
  private readonly handle: AzuriteProcessHandle;

  constructor(
    entryPoint: string,
    dataLocation: string,
    private readonly ports: UpgradeTargetPorts,
    extraArgs: string[] = []
  ) {
    this.handle = new AzuriteProcessHandle({
      entryPoint,
      args: [
        "--blobPort",
        `${ports.blobPort}`,
        "--queuePort",
        `${ports.queuePort}`,
        "--tablePort",
        `${ports.tablePort}`,
        "--location",
        dataLocation,
        "--silent",
        "--skipApiVersionCheck",
        ...extraArgs
      ]
    });
  }

  start(): Promise<void> {
    return this.handle.start(
      allServicesReady(
        this.ports.blobPort,
        this.ports.queuePort,
        this.ports.tablePort
      )
    );
  }

  stop(): Promise<void> {
    return this.handle.stop();
  }
}

/** Adapts a Docker container (pulled or locally built image) to `UpgradeTarget`. */
export class DockerContainerTarget implements UpgradeTarget {
  constructor(private readonly options: DockerContainerOptions) {}

  async start(): Promise<void> {
    stopAndRemoveContainer(this.options.containerName);
    runContainer(this.options);
    await waitForHttpUp(this.options.blobPort);
  }

  async stop(): Promise<void> {
    stopAndRemoveContainer(this.options.containerName);
  }
}
