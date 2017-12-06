/**
 * @author kecso / https://github.com/kecso
 */
/*jshint node: true*/
/**
 * @author lattmann / https://github.com/lattmann
 * @author pmeijer / https://github.com/pmeijer
 */

var config = require('webgme-engine/config/config.default');

config.bin.log.transports = [{
    transportType: 'Console',
    //patterns: ['gme:server:*', '-gme:server:worker*'], // ['gme:server:worker:*'], ['gme:server:*', '-gme:server:worker*']
    options: {
        level: 'info',
        colorize: true,
        timestamp: true,
        prettyPrint: true,
        handleExceptions: true, // ignored by default when you create the logger, see the logger.create function
        depth: 2
    }
}];

module.exports = config;
