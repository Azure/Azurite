import ServerBase from "./ServerBase";

export default interface IServerFactory {
  createServer(): Promise<ServerBase>;
}
