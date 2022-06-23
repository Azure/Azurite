import { ICollumnQueryType } from "./ICollumnQueryType";

export class BinaryBinaryCollumnQueryType implements ICollumnQueryType {
  isGuid(): boolean {
    return false;
  }
  isBinary(): boolean {
    return true;
  }
  isOther(): boolean {
    return false;
  }
  getPrefix(): string {
    // could be "X" or "binary", both should use hex encoding
    // based on current service behavior
    return "binary";
  }
}
