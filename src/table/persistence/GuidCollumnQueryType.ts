import { ICollumnQueryType } from "./ICollumnQueryType";

// ToDo: Move conversion of type representation into the collumn
// query type class
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
