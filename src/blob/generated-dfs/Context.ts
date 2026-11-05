/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *
 * DFS Context — wraps the IDfsContext from the DFS middleware layer
 * and provides a typed interface compatible with the generated handler pattern.
 */

import { DfsOperation } from "./artifacts/operation";

export interface IDfsRequestContext {
  requestId: string;
  startTime: Date;
  account?: string;
  filesystem?: string;
  path?: string;
  isSecondary?: boolean;
  operation?: DfsOperation;
  authenticationPath?: string;
}

/**
 * Context object passed to generated DFS handler methods.
 * Mirrors the pattern of src/blob/generated/Context.ts but tailored for DFS.
 */
export default class Context {
  public readonly contextId: string;
  public readonly startTime: Date;
  public readonly account: string | undefined;
  public readonly filesystem: string | undefined;
  public readonly path: string | undefined;
  public operation: DfsOperation | undefined;

  public constructor(dfsContext: IDfsRequestContext) {
    this.contextId = dfsContext.requestId;
    this.startTime = dfsContext.startTime;
    this.account = dfsContext.account;
    this.filesystem = dfsContext.filesystem;
    this.path = dfsContext.path;
    this.operation = dfsContext.operation;
  }
}
