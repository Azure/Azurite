import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import BlobStorageContext from "../context/BlobStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { AccessPolicy, BlobType } from "../generated/artifacts/models";
import Operation from "../generated/artifacts/operation";
import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import IBlobMetadataStore from "../persistence/IBlobMetadataStore";
import { BlobSASPermission } from "./BlobSASPermissions";
import { BlobSASResourceType } from "./BlobSASResourceType";
import IAuthenticator from "./IAuthenticator";
import {
  generateBlobSASSignature,
  IBlobSASSignatureValues
} from "./IBlobSASSignatureValues";
import {
  OPERATION_BLOB_SAS_BLOB_PERMISSIONS,
  OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS
} from "./OperationBlobSASPermission";

export default class BlobSASAuthenticator implements IAuthenticator {
  public constructor(
    private readonly accountDataStore: IAccountDataStore,
    private readonly blobMetadataStore: IBlobMetadataStore,
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
    const account = blobContext.account;
    if (account === undefined) {
      throw RangeError(
        `BlobSASAuthenticator:validate() account is undefined in context.`
      );
    }

    const containerName = blobContext.container;
    if (containerName === undefined) {
      this.logger.error(
        `BlobSASAuthenticator:validate() container name is undefined in context.`,
        context.contextID
      );
      return undefined;
    }

    const blobName = blobContext.blob;
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

    // Extract blob service SAS authentication required parameters
    const signature = this.decodeIfExist(req.getQuery("sig"));
    this.logger.debug(
      `BlobSASAuthenticator:validate() Retrieved signature from URL parameter sig: ${signature}`,
      context.contextID
    );
    if (signature === undefined) {
      this.logger.debug(
        `BlobSASAuthenticator:validate() No signature found in request. Skip blob service SAS validation.`,
        context.contextID
      );
      return undefined;
    }

    const resource = this.decodeIfExist(req.getQuery("sr"));
    if (
      resource !== BlobSASResourceType.Container &&
      resource !== BlobSASResourceType.Blob &&
      resource !== BlobSASResourceType.BlobSnapshot
    ) {
      this.logger.debug(
        // tslint:disable-next-line:max-line-length
        `BlobSASAuthenticator:validate() Signed resource type ${resource} is invalid. Skip blob service SAS validation.`,
        context.contextID
      );
      return undefined;
    }
    this.logger.debug(
      `BlobSASAuthenticator:validate() Signed resource type is ${resource}.`,
      context.contextID
    );

    const values = this.getBlobSASSignatureValuesFromRequest(
      req,
      containerName,
      blobName
    );
    if (values === undefined) {
      this.logger.info(
        // tslint:disable-next-line:max-line-length
        `BlobSASAuthenticator:validate() Failed to get valid blob service SAS values from request. Skip blob service SAS validation.`,
        context.contextID
      );
      return undefined;
    }

    this.logger.debug(
      `BlobSASAuthenticator:validate() Successfully got valid blob service SAS values from request. ${JSON.stringify(
        values
      )}`,
      context.contextID
    );

    this.logger.info(
      `BlobSASAuthenticator:validate() Validate signature based account key1.`,
      context.contextID
    );
    const [sig1, stringToSign1] = generateBlobSASSignature(
      values,
      resource,
      account,
      accountProperties.key1
    );
    this.logger.debug(
      `BlobSASAuthenticator:validate() String to sign is: ${JSON.stringify(
        stringToSign1
      )}`,
      context.contextID!
    );
    this.logger.debug(
      `BlobSASAuthenticator:validate() Calculated signature is: ${sig1}`,
      context.contextID!
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
      const [sig2, stringToSign2] = generateBlobSASSignature(
        values,
        resource,
        account,
        accountProperties.key2
      );
      this.logger.debug(
        `BlobSASAuthenticator:validate() String to sign is: ${JSON.stringify(
          stringToSign2
        )}`,
        context.contextID!
      );
      this.logger.debug(
        `BlobSASAuthenticator:validate() Calculated signature is: ${sig2}`,
        context.contextID!
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
    } else {
      if (!sig1Pass) {
        return false;
      }
    }

    // When signature validation passes, we enforce blob service SAS validation
    // Any validation errors will stop this request immediately

    // TODO: Validate permissions from ACL identifier by extract permissions, start time and expiry time from ACL
    if (values.identifier !== undefined) {
      const accessPolicy:
        | AccessPolicy
        | undefined = await this.getContainerAccessPolicyByIdentifier(
        account,
        containerName,
        values.identifier
      );
      if (accessPolicy === undefined) {
        this.logger.warn(
          `BlobSASAuthenticator:validate() Cannot get access policy defined for container ${containerName} with id ${
            values.identifier
          }.`,
          context.contextID
        );
        throw StorageErrorFactory.getAuthorizationFailure(context.contextID!);
      }

      values.startTime = accessPolicy.start;
      values.expiryTime = accessPolicy.expiry;
      values.permissions = accessPolicy.permission;
    }

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
        `BlobSASAuthenticator:validate() Operation shouldn't be undefined. Please make sure DispatchMiddleware is hooked before authentication related middleware.`
      );
    }

