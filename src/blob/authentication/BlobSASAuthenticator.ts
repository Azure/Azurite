import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import BlobStorageContext from "../context/BlobStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { BlobType } from "../generated/artifacts/models";
import Operation from "../generated/artifacts/operation";
import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import IBlobDataStore from "../persistence/IBlobDataStore";
import { AccountSASPermission } from "./AccountSASPermissions";
import { generateAccountSASSignature } from "./IAccountSASSignatureValues";
import IAuthenticator from "./IAuthenticator";
import {
  BlobSASResourceType,
  IBlobSASSignatureValues
} from "./IBlobSASSignatureValues";
import OPERATION_ACCOUNT_SAS_PERMISSIONS from "./OperationAccountSASPermission";

export default class BlobSASAuthenticator implements IAuthenticator {
  public constructor(
    private readonly accountDataStore: IAccountDataStore,
    private readonly blobDataStore: IBlobDataStore,
    private readonly logger: ILogger
  ) {}

  public async validate(
    req: IRequest,
    context: Context
  ): Promise<boolean | undefined> {
    this.logger.info(
      `BlobSASAuthenticator:validate() Start validation against blob service Shared Access Signature pattern.`,
      context.contextID
    );

    this.logger.debug(
      "BlobSASAuthenticator:validate() Getting account properties...",
      context.contextID
    );

    const blobContext = new BlobStorageContext(context);
    const account: string = blobContext.account!;
    const containerName: string | undefined = blobContext.container;
    const blobName: string | undefined = blobContext.blob;
    this.logger.debug(
      // tslint:disable-next-line:max-line-length
      `BlobSASAuthenticator:validate() Retrieved account name from context: ${account}, container: ${containerName}, blob: ${blobName}`,
      context.contextID
    );

    // TODO: Make following async
    const accountProperties = this.accountDataStore.getAccount(account);
    if (accountProperties === undefined) {
      throw StorageErrorFactory.getInvalidOperation(
        context.contextID!,
        "Invalid storage account."
      );
    }
    this.logger.debug(
      "BlobSASAuthenticator:validate() Got account properties successfully.",
      context.contextID
    );

    const signature = this.decodeIfExist(req.getQuery("sig"));
    this.logger.debug(
      `BlobSASAuthenticator:validate() Retrieved signature from URL parameter sig: ${signature}`,
      context.contextID
    );
    if (signature === undefined) {
      this.logger.debug(
        `BlobSASAuthenticator:validate() Skip blob serivce SAS validation. No signature found in request.`,
        context.contextID
      );
      return undefined;
    }

    const resource = this.decodeIfExist(req.getQuery("sr"));
    if (
      resource === undefined ||
      (resource !== BlobSASResourceType.Container &&
        resource !== BlobSASResourceType.Blob)
    ) {
      this.logger.debug(
        // tslint:disable-next-line:max-line-length
        `BlobSASAuthenticator:validate() Skip blob serivce SAS validation. Signed resource type ${resource} is invalid.`,
        context.contextID
      );
      return undefined;
    }

    const values = this.getAccountSASSignatureValuesFromRequest(req);
    if (values === undefined) {
      this.logger.info(
        `BlobSASAuthenticator:validate() Failed to get valid account SAS values from request.`,
        context.contextID
      );
      return false;
    }
    this.logger.debug(
      `BlobSASAuthenticator:validate() Successfully got valid account SAS values from request. ${JSON.stringify(
        values
      )}`,
      context.contextID
    );

    this.logger.info(
      `BlobSASAuthenticator:validate() Validate signature based account key1.`,
      context.contextID
    );
    const sig1 = generateAccountSASSignature(
      values,
      account,
      accountProperties.key1
    );

    const sig1Pass = sig1 === signature;
    this.logger.info(
      `BlobSASAuthenticator:validate() Signature based on key1 validation ${
        sig1Pass ? "passed" : "failed"
      }.`,
      context.contextID
    );

    if (accountProperties.key2 !== undefined) {
      this.logger.info(
        `BlobSASAuthenticator:validate() Account key2 is not empty, validate signature based account key2.`,
        context.contextID
      );
      const sig2 = generateAccountSASSignature(
        values,
        account,
        accountProperties.key2
      );

      const sig2Pass = sig2 !== signature;
      this.logger.info(
        `BlobSASAuthenticator:validate() Signature based on key2 validation ${
          sig2Pass ? "passed" : "failed"
        }.`,
        context.contextID
      );

      if (!sig2Pass && !sig1Pass) {
        this.logger.info(
          `BlobSASAuthenticator:validate() Validate signature based account key1 and key2 failed.`,
          context.contextID
        );
        return false;
      }
    }

    // When signature validation passes, we enforce account SAS validation
    // Any validation errors will stop this request immediately

    this.logger.info(
      `BlobSASAuthenticator:validate() Validate start and expiry time.`,
      context.contextID
    );
    if (!this.validateTime(values.expiryTime, values.startTime)) {
      this.logger.info(
        `BlobSASAuthenticator:validate() Validate start and expiry failed.`,
        context.contextID
      );
      throw StorageErrorFactory.getAuthorizationFailure(context.contextID!);
    }

    this.logger.info(
      `BlobSASAuthenticator:validate() Validate IP range.`,
      context.contextID
    );
    if (!this.validateIPRange()) {
      this.logger.info(
        `BlobSASAuthenticator:validate() Validate IP range failed.`,
        context.contextID
      );
      throw StorageErrorFactory.getAuthorizationSourceIPMismatch(
        context.contextID!
      );
    }

    this.logger.info(
      `BlobSASAuthenticator:validate() Validate request protocol.`,
      context.contextID
    );
    if (!this.validateProtocol(values.protocol, req.getProtocol())) {
      this.logger.info(
        `BlobSASAuthenticator:validate() Validate protocol failed.`,
        context.contextID
      );
      throw StorageErrorFactory.getAuthorizationProtocolMismatch(
        context.contextID!
      );
    }

    const operation = context.operation;
    if (operation === undefined) {
      throw new Error(
        // tslint:disable-next-line:max-line-length
        `BlobSASAuthenticator:validate() operation shouldn't be undefined. Please make sure DispatchMiddleware is hooked before authentication related middleware.`
      );
    }

    const accountSASPermission = OPERATION_ACCOUNT_SAS_PERMISSIONS.get(
      operation
    );
    this.logger.debug(
      `BlobSASAuthenticator:validate() Got permission requirements for operation ${
        Operation[operation]
      } - ${JSON.stringify(accountSASPermission)}`,
      context.contextID
    );
    if (accountSASPermission === undefined) {
      throw new Error(
        // tslint:disable-next-line:max-line-length
        `BlobSASAuthenticator:validate() OPERATION_ACCOUNT_SAS_PERMISSIONS doesn't have configuration for operation ${
          Operation[operation]
        }'s account SAS permission.`
      );
    }

    if (!accountSASPermission.validateServices(values.services)) {
      throw StorageErrorFactory.getAuthorizationServiceMismatch(
        context.contextID!
      );
    }

    if (!accountSASPermission.validateResourceTypes(values.resourceTypes)) {
      throw StorageErrorFactory.getAuthorizationResourceTypeMismatch(
        context.contextID!
      );
    }

    if (!accountSASPermission.validatePermissions(values.permissions)) {
      throw StorageErrorFactory.getAuthorizationPermissionMismatch(
        context.contextID!
      );
    }

    // Check 3 special permission requirements
    // If block blob exists, then permission must be Write only
    // If page blob exists, then permission must be Write only
    // If destination blob exists, then permission must be Write only
    if (
      operation === Operation.BlockBlob_Upload ||
      operation === Operation.PageBlob_Create ||
      operation === Operation.Blob_StartCopyFromURL
    ) {
      this.logger.info(
        `BlobSASAuthenticator:validate() For ${
          Operation[operation]
        }, if blob exists, the permission must be Write.`,
        context.contextID
      );

      if (
        (await this.blobExist(account, containerName!, blobName!)) &&
        accountSASPermission.permission !== AccountSASPermission.Write
      ) {
        this.logger.info(
          `BlobSASAuthenticator:validate() Account SAS validation failed for special requirement.`,
          context.contextID
        );
        throw StorageErrorFactory.getAuthorizationPermissionMismatch(
          context.contextID!
        );
      }
    }

    this.logger.info(
      `BlobSASAuthenticator:validate() Account SAS validation successfully.`,
      context.contextID
    );

    return true;
  }

