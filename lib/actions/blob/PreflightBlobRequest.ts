import storageManager from "./../../core/blob/StorageManager";
  AzuriteResponse = from "./../../model/blob/AzuriteResponse"),
  import N from "./../../core/HttpHeaderNames";

class PreflightBlobRequest {
  

  public process(req, res) {
    const response = new AzuriteResponse(); // Add Access-Control-Expose-Headers
    response.addHttpProperty(
      N.ACCESS_CONTROL_ALLOW_ORIGIN,
      req.httpProps[N.ORIGIN]
    ); // Refactor into response
    response.addHttpProperty(
      N.ACCESS_CONTROL_ALLOW_METHODS,
      req.httpProps[N.ACCESS_CONTROL_REQUEST_METHOD]
    );
    response.addHttpProperty(
      N.ACCESS_CONTROL_ALLOW_HEADERS,
      req.httpProps[N.ACCESS_CONTROL_REQUEST_HEADERS]
    );
    response.addHttpProperty(
      N.ACCESS_CONTROL_MAX_AGE,
      req.cors.maxAgeInSeconds
    );
    response.addHttpProperty(N.ACCESS_CONTROL_ALLOW_CREDENTIALS, true); // Refactor into response
    res.set(response.httpProps);
    res.status(200).send();
  }
}

export default new PreflightBlobRequest();
