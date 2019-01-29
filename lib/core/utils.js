/** @format */

"use strict";

exports.computeEtag = (templateString) => {
  return `W/\"datetime'${encodeURIComponent(templateString)}'\"`;
};