  private getBlobSASSignatureValuesFromRequest(
    req: IRequest,
    containerName: string,
    blobName?: string
  ): IBlobSASSignatureValues | undefined {
    const version = this.decodeIfExist(req.getQuery("sv"));
    const protocol = this.decodeIfExist(req.getQuery("spr"));
    const startTime = this.decodeIfExist(req.getQuery("st"));
    const expiryTime = this.decodeIfExist(req.getQuery("se"));
    const permissions = this.decodeIfExist(req.getQuery("sp"));
    const ipRange = this.decodeIfExist(req.getQuery("sip"));
    const services = this.decodeIfExist(req.getQuery("ss"));
    const resourceTypes = this.decodeIfExist(req.getQuery("srt"));
    const signature = this.decodeIfExist(req.getQuery("sig"));

    if (
      version === undefined ||
      expiryTime === undefined ||
      permissions === undefined ||
      services === undefined ||
      resourceTypes === undefined ||
      signature === undefined
    ) {
      return undefined;
    }

    const blobSASValues: IBlobSASSignatureValues = {
      version,
      protocol,
      startTime,
      expiryTime,
      permissions,
      ipRange,
      services,
      resourceTypes
    };

    return blobSASValues;
  }

  private validateTime(expiry: Date | string, start?: Date | string): boolean {
    const expiryTime = new Date(expiry);
    const now = new Date();

    if (now > expiryTime) {
      return false;
    }

    if (start !== undefined) {
      const startTime = new Date(start);
      if (now < startTime) {
        return false;
      }
    }

    return true;
  }

  private validateIPRange(): boolean {
    // TODO: Emulator doesn't validate IP Address
    return true;
  }

  private validateProtocol(
    sasProtocol: string = "https,http",
    requestProtocol: string
  ): boolean {
    return sasProtocol.toLowerCase().includes(requestProtocol.toLowerCase());
  }

  private decodeIfExist(value?: string): string | undefined {
    return value === undefined ? value : decodeURIComponent(value);
  }

  private async blobExist(
    account: string,
    container: string,
    blob: string
  ): Promise<boolean> {
    const blobModel = await this.blobDataStore.getBlob(
      account,
      container,
      blob
    );
    if (blobModel === undefined) {
      return false;
    }

    if (
      blobModel.properties.blobType === BlobType.BlockBlob &&
      blobModel.isCommitted === false
    ) {
      return false;
    }

    return true;
  }
}
