var rcedit = require('rcedit');
var pjson = require('../package.json');



rcedit(".\\azurite.exe", {"version-string" : {"CompanyName": "Microsoft", 
                                               "ProductName": "Azurite", 
                                               "FileDescription": "A lightweight server clone of Azure Storage that simulates most of the commands supported by it with minimal dependencies", 
                                               "ProductVersion": pjson.version,
                                               "OriginalFilename": "node.exe",
                                               "InternalName": "node",
                                               "LegalCopyright": "MIT license."},"file-version": pjson.version});