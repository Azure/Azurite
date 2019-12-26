import StorageError from "./StorageError";

export default class StrictModelNotSupportedError extends StorageError {
  public constructor(feature: string, requestID: string = "") {
    super(
      500,
      "FeatureNotSupported",
      `${feature} header or parameter is not supported in Azurite strict mode. Switch to loose model by Azurite command line parameter "--loose" or Visual Studio Code configuration "Loose". Please vote your wanted features to https://github.com/azure/azurite/issues`,
      requestID
    );
  }
}
