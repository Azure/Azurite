import Context from "../generated/Context";
import IRequest from "../generated/IRequest";

export default interface IAuthenticator {
  validate(req: IRequest, content: Context): Promise<boolean | undefined>;
}
