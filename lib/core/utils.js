/** @format */

"use strict";

exports.computeEtag = (templateString) => {
  return `W/\"datetime'${encodeURIComponent(templateString)}'\"`;
};

exports.releaseResourcesOnSIGINT = function () {
  if (typeof this.close !== 'function') {
    return;
  }

  // Support for PM2 Graceful Shutdown on Windows and Linux/OSX
  // See http://pm2.keymetrics.io/docs/usage/signals-clean-restart/
  // shutting down gracefully and closing connections on windows uses on exit or SIGINT in Windows 10 
  if (process.platform === 'win32') {
      process.on('exit', () => {
            this.close();
      } );      
  }
  else {
      process.on('SIGINT', () => {
          this.close();
      });
  }
};