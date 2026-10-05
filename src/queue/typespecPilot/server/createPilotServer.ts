import express, { type Express } from "express";

import type { IServiceHandler } from "../generated/handlers";
import { createPilotRouter } from "./dispatcher";

/**
 * Wires a hand-written `IServiceHandler` implementation (business logic) together with a
 * dispatcher driven by the pilot emitter's generated route metadata, into a real Express app.
 * This is the "handwritten server layer" that actually depends on - rather than merely sitting
 * alongside - the generated `typespec-emitter-pilot/generated/*.ts` artifacts: swap in a
 * different `IServiceHandler` implementation and the same generated contract/dispatcher keeps
 * working unchanged.
 */
export function createPilotServer(handler: IServiceHandler): Express {
  const app = express();
  app.use(express.json());
  app.use(createPilotRouter(handler));
  return app;
}
