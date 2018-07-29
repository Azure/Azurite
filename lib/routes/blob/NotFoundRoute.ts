"use strict";

/*
 * This route checks whether the call did match any command or path that Azurite supports.
 * In case it does not, Azurite returns a 501 Not Implemented error. Since we cannot distinguish between an unsupported HTTP method
 * on an existing resource and a supported method on a non-existing resource at this point in time we return 501. The latter case will be
 * handled accordingly later in the validation middleware.
 */
export default app => {
    app.route("*").all((req, res, next) => {
        if (req.azuriteRequest) {
            next();
        } else {
            res.status(501);
            res.send(
                `Path or Http-Method does not match any emulated command.\n` + 
                `Possible causes include\n` + 
                `  - missing account name path parameter\n` +
                `  - Unsupported Http-Method on resource\n` + 
                `  - Unsupported / Not implemented "comp" query parameter on resource`);
        }
    });
};