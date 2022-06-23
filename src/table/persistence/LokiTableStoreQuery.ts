import StorageErrorFactory from "../errors/StorageErrorFactory";
import { Entity, Table } from "./ITableMetadataStore";
import ITableStoreQuery from "./ITableStoreQuery";
import Context from "../generated/Context";
import * as Models from "../generated/artifacts/models";
import { ICollumnQueryType } from "./ICollumnQueryType";
import { GuidCollumnQueryType } from "./GuidCollumnQueryType";
import { BinaryBinaryCollumnQueryType } from "./BinaryBinaryCollumnQueryType";
import { OtherCollumnQueryType } from "./OtherCollumnQueryType";
import { XBinaryCollumnQueryType } from "./XBinaryCollumQueryType";

// used by the query filter checking logic
type TokenTuple = [string, TokenType];
enum TokenType {
  Unknown,
  Identifier,
  Comparisson,
  LogicalOp,
  Value,
  Parens
}

// Handles Query Logic For LokiJs Table Implementation
export default class LokiTableStoreQuery implements ITableStoreQuery {
  /**
   * Will throw an exception on invalid query syntax
   *
   * @param queryOptions
   * @param context
   * @returns
   */
  public generateQueryForPersistenceLayer(
    queryOptions: Models.QueryOptions,
    context: Context
  ) {
    let queryWhere;
    try {
      queryWhere = this.generateQueryEntityWhereFunction(queryOptions.filter);
    } catch (e) {
      throw StorageErrorFactory.getQueryConditionInvalid(context);
    }
    return queryWhere;
  }

  /**
   * @param query Query Tables $query string.
   */
  public generateQueryTableWhereFunction(
    query: string | undefined
  ): (entity: Table) => boolean {
    if (query === undefined) {
      return () => true;
    }

    const transformedQuery = LokiTableStoreQuery.transformTableQuery(query);

    return new Function("item", transformedQuery) as any;
  }

  /**
   * Azurite V2 query tables implementation.
   */
  public static transformTableQuery(query: string): string {
    const systemProperties: Map<string, string> = new Map<string, string>([
      ["name", "table"]
    ]);
    const allowCustomProperties = false;

    return LokiTableStoreQuery.transformQuery(
      query,
      systemProperties,
      allowCustomProperties
    );
  }

  /**
   * @param query Query Enties $query string.
   */
  private generateQueryEntityWhereFunction(
    query: string | undefined
  ): (entity: Entity) => boolean {
    if (query === undefined) {
      return () => true;
    }

    const transformedQuery = LokiTableStoreQuery.transformEntityQuery(query);

    return new Function("item", transformedQuery) as any;
  }

  public static transformEntityQuery(query: string): string {
    const systemProperties: Map<string, string> = new Map<string, string>([
      ["PartitionKey", "PartitionKey"],
      ["RowKey", "RowKey"]
    ]);
    const allowCustomProperties = true;

    return LokiTableStoreQuery.transformQuery(
      query,
      systemProperties,
      allowCustomProperties
    );
  }

