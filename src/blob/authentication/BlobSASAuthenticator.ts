import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import BlobStorageContext from "../context/BlobStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import StrictModelNotSupportedError from "../errors/StrictModelNotSupportedError";
import { AccessPolicy, BlobType } from "../generated/artifacts/models";
import Operation from "../generated/artifacts/operation";
import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import IBlobMetadataStore from "../persistence/IBlobMetadataStore";
import { AUTHENTICATION_BEARERTOKEN_REQUIRED } from "../utils/constants";
import { getUserDelegationKeyValue } from "../utils/utils";
import { BlobSASPermission } from "./BlobSASPermissions";
import { BlobSASResourceType } from "./BlobSASResourceType";
import IAuthenticator from "./IAuthenticator";
import {
  generateBlobSASSignature,
  generateBlobSASSignatureWithUDK,
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
      context.contextId
    );

    this.logger.debug(
      "BlobSASAuthenticator:validate() Getting account properties...",
      context.contextId
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
        context.contextId
      );
      return undefined;
    }

    const blobName = blobContext.blob;
    this.logger.debug(
      // tslint:disable-next-line:max-line-length
      `BlobSASAuthenticator:validate() Retrieved account name from context: ${account}, container: ${containerName}, blob: ${blobName}`,
      context.contextId
    );

    // TODO: Make following async
    const accountProperties = this.accountDataStore.getAccount(account);
    if (accountProperties === undefined) {
      throw StorageErrorFactory.ResourceNotFound(
        blobContext.contextId!
      );
    }
    this.logger.debug(
      "BlobSASAuthenticator:validate() Got account properties successfully.",
      context.contextId
    );

    // Extract blob service SAS authentication required parameters
    const signature = this.decodeIfExist(req.getQuery("sig"));
    this.logger.debug(
      `BlobSASAuthenticator:validate() Retrieved signature from URL parameter sig: ${signature}`,
      context.contextId
    );
    if (signature === undefined) {
      this.logger.debug(
        `BlobSASAuthenticator:validate() No signature found in request. Skip blob service SAS validation.`,
        context.contextId
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
        context.contextId
      );
      return undefined;
    }
    this.logger.debug(
      `BlobSASAuthenticator:validate() Signed resource type is ${resource}.`,
      context.contextId
    );

    const values = this.getBlobSASSignatureValuesFromRequest(
      req,
      containerName,
      blobName,
      context
    );
    if (values === undefined) {
      this.logger.info(
        // tslint:disable-next-line:max-line-length
        `BlobSASAuthenticator:validate() Failed to get valid blob service SAS values from request. Skip blob service SAS validation.`,
        context.contextId
      );
      return undefined;
    }

    this.logger.debug(
      `BlobSASAuthenticator:validate() Successfully got valid blob service SAS values from request. ${JSON.stringify(
        values
      )}`,
      context.contextId
    );

    if (!context.context.loose && values.encryptionScope !== undefined)
    {
      throw new StrictModelNotSupportedError("SAS Encryption Scope 'ses'", context.contextId);
    }

    if (values.signedObjectId
      || values.signedTenantId
      || values.signedService
      || values.signedVersion
      || values.signedStartsOn
      || values.signedExpiresOn) {
      this.logger.info(
        `BlobSASAuthenticator:validate() Validate signature based on user delegation key.`,
        context.contextId
      );

      if (!values.signedObjectId
        || !values.signedTenantId
        || !values.signedStartsOn
        || !values.signedExpiresOn
        || !values.signedService
        || !values.signedVersion
        || values.signedService !== "b") {
        this.logger.info(
          `BlobSASAuthenticator:validate() Signature based on user delegation key validation failed"
          }.`,
          context.contextId
        );
        throw StorageErrorFactory.getAuthorizationFailure(context.contextId!);
      }

      const savedPolicy = this.decodeIfExist(req.getQuery("si"));
      if (savedPolicy) {
        this.logger.info(
          `BlobSASAuthenticator:validate() Access policy used in UDK SAS.`,
          context.contextId
        );
        throw StorageErrorFactory.getAuthorizationFailure(context.contextId!);
      }

      this.logger.info(
        `BlobSASAuthenticator:validate() Validate UDK start and expiry time.`,
        context.contextId
      );

      if (!this.validateTime(values.signedExpiresOn!, values.signedStartsOn!)) {
        this.logger.info(
          `BlobSASAuthenticator:validate() Validate UDK start and expiry failed.`,
          context.contextId
        );
        throw StorageErrorFactory.getAuthorizationFailure(context.contextId!);
      }

      const keyValue = getUserDelegationKeyValue(
        values.signedObjectId!,
        values.signedTenantId!,
        values.signedStartsOn!,
        values.signedExpiresOn!,
        values.signedVersion!
      );
      const [sig, stringToSign] = generateBlobSASSignatureWithUDK(
        values,
        resource,
        account,
        Buffer.from(keyValue, "base64")
      );

      this.logger.debug(
        `BlobSASAuthenticator:validate() String to sign is: ${JSON.stringify(
          stringToSign
        )}`,
        context.contextId!
      );
      this.logger.debug(
        `BlobSASAuthenticator:validate() Calculated signature is: ${sig}`,
        context.contextId!
      );

      const sigPass = sig === signature;
      this.logger.info(
        `BlobSASAuthenticator:validate() Signature based on UDK ${
          sigPass ? "passed" : "failed"
        }.`,
        context.contextId
      );

      if (!sigPass) {
        return sigPass;
      }
    }
    else {
      this.logger.info(
        `BlobSASAuthenticator:validate() Validate signature based account key1.`,
        context.contextId
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
        context.contextId!
      );
      this.logger.debug(
        `BlobSASAuthenticator:validate() Calculated signature is: ${sig1}`,
        context.contextId!
      );

      const sig1Pass = sig1 === signature;
      this.logger.info(
        `BlobSASAuthenticator:validate() Signature based on key1 validation ${
          sig1Pass ? "passed" : "failed"
        }.`,
        context.contextId
      );

      if (accountProperties.key2 !== undefined) {
        this.logger.info(
          `BlobSASAuthenticator:validate() Account key2 is not empty, validate signature based account key2.`,
          context.contextId
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
          context.contextId!
        );
        this.logger.debug(
          `BlobSASAuthenticator:validate() Calculated signature is: ${sig2}`,
          context.contextId!
        );

        const sig2Pass = sig2 === signature;
        this.logger.info(
          `BlobSASAuthenticator:validate() Signature based on key2 validation ${
            sig2Pass ? "passed" : "failed"
          }.`,
          context.contextId
        );

        if (!sig2Pass && !sig1Pass) {
          this.logger.info(
            `BlobSASAuthenticator:validate() Validate signature based account key1 and key2 failed.`,
            context.contextId
          );
          return false;
        }
      } else {
        if (!sig1Pass) {
          return false;
        }
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
        values.identifier,
        context
      );
      if (accessPolicy === undefined) {
        this.logger.warn(
          `BlobSASAuthenticator:validate() Cannot get access policy defined for container ${containerName} with id ${values.identifier}.`,
          context.contextId
        );
        throw StorageErrorFactory.getAuthorizationFailure(context.contextId!);
      }

      values.startTime = accessPolicy.start;
      values.expiryTime = accessPolicy.expiry;
      values.permissions = accessPolicy.permission;
    }

    this.logger.info(
      `BlobSASAuthenticator:validate() Validate start and expiry time.`,
      context.contextId
    );
    if (!this.validateTime(values.expiryTime, values.startTime)) {
      this.logger.info(
        `BlobSASAuthenticator:validate() Validate start and expiry failed.`,
        context.contextId
      );
      throw StorageErrorFactory.getAuthorizationFailure(context.contextId!);
    }

    this.logger.info(
      `BlobSASAuthenticator:validate() Validate IP range.`,
      context.contextId
    );
    if (!this.validateIPRange()) {
      this.logger.info(
        `BlobSASAuthenticator:validate() Validate IP range failed.`,
        context.contextId
      );
      throw StorageErrorFactory.getAuthorizationSourceIPMismatch(
        context.contextId!
      );
    }

    this.logger.info(
      `BlobSASAuthenticator:validate() Validate request protocol.`,
      context.contextId
    );
    if (!this.validateProtocol(values.protocol, req.getProtocol())) {
      this.logger.info(
        `BlobSASAuthenticator:validate() Validate protocol failed.`,
        context.contextId
      );
      throw StorageErrorFactory.getAuthorizationProtocolMismatch(
        context.contextId!
      );
    }

    const operation = context.operation;
    if (operation === undefined) {
      throw new Error(
        // tslint:disable-next-line:max-line-length
        `BlobSASAuthenticator:validate() Operation shouldn't be undefined. Please make sure DispatchMiddleware is hooked before authentication related middleware.`
      );
    }
    else if (operation === Operation.Service_GetUserDelegationKey) {
      this.logger.info(
        `BlobSASAuthenticator:validate() Service_GetUserDelegationKey requires OAuth credentials"
        }.`,
        context.contextId
      );
      throw StorageErrorFactory.getAuthenticationFailed(context.contextId!,
        AUTHENTICATION_BEARERTOKEN_REQUIRED);
    }

    const blobSASPermission =
      resource === BlobSASResourceType.Blob
        ? OPERATION_BLOB_SAS_BLOB_PERMISSIONS.get(operation)
        : OPERATION_BLOB_SAS_CONTAINER_PERMISSIONS.get(operation);

    this.logger.debug(
      `BlobSASAuthenticator:validate() Got permission requirements for operation ${
        Operation[operation]
      } - ${JSON.stringify(blobSASPermission)}`,
      context.contextId
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
        context.contextId!
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
      operation === Operation.Blob_StartCopyFromURL ||
      operation === Operation.Blob_CopyFromURL
    ) {
      this.logger.info(
        `BlobSASAuthenticator:validate() For ${Operation[operation]}, if blob exists, the permission must be Write.`,
        context.contextId
      );

      if (
        (await this.blobExist(account, containerName!, blobName!)) &&
        !values.permissions!.toString().includes(BlobSASPermission.Write)
      ) {
        this.logger.info(
          `BlobSASAuthenticator:validate() Account SAS validation failed for special requirement.`,
          context.contextId
        );
        throw StorageErrorFactory.getAuthorizationPermissionMismatch(
          context.contextId!
        );
      }
    }

    this.logger.info(
      `BlobSASAuthenticator:validate() Blob service SAS validation successfully.`,
      context.contextId
    );

    // TODO: Handle enforced response headers defined in blob service SAS

    return true;
  }

  private getBlobSASSignatureValuesFromRequest(
    req: IRequest,
    containerName: string,
    blobName?: string,
    context?: Context
  ): IBlobSASSignatureValues | undefined {
    const version = this.decodeIfExist(req.getQuery("sv"));
    const protocol = this.decodeIfExist(req.getQuery("spr"));
    const startTime = this.decodeIfExist(req.getQuery("st"));
    const expiryTime = this.decodeIfExist(req.getQuery("se"));
    const permissions = this.decodeIfExist(req.getQuery("sp"));
    const ipRange = this.decodeIfExist(req.getQuery("sip"));
    const identifier = this.decodeIfExist(req.getQuery("si"));
    const cacheControl = req.getQuery("rscc");
    const contentDisposition = req.getQuery("rscd");
    const contentEncoding = req.getQuery("rsce");
    const contentLanguage = req.getQuery("rscl");
    const contentType = req.getQuery("rsct");
    const signedResource = this.decodeIfExist(req.getQuery("sr"));
    const snapshot = this.decodeIfExist(req.getQuery("snapshot"));
    const encryptionScope = this.decodeIfExist(req.getQuery("ses"));
    const signedObjectId = this.decodeIfExist(req.getQuery("skoid"));
    const signedTenantId = this.decodeIfExist(req.getQuery("sktid"));
    const signedStartsOn = this.decodeIfExist(req.getQuery("skt"));
    const signedExpiresOn = this.decodeIfExist(req.getQuery("ske"));
    const signedVersion = this.decodeIfExist(req.getQuery("skv"));
    const signedService = this.decodeIfExist(req.getQuery("sks"));

    if (!identifier && (!permissions || !expiryTime)) {
      this.logger.warn(
        // tslint:disable-next-line:max-line-length
        `BlobSASAuthenticator:generateBlobSASSignature(): Must provide 'permissions' and 'expiryTime' for Blob SAS generation when 'identifier' is not provided.`,
        context ? context.contextId : undefined
      );
      return undefined;
    }

    if (version === undefined) {
      this.logger.warn(
        // tslint:disable-next-line:max-line-length
        `BlobSASAuthenticator:generateBlobSASSignature(): Must provide 'version'.`,
        context ? context.contextId : undefined
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
      encryptionScope,
      cacheControl,
      contentDisposition,
      contentEncoding,
      contentLanguage,
      contentType,
      signedResource,
      snapshot,
      signedObjectId,
      signedTenantId,
      signedService,
      signedVersion,
      signedStartsOn,
      signedExpiresOn
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
    id: string,
    context: Context
  ): Promise<AccessPolicy | undefined> {
    try {
      const containerModel = await this.blobMetadataStore.getContainerACL(
        context,
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
