import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

class EntityIfMatch {
  public validate(request, entity) {
    if (request.httpProps[N.IF_MATCH] === undefined) {
      throw new AzuriteError(ErrorCodes.MissingRequiredHeader);
    }
    if (request.httpProps[N.IF_MATCH] === "*") {
      return;
    }
    if (request.httpProps[N.IF_MATCH] !== entity._.etag) {
      throw new AzuriteError(ErrorCodes.UpdateConditionNotSatisfied);
    }
  }
}

export default new EntityIfMatch();
