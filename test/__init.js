const Azurite = require('./../lib/Azurite');

const azurite = new Azurite();

before(() => {
    const location = process.env.AZURITE_LOCATION;
    return azurite.init({ l: location, silent: 'true' });
});

after(() => {
    return azurite.close();
});