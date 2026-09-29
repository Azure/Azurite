import Context from "../generated/Context";

/**
 * Creates a minimal Context object suitable for passing to IBlobMetadataStore methods.
 * DFS handlers don't go through the generated middleware pipeline, so we create
 * context objects manually with the required fields.
 */
export function createStorageContext(requestId?: string): Context {
  const holder: any = {};
  const ctx = new Context(holder, "ctx");
  ctx.startTime = new Date();
  ctx.contextId = requestId;
  return ctx;
}
