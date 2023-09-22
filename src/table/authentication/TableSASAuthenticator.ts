import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import TableStorageContext from "../context/TableStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { AccessPolicy } from "../generated/artifacts/models";
import Operation from "../generated/artifacts/operation";
import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import ITableMetadataStore from "../persistence/ITableMetadataStore";
import IAuthenticator from "./IAuthenticator";
import {
  generateTableSASSignature,
  ITableSASSignatureValues
} from "./ITableSASSignatureValues";
import { OPERATION_TABLE_SAS_TABLE_PERMISSIONS } from "./OperationTableSASPermission";

export default class TableSASAuthenticator implements IAuthenticator {
  public constructor(
    private readonly accountDataStore: IAccountDataStore,
    private readonly tableMetadataStore: ITableMetadataStore,
    private readonly logger: ILogger
  ) {}

  public async validate(
    req: IRequest,
    context: Context
  ): Promise<boolean | undefined> {
    this.logger.info(
      `TableSASAuthenticator:validate() Start validation against table service Shared Access Signature pattern.`,
      context.contextID
    );

    this.logger.debug(
      "TableSASAuthenticator:validate() Getting account properties...",
      context.contextID
    );

    const tableContext = new TableStorageContext(context);
    const account = tableContext.account;
    if (account === undefined) {
      throw RangeError(
        `TableSASAuthenticator:validate() account is undefined in context.`
      );
    }

    const tableName = tableContext.tableName;

    if (tableName === undefined) {
      this.logger.error(
        `TableSASAuthenticator:validate() table name is undefined in context.`,
        context.contextID
      );
      return undefined;
    }

    this.logger.debug(
      // tslint:disable-next-line:max-line-length
      `TableSASAuthenticator:validate() Retrieved account name from context: ${account}, table: ${tableName}`,
      context.contextID
    );

    // TODO: Make following async
    const accountProperties = this.accountDataStore.getAccount(account);
    if (accountProperties === undefined) {
      throw StorageErrorFactory.ResourceNotFound(
        context
      );
    }
    this.logger.debug(
      "TableSASAuthenticator:validate() Got account properties successfully.",
      context.contextID
    );

    // Extract table service SAS authentication required parameters
    const signature = this.decodeIfExist(req.getQuery("sig"));
    this.logger.debug(
      `TableSASAuthenticator:validate() Retrieved signature from URL parameter sig: ${signature}`,
      context.contextID
    );
    if (signature === undefined) {
      this.logger.debug(
        `TableSASAuthenticator:validate() No signature found in request. Skip table service SAS validation.`,
        context.contextID
      );
      return undefined;
    }

    const values = this.getTableSASSignatureValuesFromRequest(
      req,
      tableName,
      context
    );
    if (values === undefined) {
      this.logger.info(
        // tslint:disable-next-line:max-line-length
        `TableSASAuthenticator:validate() Failed to get valid table service SAS values from request. Skip table service SAS validation.`,
        context.contextID
      );
      return undefined;
    }

    this.logger.debug(
      `TableSASAuthenticator:validate() Successfully got valid table service SAS values from request. ${JSON.stringify(
        values
      )}`,
      context.contextID
    );

    this.logger.info(
      `TableSASAuthenticator:validate() Validate signature based account key1.`,
      context.contextID
    );
    const [sig1, stringToSign1] = generateTableSASSignature(
      values,
      account,
      accountProperties.key1
    );
    this.logger.debug(
      `TableSASAuthenticator:validate() String to sign is: ${JSON.stringify(
        stringToSign1
      )}`,
      context.contextID!
    );
    this.logger.debug(
      `TableSASAuthenticator:validate() Calculated signature is: ${sig1}`,
      context.contextID!
    );

    const sig1Pass = sig1 === signature;
    this.logger.info(
      `TableSASAuthenticator:validate() Signature based on key1 validation ${
        sig1Pass ? "passed" : "failed"
      }.`,
      context.contextID
    );

    if (accountProperties.key2 !== undefined) {
      this.logger.info(
        `TableSASAuthenticator:validate() Account key2 is not empty, validate signature based account key2.`,
        context.contextID
      );
      const [sig2, stringToSign2] = generateTableSASSignature(
        values,
        account,
        accountProperties.key2
      );
      this.logger.debug(
        `TableSASAuthenticator:validate() String to sign is: ${JSON.stringify(
          stringToSign2
        )}`,
        context.contextID!
      );
      this.logger.debug(
        `TableSASAuthenticator:validate() Calculated signature is: ${sig2}`,
        context.contextID!
      );

      const sig2Pass = sig2 === signature;
      this.logger.info(
        `TableSASAuthenticator:validate() Signature based on key2 validation ${
          sig2Pass ? "passed" : "failed"
        }.`,
        context.contextID
      );

      if (!sig2Pass && !sig1Pass) {
        this.logger.info(
          `TableSASAuthenticator:validate() Validate signature based account key1 and key2 failed.`,
          context.contextID
        );
        return false;
      }
    } else {
      if (!sig1Pass) {
        return false;
      }
    }

    // When signature validation passes, we enforce table service SAS validation
    // Any validation errors will stop this request immediately

    // TODO: Validate permissions from ACL identifier by extract permissions, start time and expiry time from ACL
    if (values.identifier !== undefined) {
      const accessPolicy:
        | AccessPolicy
        | undefined = await this.getTableAccessPolicyByIdentifier(
        account,
        tableName,
        values.identifier,
        context
      );
      if (accessPolicy === undefined) {
        this.logger.warn(
          `TableSASAuthenticator:validate() Cannot get access policy defined for table ${tableName} with id ${values.identifier}.`,
          context.contextID
        );
        throw StorageErrorFactory.getAuthorizationFailure(context);
      }

      values.startTime = accessPolicy.start;
      values.expiryTime = accessPolicy.expiry;
      values.permissions = accessPolicy.permission;
    }

    this.logger.info(
      `TableSASAuthenticator:validate() Validate start and expiry time.`,
      context.contextID
    );
    if (!this.validateTime(values.expiryTime, values.startTime)) {
      this.logger.info(
        `TableSASAuthenticator:validate() Validate start and expiry failed.`,
        context.contextID
      );
      throw StorageErrorFactory.getAuthorizationFailure(context);
    }

    this.logger.info(
      `TableSASAuthenticator:validate() Validate IP range.`,
      context.contextID
    );
    if (!this.validateIPRange()) {
      this.logger.info(
        `TableSASAuthenticator:validate() Validate IP range failed.`,
        context.contextID
      );
      throw StorageErrorFactory.getAuthorizationSourceIPMismatch(context);
    }

    this.logger.info(
      `TableSASAuthenticator:validate() Validate request protocol.`,
      context.contextID
    );
    if (!this.validateProtocol(values.protocol, req.getProtocol())) {
      this.logger.info(
        `TableSASAuthenticator:validate() Validate protocol failed.`,
        context.contextID
      );
      throw StorageErrorFactory.getAuthorizationProtocolMismatch(context);
    }

    const operation = context.operation;
    if (operation === undefined) {
      throw new Error(
        // tslint:disable-next-line:max-line-length
        `TableSASAuthenticator:validate() Operation shouldn't be undefined. Please make sure DispatchMiddleware is hooked before authentication related middleware.`
      );
    }

    const tableSASPermission = OPERATION_TABLE_SAS_TABLE_PERMISSIONS.get(
      operation
    );

    this.logger.debug(
      `TableSASAuthenticator:validate() Got permission requirements for operation ${
        Operation[operation]
      } - ${JSON.stringify(tableSASPermission)}`,
      context.contextID
    );
    if (tableSASPermission === undefined) {
      throw new Error(
        // tslint:disable-next-line:max-line-length
        `TableSASAuthenticator:validate() ${"OPERATION_TABLE_SAS_TABLE_PERMISSIONS"} doesn't have configuration for operation ${
          Operation[operation]
        }'s table service SAS permission.`
      );
    }

    if (!tableSASPermission.validatePermissions(values.permissions!)) {
      throw StorageErrorFactory.getAuthorizationPermissionMismatch(context);
    }

    this.logger.info(
      `TableSASAuthenticator:validate() Table service SAS validation successfully.`,
      context.contextID
    );

    // TODO: Handle enforced response headers defined in table service SAS

    return true;
  }

