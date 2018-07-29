

const crypto = require("crypto");

exports.computeEtag = (templateString) => {
    return crypto
        .createHash("sha1")
        .update(templateString, "utf8")
        .digest("base64")
        .replace(/=+$/, "");
}