import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import QueueStorageContext from "../context/QueueStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { AccessPolicy } from "../generated/artifacts/models";
import Operation from "../generated/artifacts/operation";
import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import IQueueMetadataStore from "../persistence/IQueueMetadataStore";
import IAuthenticator from "./IAuthenticator";
import {
  generateQueueSASSignature,
  IQueueSASSignatureValues
} from "./IQueueSASSignatureValues";
import { OPERATION_QUEUE_SAS_PERMISSIONS } from "./OperationQueueSASPermission";

export default class QueueSASAuthenticator implements IAuthenticator {
  public constructor(
    private readonly accountDataStore: IAccountDataStore,
    private readonly queueMetadataStore: IQueueMetadataStore,
    private readonly logger: ILogger
  ) {}

  public async validate(
    req: IRequest,
    context: Context
  ): Promise<boolean | undefined> {
    this.logger.info(
      `QueueSASAuthenticator:validate() Start validation against queue service Shared Access Signature pattern.`,
      context.contextID
    );

    this.logger.debug(
      "QueueSASAuthenticator:validate() Getting account properties...",
      context.contextID
    );

    const queueContext = new QueueStorageContext(context);
    const account = queueContext.account;
    if (account === undefined) {
      throw RangeError(
        `QueueSASAuthenticator:validate() account is undefined in context.`
      );
    }

    const queueName = queueContext.queue;
    if (queueName === undefined) {
      this.logger.error(
        `QueueSASAuthenticator:validate() queue name is undefined in context.`,
        context.contextID
      );
      return undefined;
    }

    this.logger.debug(
      // tslint:disable-next-line:max-line-length
      `QueueSASAuthenticator:validate() Retrieved account name from context: ${account}, queue: ${queueName}`,
      context.contextID
    );

    // TODO: Make following async
    const accountProperties = this.accountDataStore.getAccount(account);
    if (accountProperties === undefined) {
      throw StorageErrorFactory.ResourceNotFound(
        context.contextID!
      );
    }
    this.logger.debug(
      "QueueSASAuthenticator:validate() Got account properties successfully.",
      context.contextID
    );

    // Extract blob service SAS authentication required parameters
    const signature = this.decodeIfExist(req.getQuery("sig"));
    this.logger.debug(
      `QueueSASAuthenticator:validate() Retrieved signature from URL parameter sig: ${signature}`,
      context.contextID
    );
    if (signature === undefined) {
      this.logger.debug(
        `QueueSASAuthenticator:validate() No signature found in request. Skip Queue service SAS validation.`,
        context.contextID
      );
      return undefined;
    }

    const values = this.getQueueSASSignatureValuesFromRequest(req, queueName);
    if (values === undefined) {
      this.logger.info(
        // tslint:disable-next-line:max-line-length
        `QueueSASAuthenticator:validate() Failed to get valid queue service SAS values from request. Skip queue service SAS validation.`,
        context.contextID
      );
      return undefined;
    }

    this.logger.debug(
      `QueueSASAuthenticator:validate() Successfully got valid queue service SAS values from request. ${JSON.stringify(
        values
      )}`,
      context.contextID
    );

    this.logger.info(
      `QueueSASAuthenticator:validate() Validate signature based account key1.`,
      context.contextID
    );
    const [sig1, stringToSign1] = generateQueueSASSignature(
      values,
      account,
      accountProperties.key1
    );
    this.logger.debug(
      `QueueSASAuthenticator:validate() String to sign is: ${JSON.stringify(
        stringToSign1
      )}`,
      context.contextID!
    );
    this.logger.debug(
      `QueueSASAuthenticator:validate() Calculated signature is: ${sig1}`,
      context.contextID!
    );

    const sig1Pass = sig1 === signature;
    this.logger.info(
      `QueueSASAuthenticator:validate() Signature based on key1 validation ${
        sig1Pass ? "passed" : "failed"
      }.`,
      context.contextID
    );

    if (!sig1Pass) {
      if (accountProperties.key2 === undefined) {
        return false;
      }

      this.logger.info(
        `QueueSASAuthenticator:validate() Account key2 is not empty, validate signature based account key2.`,
        context.contextID
      );
      const [sig2, stringToSign2] = generateQueueSASSignature(
        values,
        account,
        accountProperties.key2
      );
      this.logger.debug(
        `QueueSASAuthenticator:validate() String to sign is: ${JSON.stringify(
          stringToSign2
        )}`,
        context.contextID!
      );
      this.logger.debug(
        `QueueSASAuthenticator:validate() Calculated signature is: ${sig2}`,
        context.contextID!
      );

      const sig2Pass = sig2 === signature;
      this.logger.info(
        `QueueSASAuthenticator:validate() Signature based on key2 validation ${
          sig2Pass ? "passed" : "failed"
        }.`,
        context.contextID
      );

      if (!sig2Pass) {
        this.logger.info(
          `QueueSASAuthenticator:validate() Validate signature based account key1 and key2 failed.`,
          context.contextID
        );
        return false;
      }
    }

    // When signature validation passes, we enforce queue service SAS validation
    // Any validation errors will stop this request immediately

    // TODO: Validate permissions from ACL identifier by extract permissions, start time and expiry time from ACL
    // TODO: Set ACL without given start time.
    if (values.identifier !== undefined) {
      const accessPolicy:
        | AccessPolicy
        | undefined = await this.getQueueAccessPolicyByIdentifier(
        account,
        queueName,
        values.identifier
      );
      if (accessPolicy === undefined) {
        this.logger.warn(
          `QueueSASAuthenticator:validate() Cannot get access policy defined for queue ${queueName} with id ${
            values.identifier
          }.`,
          context.contextID
        );
        throw StorageErrorFactory.getAuthorizationFailure(context.contextID!);
      }

      // As Azure Storage, SAS with identifier should not contains any overlap values.
      if (
        values.startTime !== undefined ||
        values.expiryTime !== undefined ||
        values.permissions !== undefined
      ) {
        throw StorageErrorFactory.getAuthorizationFailure(context.contextID!);
      }
      values.startTime = accessPolicy.start;
      values.expiryTime = accessPolicy.expiry;
      values.permissions = accessPolicy.permission;
    }

    this.logger.info(
      `QueueSASAuthenticator:validate() Validate start and expiry time.`,
      context.contextID
    );
    if (!this.validateTime(values.expiryTime, values.startTime)) {
      this.logger.info(
        `QueueSASAuthenticator:validate() Validate start and expiry failed.`,
        context.contextID
      );
      throw StorageErrorFactory.getAuthorizationFailure(context.contextID!);
    }

    this.logger.info(
      `QueueSASAuthenticator:validate() Validate IP range.`,
      context.contextID
    );
    if (!this.validateIPRange()) {
      this.logger.info(
        `QueueSASAuthenticator:validate() Validate IP range failed.`,
        context.contextID
      );
      throw StorageErrorFactory.getAuthorizationSourceIPMismatch(
        context.contextID!
      );
    }

    this.logger.info(
      `QueueSASAuthenticator:validate() Validate request protocol.`,
      context.contextID
    );
    if (!this.validateProtocol(values.protocol, req.getProtocol())) {
      this.logger.info(
        `QueueSASAuthenticator:validate() Validate protocol failed.`,
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
        `QueueSASAuthenticator:validate() Operation shouldn't be undefined. Please make sure DispatchMiddleware is hooked before authentication related middleware.`
      );
    }

    const queueSASPermission = OPERATION_QUEUE_SAS_PERMISSIONS.get(operation);

    this.logger.debug(
      `QueueSASAuthenticator:validate() Got permission requirements for operation ${
        Operation[operation]
      } - ${JSON.stringify(queueSASPermission)}`,
      context.contextID
    );
    if (queueSASPermission === undefined) {
      throw new Error(
        // tslint:disable-next-line:max-line-length
        `QueueSASAuthenticator:validate() OPERATION_QUEUE_SAS_PERMISSIONS doesn't have configuration for operation ${
          Operation[operation]
        }'s queue service SAS permission.`
      );
    }

    if (!queueSASPermission.validatePermissions(values.permissions!)) {
      throw StorageErrorFactory.getAuthorizationPermissionMismatch(
        context.contextID!
      );
    }

    return true;
  }

