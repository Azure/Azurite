export function getServicePropertiesForTest() {
  return {
    cors: [
      {
        allowedOrigins: "http://www.contoso.com,http://www.fabrikam.com",
        allowedMethods: "GET,HEAD,POST,OPTIONS,MERGE,PUT",
        maxAgeInSeconds: 100,
        exposedHeaders: "x-ms-meta-*",
        allowedHeaders: "x-ms-meta-abc,x-ms-meta-data*,x-ms-meta-target*"
      },
      {
        allowedOrigins: "*",
        allowedMethods: "GET",
        maxAgeInSeconds: 2,
        exposedHeaders: "*",
        allowedHeaders: "*"
      },
      {
        allowedOrigins: "http://www.abc23.com,https://www.fabrikam.com/*",
        allowedMethods: "GET,PUT",
        maxAgeInSeconds: 2000,
        exposedHeaders: "x-ms-meta-abc,x-ms-meta-data*,x-ms-meta-target*",
        allowedHeaders: "x-ms-meta-12345675754564*"
      }
    ]
  };
}
