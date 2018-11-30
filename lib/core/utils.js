/** @format */

"use strict";

exports.computeEtag = (templateString) => {
  return `W/"datetime'${encodeURI(templateString)}'"`;
};
