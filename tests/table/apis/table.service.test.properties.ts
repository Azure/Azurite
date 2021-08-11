import * as Azure from "azure-storage";

export
  function getServicePropertiesForTest() : Azure.common.models.ServicePropertiesResult.ServiceProperties{
    return {
        Cors: {
          CorsRule: [
            {
              AllowedOrigins: [
                "http://www.contoso.com",
                "http://www.fabrikam.com"
              ],
              AllowedMethods: [
                "GET",
                "HEAD",
                "POST",
                "OPTIONS",
                "MERGE",
                "PUT"
              ],
              MaxAgeInSeconds: 100,
              ExposedHeaders: [
                "x-ms-meta-*"
              ],
              AllowedHeaders: [
                "x-ms-meta-abc",
                "x-ms-meta-data*",
                "x-ms-meta-target*"
              ]
            },
            {
              AllowedOrigins: [
                "*"
              ],
              AllowedMethods: [
                "GET"
              ],
              MaxAgeInSeconds: 2,
              ExposedHeaders: [
                "*"
              ],
              AllowedHeaders: [
                "*"
              ]
            },
            {
              AllowedOrigins: [
                "http://www.abc23.com",
                "https://www.fabrikam.com/*"
              ],
              AllowedMethods: [
                "GET",
                "PUT"
              ],
              MaxAgeInSeconds: 2000,
              ExposedHeaders: [
                "x-ms-meta-abc",
                "x-ms-meta-data*",
                "x-ms-meta-target*"
              ],
              AllowedHeaders: [
                "x-ms-meta-12345675754564*"
              ]
            }
          ]
        }
    }
  }
