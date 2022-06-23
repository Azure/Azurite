export interface ICollumnQueryType {
  isGuid(): boolean;
  isBinary(): boolean;
  isOther(): boolean;
  getPrefix(): string;
}
