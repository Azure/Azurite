export enum ContainerSASPermission {
  Read = "r",
  Add = "a",
  Create = "c",
  Write = "w",
  Delete = "d",
  List = "l",
  Filter = "f",
  Any = "AnyPermission" // This is only for blob batch operation.
}
