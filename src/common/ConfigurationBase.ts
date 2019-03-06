export default abstract class ConfigurationBase {
  public constructor(
    public readonly host: string,
    public readonly port: number
  ) {}
}
