import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";
import ValueNode from "./ValueNode";

/**
 * Represents a constant value of type `datetime` which is stored in its underlying JavaScript representation.
 * 
 * This is used to hold datetime values that are provided in the query (using the `datetime'...'` syntax)
 * and is used to ensure that these values are evaluated against their normalized ISO8601 format. For example,
 * the query `PartitionKey eq datetime'2019-01-01T00:00:00.000Z'` would contain a `DateTimeNode` with the value
 * `2019-01-01T00:00:00.000Z`.
 */
export default class DateTimeNode<T> extends ValueNode {
  get name(): string {
    return "datetime";
  }

  compare(context: IQueryContext, other: IQueryNode): number {
    // NOTE(notheotherben): This approach leverages the fact that the `Date` constructor will parse ISO8601 strings
    //                 however it runs into a limitation of the accuracy of JS dates (which are limited to millisecond
    //                 resolution). As a result, we're effectively truncating the value to millisecond precision by doing
    //                 this. This is fundamentally a trade-off between enforcing valid datetime values and providing perfect
    //                 accuracy, and we've opted to enforce valid datetime values as those are more likely to cause problems
    //                 when moving to production.
    const thisValue = new Date(this.value);
    const otherValue = new Date(other.evaluate(context));

    if (isNaN(thisValue.valueOf()) || isNaN(otherValue.valueOf())) {
      return NaN;
    } else if (thisValue.valueOf() < otherValue.valueOf()) {
      return -1;
    } else if (thisValue.valueOf() > otherValue.valueOf()) {
      return 1;
    } else if (thisValue.valueOf() === otherValue.valueOf()) {
      return 0;
    } else {
      return NaN;
    }
  }
}