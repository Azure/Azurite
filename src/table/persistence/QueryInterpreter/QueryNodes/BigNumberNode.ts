import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";
import ValueNode from "./ValueNode";

/**
 * Represents a constant value which is stored in its underlying JavaScript representation.
 * 
 * This is used to hold boolean, number, and string values that are provided in the query.
 * For example, the query `PartitionKey eq 'foo'` would contain a `ConstantNode` with the value `foo`.
 */
export default class BigNumberNode extends ValueNode {
  get name(): string {
    return "BigNumber";
  }

  compare(context: IQueryContext, other: IQueryNode): number {
    const thisValue = this.evaluate(context) as string;
    const otherValue = other.evaluate(context) as string;

    if (thisValue === undefined || otherValue === undefined || otherValue === null) {
      return NaN;
    }

    if (thisValue.startsWith("-")) {
      // Compare two negative number
      if (otherValue.startsWith("-")) {
        return -(this.comparePositiveNumber(thisValue.substring(1), otherValue.substring(1)));
      }
      else {
        // Could be two 0s formated with -000 and 000
        if (this.trimZeros(thisValue.substring(1)).length === 0
          && this.trimZeros(otherValue).length === 0) {
          return 0;
        }
        else {
          return -1;
        }
      }
    }
    else {
      // Could be two 0s formated with -000 and 000
      if (otherValue.startsWith("-")) {
        if (this.trimZeros(thisValue.substring(1)).length === 0
          && this.trimZeros(otherValue).length === 0) {
          return 0;
        }
        else {
          return 1;
        }
      }
      else {
        return this.comparePositiveNumber(thisValue, otherValue);
      }
    }
  }

  comparePositiveNumber(thisValue: string, otherValue: string): number {
    const thisNumberValue = this.trimZeros(thisValue);
    const otherNumberValue = this.trimZeros(otherValue);

    if (thisNumberValue.length < otherNumberValue.length) {
      return -1
    }
    else if (thisNumberValue.length > otherNumberValue.length) {
      return 1;
    }

    let index = 0;
    while (index < thisNumberValue.length) {
      if (thisNumberValue[index] < otherNumberValue[index]) {
        return -1;
      }
      else if (thisNumberValue[index] > otherNumberValue[index]) {
        return 1;
      }
      ++index
    }

    return 0;
  }

  trimZeros(numberString: string): string {
    let index = 0;
    while (index < numberString.length) {
      if (numberString[index] === '0') {
        ++index;
      }
      else {
        break;
      }
    }

    return numberString.substring(index);
  }
}