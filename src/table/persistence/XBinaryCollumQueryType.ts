import { ICollumnQueryType } from "./ICollumnQueryType";

export class XBinaryCollumnQueryType implements ICollumnQueryType {
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
    return "X";
  }
}
