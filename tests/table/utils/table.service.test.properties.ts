import { TableServiceProperties } from "@azure/data-tables/dist/commonjs/generated/models";

export function getServicePropertiesForTest() : TableServiceProperties  {
    return {
          cors: [
            {
              allowedOrigins: [
                "http://www.contoso.com",
                "http://www.fabrikam.com"
              ].join(','),
              allowedMethods: [
                "GET",
                "HEAD",
                "POST",
                "OPTIONS",
                "MERGE",
                "PUT"
              ].join(','),
              maxAgeInSeconds: 100,
              exposedHeaders: [
                "x-ms-meta-*"
              ].join(','),
              allowedHeaders: [
                "x-ms-meta-abc",
                "x-ms-meta-data*",
                "x-ms-meta-target*"
              ].join(',')
            },
            {
              allowedOrigins: "*",
              allowedMethods:  "GET",
              maxAgeInSeconds: 2,
              exposedHeaders: "*",
              allowedHeaders: "*"
            },
            {
              allowedOrigins: [
                "http://www.abc23.com",
                "https://www.fabrikam.com/*"
              ].join(','),
              allowedMethods: [
                "GET",
                "PUT"
              ].join(','),
              maxAgeInSeconds: 2000,
              exposedHeaders: [
                "x-ms-meta-abc",
                "x-ms-meta-data*",
                "x-ms-meta-target*"
              ].join(','),
              allowedHeaders:  "x-ms-meta-12345675754564*"
            }
          ]
    }
  }