    const blobSASPermission =
      resource === BlobSASResourceType.Blob
        ? OPERATION_BLOB_SAS_BLOB_PERMISSIONS.get(operation)
        : OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.get(operation);

    this.logger.debug(
      `BlobSASAuthenticator:validate() Got permission requirements for operation ${
        Operation[operation]
      } - ${JSON.stringify(blobSASPermission)}`,
      context.contextID
    );
    if (blobSASPermission === undefined) {
      throw new Error(
        // tslint:disable-next-line:max-line-length
        `BlobSASAuthenticator:validate() ${
          resource === BlobSASResourceType.Blob
            ? "OPERATION_BLOB_SAS_BLOB_PERMISSIONS"
            : "OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS"
        } doesn't have configuration for operation ${
          Operation[operation]
        }'s blob service SAS permission.`
      );
    }

    if (!blobSASPermission.validatePermissions(values.permissions!)) {
      throw StorageErrorFactory.getAuthorizationPermissionMismatch(
        context.contextID!
      );
    }

    // Check 3 special permission requirements
    // If block blob exists, then permission must be Write only
    // If page blob exists, then permission must be Write only
    // If append blob exists, then permission must be Write only
    // If copy destination blob exists, then permission must be Write only
    if (
      operation === Operation.BlockBlob_Upload ||
      operation === Operation.PageBlob_Create ||
      operation === Operation.AppendBlob_Create ||
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
        !values.permissions!.toString().includes(BlobSASPermission.Write)
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
      `BlobSASAuthenticator:validate() Blob service SAS validation successfully.`,
      context.contextID
    );

    // TODO: Handle enforced response headers defined in blob service SAS

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
    const identifier = this.decodeIfExist(req.getQuery("si"));
    const cacheControl = this.decodeIfExist(req.getQuery("rscc"));
    const contentDisposition = this.decodeIfExist(req.getQuery("rscd"));
    const contentEncoding = this.decodeIfExist(req.getQuery("rsce"));
    const contentLanguage = this.decodeIfExist(req.getQuery("rscl"));
    const contentType = this.decodeIfExist(req.getQuery("rsct"));
    const signedResource = this.decodeIfExist(req.getQuery("sr"));
    const snapshot = this.decodeIfExist(req.getQuery("snapshot"));

    if (!identifier && (!permissions || !expiryTime)) {
      this.logger.warn(
        // tslint:disable-next-line:max-line-length
        `BlobSASAuthenticator:generateBlobSASSignature(): Must provide 'permissions' and 'expiryTime' for Blob SAS generation when 'identifier' is not provided.`
      );
      return undefined;
    }

    if (version === undefined) {
      this.logger.warn(
        // tslint:disable-next-line:max-line-length
        `BlobSASAuthenticator:generateBlobSASSignature(): Must provide 'version'.`
      );
      return undefined;
    }

    const blobSASValues: IBlobSASSignatureValues = {
      version,
      protocol,
      startTime,
      expiryTime,
      permissions,
      ipRange,
      containerName,
      blobName,
      identifier,
      cacheControl,
      contentDisposition,
      contentEncoding,
      contentLanguage,
      contentType,
      signedResource,
      snapshot
    };

    return blobSASValues;
  }

  private validateTime(expiry?: Date | string, start?: Date | string): boolean {
    if (expiry === undefined && start === undefined) {
      return true;
    }

    const now = new Date();

    if (expiry !== undefined) {
      const expiryTime = new Date(expiry);
      if (now > expiryTime) {
        return false;
      }
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
    if (sasProtocol.includes(",")) {
      return true;
    } else {
      return sasProtocol.toLowerCase() === requestProtocol;
    }
  }

  private decodeIfExist(value?: string): string | undefined {
    return value === undefined ? value : decodeURIComponent(value);
  }

  private async getContainerAccessPolicyByIdentifier(
    account: string,
    container: string,
    id: string
  ): Promise<AccessPolicy | undefined> {
    try {
      const containerModel = await this.blobMetadataStore.getContainer(
        account,
        container
      );
      if (containerModel === undefined) {
        return undefined;
      }

      if (containerModel.containerAcl === undefined) {
        return undefined;
      }

      for (const acl of containerModel.containerAcl) {
        if (acl.id === id) {
          return acl.accessPolicy;
        }
      }
    } catch (err) {
      return undefined;
    }
  }

  private async blobExist(
    account: string,
    container: string,
    blob: string
  ): Promise<boolean> {
    const blobModel = await this.blobMetadataStore.getBlobType(
      account,
      container,
      blob
    );
    if (blobModel === undefined) {
      return false;
    }

    if (
      blobModel.blobType === BlobType.BlockBlob &&
      blobModel.isCommitted === false
    ) {
      return false;
    }

    return true;
  }
}
