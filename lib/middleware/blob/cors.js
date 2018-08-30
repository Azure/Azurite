/** @format */

"use strict";

const BbPromise = require("bluebird"),
  AError = require("./../../core/AzuriteError"),
  ErrorCodes = require("./../../core/ErrorCodes"),
  N = require("./../../core/HttpHeaderNames"),
  Operations = require("./../../core/Constants").Operations,
  sm = require("./../../core/blob/StorageManager");

// Returns the dict of allowed headers for a given request
function getAllowedHeaders(req) {
  const request = req.azuriteRequest;
  if (req.azuriteOperation === Operations.Account.PREFLIGHT_BLOB_REQUEST) {
    if (request.httpProps[N.ACCESS_CONTROL_REQUEST_HEADERS] === undefined) {
      return {};
    } else {
      return request.httpProps[N.ACCESS_CONTROL_REQUEST_HEADERS]
        .toLowerCase()
        .split(",")
        .reduce((acc, e) => {
          const key = Object.keys(e)[0];
          acc[key] = e[key];
          return acc;
        }, {});
    }
  } else {
    return req.headers;
  }
}

// Performs CORS rule-validation iff CORS is enabled and request header 'origin' is set.
module.exports = (req, res, next) => {
  BbPromise.try(() => {
    const request = req.azuriteRequest;
    sm.getBlobServiceProperties(request).then((response) => {
      if (
        response.payload.StorageServiceProperties &&
        request.httpProps[N.ORIGIN]
      ) {
        const allowedMethods =
          req.azuriteOperation === Operations.Account.PREFLIGHT_BLOB_REQUEST
            ? request.httpProps[N.ACCESS_CONTROL_REQUEST_METHOD].toLowerCase()
            : req.method.toLowerCase();

        const allowedHeaders = getAllowedHeaders(req);

        let valid = null;
        for (const rule of response.payload.StorageServiceProperties.Cors
          .CorsRule) {
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

          // Start at true to handle the case where allowedHeaders is an empty list
          valid = true;
          rule.AllowedHeaders.split(",").forEach((e) => {
            Object.keys(allowedHeaders).forEach((requestHeader) => {
              if (e.charAt(e.length - 1) === "*") {
                valid = requestHeader.includes(e.slice(0, -1));
              } else {
                valid = e === requestHeader;
              }
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
          throw new AError(ErrorCodes.CorsForbidden);
        }
      }
      next();
    });
    return;
  }).catch((e) => {
    res.status(e.statusCode || 500).send(e.message);
    if (!e.statusCode) throw e;
  });
};
