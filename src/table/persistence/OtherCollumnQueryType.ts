import { ICollumnQueryType } from "./ICollumnQueryType";

export class OtherCollumnQueryType implements ICollumnQueryType {
  isGuid(): boolean {
    return false;
  }
  isBinary(): boolean {
    return false;
  }
  isOther(): boolean {
    return true;
  }
  getPrefix(): string {
    return "";
  }
}
