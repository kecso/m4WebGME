/**
 * @author kecso / https://github.com/kecso
 */
var WebGME = require('webgme-engine'),
    Q = require('q'),
    RANDOM = WebGME.requirejs('common/util/random'),
    REGEXP = WebGME.requirejs('common/regexp')
storageUtil = WebGME.requirejs('common/storage/util');

//data-wise diff and merge functions
function getDiffObjects(project, startCommitHash, endCommitHash, callback) {
    var deferred = Q.defer(),
        diffQueue = [],
        ongoingDiffs = 0,
        diff = {},
        error = null,
        timerId,
        getPathOfData = function (data, path) {
            var pathArray = path.split('/');

            pathArray.shift();
            while (pathArray.length > 0) {
                data = data[pathArray.shift()];
            }

            return data;
        },
        extendQueue = function (baseData, patchObject) {
            var i, patchOperation;
            for (i = 0; i < patchObject.patch.length; i += 1) {
                patchOperation = patchObject.patch[i];
                //console.log(patchOperation.path.substring(0, 3));
                if (patchOperation.op === 'replace' &&
                    (RANDOM.isValidRelid(patchOperation.path.substring(1)) ||
                        (patchOperation.path.substring(0, 5) === '/ovr/' &&
                            RANDOM.isValidRelid(patchOperation.path.substring(5)))) &&
                    REGEXP.DB_HASH.test(patchOperation.value)) {
                    diffQueue.push({from: getPathOfData(baseData, patchOperation.path), to: patchOperation.value});
                }
            }
        },
        loadData = function (hashPair, cb) {
            Q.all([
                Q.ninvoke(project, 'loadObject', hashPair.from),
                Q.ninvoke(project, 'loadObject', hashPair.to)
            ])
                .then(function (dataObjects) {
                    cb(null, dataObjects);
                })
                .catch(function (err) {
                    cb(err, null);
                });
        },
        dataLoaded = function (err, dataObjects) {
            error = error || err;
            if (error === null) {
                diff[dataObjects[1][storageUtil.CONSTANTS.MONGO_ID]] =
                    storageUtil.getPatchObject(dataObjects[0], dataObjects[1]);
                extendQueue(dataObjects[0], diff[dataObjects[1][storageUtil.CONSTANTS.MONGO_ID]]);
            }

            ongoingDiffs -= 1;
            if (error)
                diffQueue = [];
        };

    Q.all([
        Q.ninvoke(project, 'loadObject', startCommitHash),
        Q.ninvoke(project, 'loadObject', endCommitHash)
    ])
        .then(function (commits) {
            diffQueue = [{from: commits[0].root, to: commits[1].root}];

            timerId = setInterval(function () {
                if (diffQueue.length === 0 && ongoingDiffs === 0) {
                    clearInterval(timerId);
                    if (error) {
                        deferred.reject(error);
                    } else {
                        deferred.resolve(diff);
                    }
                } else if (diffQueue.length > 0) {
                    ongoingDiffs += 1;
                    loadData(diffQueue.shift(), dataLoaded);
                }
            }, 0);
        })
        .catch(deferred.reject);

    return deferred.promise.nodeify(callback);
}

module.exports = {
    diff: getDiffObjects
};