/**
 * @author kecso / https://github.com/kecso
 */

var execute = require('./execute'),
    fs = require('fs');

execute(null, JSON.parse(fs.readFileSync('./tests/profiling.tc.json', 'utf8')))
    .then(function (/*raw*/) {
        process.exit(0);
    })
    .catch(function (err) {
        console.log('failed:', err);
        process.exit(1);
    });