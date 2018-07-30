import * as crypto from "crypto";

const computeEtag = templateString => {
  return crypto
    .createHash("sha1")
    .update(templateString, "utf8")
    .digest("base64")
    .replace(/=+$/, "");
};

export default computeEtag;
