import * as  BbPromise from "bluebird";
import AzuriteError from "../../core/AzuriteError";
import StorageManager from "../../core/blob/StorageManager";
import { Operations } from "../../core/Constants";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

// Performs CORS rule-validation iff CORS is enabled and request header "origin" is set.
export default (req, res, next) => {
  BbPromise.try(() => {
    const request = req.azuriteRequest;
    StorageManager.getBlobServiceProperties(request).then(response => {
      if (
        response.payload.StorageServiceProperties &&
        request.httpProps[N.ORIGIN]
      ) {
        const allowedMethods =
          req.azuriteOperation === Operations.Account.PREFLIGHT_BLOB_REQUEST
            ? request.httpProps[N.ACCESS_CONTROL_REQUEST_METHOD].toLowerCase()
            : req.method.toLowerCase();

        const allowedHeaders =
          req.azuriteOperation === Operations.Account.PREFLIGHT_BLOB_REQUEST
            ? request.httpProps[N.ACCESS_CONTROL_REQUEST_HEADERS]
                .toLowerCase()
                .split(",")
                .reduce((acc, e) => {
                  const key = Object.keys(e)[0];
                  acc[key] = e[key];
                  return acc;
                }, {})
            : req.headers;

        let valid = false;
        for (const rule of response.payload.StorageServiceProperties.Cors
          .CorsRule) {
          valid = false;
          rule.AllowedOrigins = rule.AllowedOrigins.toLowerCase();
          rule.AllowedMethods = rule.AllowedMethods.toLowerCase();
          if (
            !rule.AllowedOrigins.includes(request.httpProps[N.ORIGIN]) &&
            !rule.AllowedOrigins.includes("*")
          ) {
            continue;
          }

          if (!rule.AllowedMethods.includes(allowedMethods)) {
            continue;
          }

          rule.AllowedHeaders.split(",").forEach(e => {
            Object.keys(allowedHeaders).forEach(requestHeader => {
              valid =
                e.charAt(e.length - 1) === "*"
                  ? requestHeader.includes(e.slice(0, -1))
                  : e === requestHeader;
            });
          });

          if (valid) {
            req.azuriteRequest.cors = {};
            req.azuriteRequest.cors.maxAgeInSeconds = rule.MaxAgeInSeconds;
            req.azuriteRequest.cors.origin = request.httpProps[N.ORIGIN];
            req.azuriteRequest.cors.exposedHeaders = rule.ExposedHeaders;
            break;
          }
        }
        if (
          !valid &&
          req.azuriteOperation === Operations.Account.PREFLIGHT_BLOB_REQUEST
        ) {
          throw new AzuriteError(ErrorCodes.CorsForbidden);
        }
      }
      next();
    });
    return;
  }).catch(e => {
    res.status(e.statusCode || 500).send(e.message);
    if (!e.statusCode) {
      throw e;
    }
  });
};
