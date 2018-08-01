'use strict';

import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';

const allowedMethods = ['delete', 'get', 'head', 'merge', 'post', 'options', 'put'];

class ServiceProperties {
    constructor() {
    }

    validate({ request = undefined }) {
        const serviceProps = request.payload.StorageServiceProperties;

        //////////////////////////
        // Validating CORS Rules
        const rules = serviceProps.Cors ? serviceProps.Cors.CorsRule : [];

        // A minimum of five rules can be stored
        if (rules.length > 5) {
            throw new AError(ErrorCodes.InvalidXmlRequest);
        }

        for (const rule of rules) {
            // These elements are required
            if (!(rule.AllowedMethods && rule.AllowedHeaders && rule.ExposedHeaders)) {
                throw new AError(ErrorCodes.InvalidXmlRequest);
            }
            // Allowed Methods
            rule.AllowedMethods.split(',')
                .map((e) => {
                    return e.toLowerCase().replace(' ', '');
                })
                .forEach((e) => {
                    if (!allowedMethods.includes(e)) {
                        throw new AError(ErrorCodes.InvalidXmlRequest);
                    }
                });

            // Allowed Headers
            let numHeader = 0,
                numPrefixHeader = 0;
            rule.AllowedHeaders.split(',')
                .forEach((e) => {
                    (e.includes(`\*`)) ? ++numPrefixHeader : ++numHeader;
                    if (numPrefixHeader > 2 || numHeader > 64) {
                        throw new AError(ErrorCodes.InvalidXmlRequest);
                    }
                    if (e.length > 256) {
                        throw new AError(ErrorCodes.InvalidXmlRequest);
                    }
                });

            // Exposed Headers
            numHeader = 0;
            numPrefixHeader = 0;
            rule.ExposedHeaders.split(',')
                .forEach((e) => {
                    (e.includes(`\*`)) ? ++numPrefixHeader : ++numHeader;
                    if (numPrefixHeader > 2 || numHeader > 64) {
                        throw new AError(ErrorCodes.InvalidXmlRequest);
                    }
                    if (e.length > 256) {
                        throw new AError(ErrorCodes.InvalidXmlRequest);
                    }
                });
        }
    }
}

export default new ServiceProperties();