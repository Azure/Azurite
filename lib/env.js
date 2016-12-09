'use strict';

exports.emulatedStorageAccountName = 'devstoreaccount1';

exports.localStoragePath = './';

exports.port = 10000;

exports.storageUrl = (port, container, blob) => {
    return `http://localhost:${port}/${container}/${blob}`;
}