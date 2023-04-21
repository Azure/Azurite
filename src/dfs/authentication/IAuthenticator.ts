import IRequest from "../../blob/generated/IRequest";
import Context from "../../blob/generated/Context";

export default interface IAuthenticator {
  validate(req: IRequest, content: Context): Promise<boolean | undefined>;
}
