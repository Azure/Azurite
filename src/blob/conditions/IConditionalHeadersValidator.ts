import Context from "../generated/Context";
import { IConditionalHeaders } from "./IConditionalHeaders";
import IConditionResource from "./IConditionResource";

export interface IConditionalHeadersValidator {
  validate(
    context: Context,
    conditionalHeaders: IConditionalHeaders,
    resource: IConditionResource,
    isSourceBlob?: boolean
  ): void;
}
