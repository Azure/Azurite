import { ICollumnQueryType } from "./ICollumnQueryType";

export class GuidCollumnQueryType implements ICollumnQueryType {
  isGuid(): boolean {
    return true;
  }
  isBinary(): boolean {
    return false;
  }
  isOther(): boolean {
    return false;
  }
  getPrefix(): string {
    return "guid";
  }
}
