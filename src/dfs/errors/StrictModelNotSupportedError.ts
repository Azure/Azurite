import Context from "../../blob/generated/Context";
import DataLakeError from "./DataLakeError";

export default class StrictModelNotSupportedError extends DataLakeError {
  public constructor(feature: string, context: Context) {
    super(
      500,
      "FeatureNotSupported",
      `${feature} header or parameter is not supported in Azurite strict mode. Switch to loose model by Azurite command line parameter "--loose" or Visual Studio Code configuration "Loose". Please vote your wanted features to https://github.com/azure/azurite/issues`,
      "FeatureNotSupported",
      `${feature} header or parameter is not supported in Azurite strict mode. Switch to loose model by Azurite command line parameter "--loose" or Visual Studio Code configuration "Loose". Please vote your wanted features to https://github.com/azure/azurite/issues`,
      context
    );
  }
}