  private getQueueSASSignatureValuesFromRequest(
    req: IRequest,
    queueName: string
  ): IQueueSASSignatureValues | undefined {
    const version = this.decodeIfExist(req.getQuery("sv"));
    const protocol = this.decodeIfExist(req.getQuery("spr"));
    const startTime = this.decodeIfExist(req.getQuery("st"));
    const expiryTime = this.decodeIfExist(req.getQuery("se"));
    const permissions = this.decodeIfExist(req.getQuery("sp"));
    const ipRange = this.decodeIfExist(req.getQuery("sip"));
    const identifier = this.decodeIfExist(req.getQuery("si"));

    if (!identifier && (!permissions || !expiryTime)) {
      this.logger.warn(
        // tslint:disable-next-line:max-line-length
        `QueueSASAuthenticator:generateQueueSASSignature(): Must provide 'permissions' and 'expiryTime' for Queue SAS generation when 'identifier' is not provided.`
      );
      return undefined;
    }

    if (version === undefined) {
      this.logger.warn(
        // tslint:disable-next-line:max-line-length
        `QueueSASAuthenticator:generateQueueSASSignature(): Must provide 'version'.`
      );
      return undefined;
    }

    const queueSASValues: IQueueSASSignatureValues = {
      version,
      protocol,
      startTime,
      expiryTime,
      permissions,
      ipRange,
      identifier,
      queueName
    };

    return queueSASValues;
  }

  private validateTime(expiry?: Date | string, start?: Date | string): boolean {
    // start is optional, expire is required, per https://learn.microsoft.com/en-us/rest/api/storageservices/create-service-sas#specify-the-access-policy
    if (expiry === undefined) {
      return false;
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

  private async getQueueAccessPolicyByIdentifier(
    account: string,
    queue: string,
    id: string
  ): Promise<AccessPolicy | undefined> {
    try {
      const queueModel = await this.queueMetadataStore.getQueue(account, queue);

      if (queueModel === undefined) {
        return undefined;
      }

      if (queueModel.queueAcl === undefined) {
        return undefined;
      }

      for (const acl of queueModel.queueAcl) {
        if (acl.id === id) {
          return acl.accessPolicy;
        }
      }

      return undefined;
    } catch (err) {
      return undefined;
    }
  }
}