  private static transformQuery(
    query: string,
    systemProperties: Map<string, string>,
    allowCustomProperties: boolean
  ): string {
    // If a token is neither a number, nor a boolean, nor a string enclosed with quotation marks it is an operand.
    // Operands are attributes of the object used within the where clause of LokiJS, thus we need to prepend each
    // attribute with an object identifier 'item.attribs'.
    let transformedQuery = "return ( ";
    let isOp = false;
    let previousIsOp = false;
    const tokens = LokiTableStoreQuery.tokenizeQuery(query);

    const tokenTuples: TokenTuple[] = [];
    for (const token of tokens) {
      tokenTuples.push([token, TokenType.Unknown]);
    }
    let counter = -1;
    for (const token of tokenTuples) {
      counter++;
      if (token[0] === "") {
        continue;
      }
      if (token[0].match(/\b\d+/)) {
        token[1] = TokenType.Value;
      }
      previousIsOp = isOp;
      isOp = ["===", ">", ">=", "<", "<=", "!=="].includes(token[0]);
      if (isOp) {
        token[1] = TokenType.LogicalOp;
      }
      if ([")", "("].includes(token[0])) {
        token[1] = TokenType.Parens;
      }
      if (["&&", "||"].includes(token[0])) {
        token[1] = TokenType.Comparisson;
      }
      if (["`", "'", '"'].includes(token[0].charAt(0))) {
        token[1] = TokenType.Value;
      }
      if (
        !token[0].match(/\b\d+/) &&
        token[0] !== "true" &&
        token[0] !== "false" &&
        !token[0].includes("`") &&
        ![
          "===",
          ">",
          ">=",
          "<",
          "<=",
          "!==",
          "&&",
          "||",
          "!",
          "(",
          ")"
        ].includes(token[0])
      ) {
        if (systemProperties.has(token[0])) {
          transformedQuery += `item.${systemProperties.get(token[0])} `;
          token[1] = TokenType.Identifier;
        } else if (allowCustomProperties) {
          // Datetime compare
          if (
            counter + 2 <= tokens.length - 1 &&
            tokens[counter + 2].startsWith("datetime")
          ) {
            transformedQuery += `new Date(item.properties.${token[0]}).getTime() `;
            token[1] = TokenType.Identifier;
          } else {
            transformedQuery += `item.properties.${token[0]} `;
            token[1] = TokenType.Identifier;
          }
        } else {
          throw Error(
            "Custom properties are not supported on this query type."
          );
        }
      } else {
        // Remove "L" from long int
        // 2039283L ==> 2039283
        const matchLongInt = token[0].match(/\b[0-9]*L\b/g);
        if (
          previousIsOp &&
          matchLongInt !== null &&
          matchLongInt.length === 1
        ) {
          const newtoken = token[0].slice(0, token[0].length - 1);
          // however, as long int is stored as string, we need to add inverted commas
          token[0] = "'" + newtoken + "'";
          token[1] = TokenType.Value;
        } else if (previousIsOp && token[0].startsWith("datetime")) {
          token[0] = token[0].replace(/\bdatetime\b/g, "");
          token[0] = `new Date(${token[0]}).getTime()`;
          token[1] = TokenType.Value;
        } else if (
          previousIsOp &&
          (token[0].startsWith("X") || token[0].startsWith("binary"))
        ) {
          throw Error("Binary filter is not supported yet.");
        }

        transformedQuery += `${token[0]} `;
      }
    }
    transformedQuery += ")";

    // we need to validate that the filter has some valide predicate logic
    // simply we check if we have sequence identifier > op > value through the tokens
    LokiTableStoreQuery.validatePredicateSequence(tokenTuples);

    return transformedQuery;
  }

  /**
   * Checks that a filter expression conforms to a minimum predicate
   * style logic.
   * It is easier to follow the predicate test logic like this than to
   * manage a state machine during the creation of the query function.
   * Should we continue to have to support more complex query validation
   * we shall implement a query validation state machine.
   *
   * @param {string[]} tokens
   */
  private static validatePredicateSequence(tokens: TokenTuple[]) {
    if (tokens.length < 3) {
      throw Error("Invalid filter string detected!");
    }
    let foundPredicate: boolean = false;
    let state: TokenType = TokenType.Unknown;
    let lastState: TokenType = tokens[0][1];
    // base case for duplicated token types
    for (let i = 1; i < tokens.length; i++) {
      state = tokens[i][1];
      if (state === TokenType.LogicalOp) {
        foundPredicate = true;
      }
      if (
        state !== TokenType.Unknown &&
        state !== TokenType.Parens &&
        state === lastState
      ) {
        throw Error("Invalid filter string detected!");
      }
      if (lastState === TokenType.Comparisson && state === TokenType.Value) {
        throw Error("Invalid token after comparisson operator");
      }
      if (
        lastState === TokenType.Value &&
        state !== TokenType.Unknown &&
        state !== TokenType.Parens &&
        state !== TokenType.Comparisson
      ) {
        throw Error("Invalid token after value");
      }
      lastState = state;
    }
    if (foundPredicate === false) {
      throw Error("No predicate clause found");
    }
  }

  /**
   * Converts a token from query request to a type used in persistence
   * layer query function.
   *
   * @private
   * @static
   * @param {string} token
   * @return {*}  {string}
   * @memberof LokiTableMetadataStore
   */
  private static convertToken(token: string): string {
    switch (token) {
      case "TableName":
        return "name";
      case "eq":
        return "===";
      case "gt":
        return ">";
      case "ge":
        return ">=";
      case "lt":
        return "<";
      case "le":
        return "<=";
      case "ne":
        return "!==";
      case "and":
        return "&&";
      case "or":
        return "||";
      case "not":
        return "!";
      default:
        return token;
    }
  }

  /**
   * Extracts and formats tokens for query function
   *
   * @private
   * @static
   * @param {string} token
   * @param {string} query
   * @param {number} tokenStart
   * @param {number} stringPos
   * @return {*}
   * @memberof LokiTableMetadataStore
   */
  private static extractAndFormatToken(
    token: string,
    query: string,
    tokenStart: number,
    stringPos: number
  ) {
    token = query.substring(tokenStart, stringPos).replace(/''/g, "'");

    // EDWINTODO: FIX THIS!
    // Extract the leading type prefix, if any.
    const stringStart = token.indexOf("'");
    const typePrefix = token.substring(0, stringStart);
    const backtickString = "`" + token.substring(typePrefix.length + 1) + "`";

    token = LokiTableStoreQuery.convertTypeRepresentation(
      LokiTableStoreQuery.getCollumnType(typePrefix),
      token,
      backtickString
    );
    return token;
  }