  private getTableSASSignatureValuesFromRequest(
    req: IRequest,
    tableName: string,
    context?: Context
  ): ITableSASSignatureValues | undefined {
    const version = this.decodeIfExist(req.getQuery("sv"));
    const protocol = this.decodeIfExist(req.getQuery("spr"));
    const startTime = this.decodeIfExist(req.getQuery("st"));
    const expiryTime = this.decodeIfExist(req.getQuery("se"));
    const permissions = this.decodeIfExist(req.getQuery("sp"));
    const ipRange = this.decodeIfExist(req.getQuery("sip"));
    const identifier = this.decodeIfExist(req.getQuery("si"));
    const startingPartitionKey = this.decodeIfExist(req.getQuery("spk"));
    const startingRowKey = this.decodeIfExist(req.getQuery("srk"));
    const endingPartitionKey = this.decodeIfExist(req.getQuery("epk"));
    const endingRowKey = this.decodeIfExist(req.getQuery("erk"));

    if (!identifier && (!permissions || !expiryTime)) {
      this.logger.warn(
        // tslint:disable-next-line:max-line-length
        `TableSASAuthenticator:generateTableSASSignature(): Must provide 'permissions' and 'expiryTime' for Table SAS generation when 'identifier' is not provided.`,
        context ? context.contextID : undefined
      );
      return undefined;
    }

    if (version === undefined) {
      this.logger.warn(
        // tslint:disable-next-line:max-line-length
        `TableSASAuthenticator:generateTableSASSignature(): Must provide 'version'.`,
        context ? context.contextID : undefined
      );
      return undefined;
    }

    const tableSASValues: ITableSASSignatureValues = {
      version,
      protocol,
      startTime,
      expiryTime,
      permissions,
      ipRange,
      tableName,
      identifier,
      startingPartitionKey,
      startingRowKey,
      endingPartitionKey,
      endingRowKey
    };

    return tableSASValues;
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

  private async getTableAccessPolicyByIdentifier(
    account: string,
    table: string,
    id: string,
    context: Context
  ): Promise<AccessPolicy | undefined> {
    try {
      const tableModel = await this.tableMetadataStore.getTable(account, table, context);

      if (tableModel === undefined) {
        return undefined;
      }

      if (tableModel.tableAcl === undefined) {
        return undefined;
      }

      for (const acl of tableModel.tableAcl) {
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
