import { VALID_DATALAKE_AUDIENCES } from "../utils/constants";
import IAuthenticator from "./IAuthenticator";
import BlobBlobTokenAuthenticator from "../../blob/authentication/BlobTokenAuthenticator";

export default class BlobTokenAuthenticator extends BlobBlobTokenAuthenticator implements IAuthenticator {
  
  protected override getValidAudiences(): RegExp[] {
    return VALID_DATALAKE_AUDIENCES;
  }}