  private static getCollumnType(typePrefix: string): ICollumnQueryType {
    if (typePrefix === "guid") {
      return new GuidCollumnQueryType();
    }
    if (typePrefix === "X") {
      return new XBinaryCollumnQueryType();
    }
    if (typePrefix === "binary") {
      return new BinaryBinaryCollumnQueryType();
    }
    return new OtherCollumnQueryType();
  }

  /**
   * This converts types with base64 representations in the persistence
   * layer to the correct format.
   * i.e. We do this as searching for a Guid Type as a string type should not
   * return a matching Guid.
   *
   * @private
   * @static
   * @param {string} typePrefix
   * @param {string} token
   * @param {string} backtickString
   * @return {*}
   * @memberof LokiTableMetadataStore
   */
  private static convertTypeRepresentation(
    type: ICollumnQueryType,
    token: string,
    backtickString: string
  ) {
    if (type.isGuid()) {
      const conversionBuffer = Buffer.from(
        token.substring(type.getPrefix().length + 1)
      );
      token = "`" + conversionBuffer.toString("base64") + "`";
    } else if (type.isBinary()) {
      const conversionBuffer = Buffer.from(
        token.substring(type.getPrefix().length + 1),
        "hex"
      );
      return "`" + conversionBuffer.toString("base64") + "`";
    } else {
      token = type.getPrefix() + backtickString;
    }

    return token;
  }

  private static addTokenIfValid(token: string, tokens: string[]) {
    if (token) {
      tokens.push(token);
    }
  }

  /**
   * Breaks a query into tokens which we use to build the query
   * to the persistence layer.
   *
   * @private
   * @static
   * @param {string} originalQuery
   * @return {*}  {string[]}
   * @memberof LokiTableMetadataStore
   */
  private static tokenizeQuery(originalQuery: string): string[] {
    const query = originalQuery.replace(/`/g, "\\`");

    let tokenStart = 0;
    const tokens: string[] = [];
    let inString = false;
    let i: number;

    for (i = 0; i < query.length; i++) {
      if (inString) {
        // Look for a double quote, inside of a string.
        if (i < query.length - 1 && query[i] === "'" && query[i + 1] === "'") {
          i++;
          continue;
        } else if (query[i] === "'") {
          // prettier-ignore
          [i, tokenStart] = this.appendToken(i, tokenStart, inString, query, tokens);
          inString = false;
        }
      } else if (query[i] === "(" || query[i] === ")") {
        if (
          (i !== 0 &&
            (query[i - 1].match(/\S/) !== null ||
              (i >= 5 && query.slice(i - 5, i) === " true") ||
              (i >= 6 && query.slice(i - 6, i) === " false"))) ||
          query.substring(tokenStart, i).match(/\b[0-9]+L\b/g) != null
        ) {
          // this is needed if query does not contain whitespace between number token / boolean and paren
          // prettier-ignore
          [i, tokenStart] = this.appendToken(i, tokenStart, inString, query, tokens);
        }
        i--;
        // prettier-ignore
        [i, tokenStart] = this.appendToken(i, tokenStart, inString, query, tokens);
        i++;
        tokens.push(query[i]);
        tokenStart++;
      } else if (/\s/.test(query[i])) {
        // prettier-ignore
        [i, tokenStart] = this.appendToken(i, tokenStart, inString, query, tokens);
      } else if (query[i] === "'") {
        inString = true;
      }
    }
    // prettier-ignore
    [i, tokenStart] = this.appendToken(i, tokenStart, inString, query, tokens);

    return tokens;
  }

  private static appendToken(
    stringPos: number,
    tokenStart: number,
    inString: boolean,
    query: string,
    tokens: string[]
  ) {
    if (stringPos - tokenStart > 0) {
      let token: string = "";
      if (inString) {
        // Extract the token and unescape quotes
        token = LokiTableStoreQuery.extractAndFormatToken(
          token,
          query,
          tokenStart,
          stringPos
        );
      } else {
        token = LokiTableStoreQuery.convertToken(
          query.substring(tokenStart, stringPos)
        );
      }

      LokiTableStoreQuery.addTokenIfValid(token, tokens);
    }
    tokenStart = stringPos + 1;
    return [stringPos, tokenStart];
  }
}
