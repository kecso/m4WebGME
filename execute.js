/**
 * @author kecso / https://github.com/kecso
 */
var WebGME = require('webgme-engine'),
    baseConfig = require('webgme-engine/config'),
    importCli = require('webgme-engine/src/bin/import').main,
    Core = WebGME.requirejs('common/core/coreQ'),
    merger = WebGME.requirejs('common/core/users/merge'),
    storageUtil = WebGME.requirejs('common/storage/util'),
    logger = require('webgme-engine/src/server/logger').create('m4WebGME', {transports: []}),
    Q = require('q'),
    fs = require('fs');

logger.info = function () {
};

function getChangedNodesFromPersisted(persisted, printPatches) {
    var keys = Object.keys(persisted.objects),
        i,
        coreObjects = {};

    for (i = 0; i < keys.length; i += 1) {
        if (storageUtil.coreObjectHasOldAndNewData(persisted.objects[keys[i]])) {
            coreObjects[keys[i]] = storageUtil.getPatchObject(persisted.objects[keys[i]].oldData,
                persisted.objects[keys[i]].newData);
        } else {
            coreObjects[keys[i]] = persisted.objects[keys[i]].newData;
        }
    }

    if (printPatches === true) {
        logger.info(JSON.stringify(coreObjects, null, 2));
    } else if (typeof printPatches === 'string') {
        fs.appendFileSync(printPatches, JSON.stringify(coreObjects, null, 2), 'utf8');
    }

    return storageUtil.getChangedNodes(coreObjects, persisted.rootHash);
}

function importTestBaseSeed(baseSeed) {
    var deferred = Q.defer(),
        name = 'm4WebGME_test';

    if (baseSeed.indexOf('.webgmex') === -1) {
        // assume it is already a project id...
        deferred.resolve(baseSeed);
    } else {
        importCli(['node', 'import', baseSeed, '-p', name, '-w'])
            .then(function () {
                deferred.resolve('guest+' + name);
            })
            .catch(deferred.reject);
    }

    return deferred.promise;
}

function executeCommand(parameters) {
    var deferred = Q.defer(),
        core = parameters.core,
        root = parameters.root,
        variables = parameters.variables,
        newNode,
        startTime = new Date().getTime(),
        timeStamp = function () {
            if (command.measure) {
                parameters.measurements[parameters.executionIndex] += new Date().getTime() - startTime;
            }
        },
        command = parameters.commands[parameters.index];

    parameters.index += 1;

    logger.info('command: ', command.command);
    switch (command.command) {
        case 'setRegistry':
            core.setRegistry(variables[command.node], command.name, command.value);
            timeStamp();
            deferred.resolve(parameters);
            break;
        case 'setAttribute':
            core.setAttribute(variables[command.node], command.name, command.value);
            timeStamp();
            deferred.resolve(parameters);
            break;
        case 'moveNode':
            core.moveNode(variables[command.node], variables[command.parent]);
            timeStamp();
            deferred.resolve(parameters);
            break;
        case 'copyNode':
            core.copyNode(variables[command.node], variables[command.parent]);
            timeStamp();
            deferred.resolve(parameters);
            break;
        case 'createNode':
            newNode = core.createNode({
                parent: variables[command.parent],
                base: variables[command.base],
                guid: command.guid,
                relid: command.relid
            });
            if (command.store) {
                variables[command.store] = newNode;
            }
            timeStamp();
            deferred.resolve(parameters);
            break;
        case 'deleteNode':
            core.deleteNode(variables[command.node]);
            delete variables[command.node];
            timeStamp();
            deferred.resolve(parameters);
            break;
        case 'commit':
            var persisted = core.persist(root);
            if (command.print === true) {
                console.log(JSON.stringify(persisted, null, 2));
            } else if (typeof command.print === 'string') {
                fs.appendFileSync(command.print, JSON.stringify(persisted, null, 2), 'utf8');
            }
            if (command.printPatch) {
                logger.info(getChangedNodesFromPersisted(persisted, command.printPatch));
            }
            parameters.project.makeCommit('master',
                [parameters.queue[parameters.queue.length - 1]],
                core.getHash(root),
                persisted.objects,
                command.msg)
                .then(function (commit) {
                    parameters.queue.push(commit.hash);
                    timeStamp();
                    deferred.resolve(parameters);
                })
                .catch(deferred.reject);
            break;
        case 'compare':
            merger.diff({
                project: parameters.project,
                logger: logger.fork('compare'),
                gmeConfig: parameters.gmeConfig,
                branchOrCommitA: parameters.queue[command.start],
                branchOrCommitB: parameters.queue[command.end]
            })
                .then(function (diff) {
                    logger.debug(diff);
                    timeStamp();
                    deferred.resolve(parameters);
                })
                .catch(deferred.reject);

            break;
        default:
            logger.error('unknown command:', command.command);
            deferred.reject(new Error('unknown command'));
    }

    return deferred.promise;
}

function loadVariables(core, root, variables) {
    var deferred = Q.defer(),
        variable,
        variableNodes = {},
        promises = [],
        loadVariable = function (variable) {
            var loadDeferred = Q.defer();

            core.loadByPath(root, variables[variable])
                .then(function (node) {
                    variableNodes[variable] = node;
                    loadDeferred.resolve();
                })
                .catch(loadDeferred.reject);

            return loadDeferred.promise;
        };

    for (variable in variables) {
        promises.push(loadVariable(variable));
    }

    Q.all(promises)
        .then(function () {
            deferred.resolve(variableNodes);
        })
        .catch(deferred.reject);

    return deferred.promise;
}

function singleRun(parameters) {
    var deferred = Q.defer(),
        core = parameters.core,
        rootHash = parameters.root,
        commitHash = parameters.commit,
        commitQueue = [commitHash],
        funcQueue = [],
        i,
        variables,
        root;

    logger.info('single execution');
    for (i = 0; i < parameters.commands.length; i += 1) {
        funcQueue.push(executeCommand);
    }

    core.loadRoot(rootHash)
        .then(function (root_) {
            root = root_;
            return loadVariables(core, root, parameters.variables);
        })
        .then(function (variableNodes_) {
            logger.info('variables loaded');
            variables = variableNodes_;
            var commandParameters = {
                core: parameters.core,
                root: root,
                commands: parameters.commands,
                index: 0,
                variables: variables,
                queue: commitQueue,
                measurements: parameters.measurements,
                executionIndex: parameters.index,
                project: parameters.project,
                gmeConfig: parameters.gmeConfig
            };
            return funcQueue.reduce(Q.when, Q(commandParameters));
        })
        .then(function () {
            parameters.index += 1;
            logger.info('execution finished');
            deferred.resolve(parameters);
        })
        .catch(deferred.reject);

    return deferred.promise;
}

function run(parameters) {
    var funcQueue = [],
        i;

    parameters.measurements = [];
    parameters.index = 0;
    logger.info('running test');
    for (i = 0; i < parameters.repetition; i += 1) {
        parameters.measurements.push(0);
        funcQueue.push(singleRun);
    }

    return funcQueue.reduce(Q.when, Q(parameters));
}

function execute(gmeConfig, testParameters, callback) {
    var deferred = Q.defer(),
        gmeAuth,
        projectId,
        project,
        core,
        baseCommitHash,
        storage;

    gmeConfig = gmeConfig || baseConfig;

    gmeConfig.authentication.enable = false;
    logger.info('test execution start');
    logger.debug('parameters', testParameters);

    WebGME.getGmeAuth(gmeConfig)
        .then(function (gmeAuth_) {
            logger.info('gmeAuth gathered');
            gmeAuth = gmeAuth_;

            storage = WebGME.getStorage(logger, gmeConfig, gmeAuth);
            return storage.openDatabase();
        })
        .then(function () {
            logger.info('DB opened');
            if (typeof testParameters.baseSeed !== 'string') {
                throw new Error('no starting point of test execution!!!');
            }
            return importTestBaseSeed(testParameters.baseSeed);
        })
        .then(function (projectId_) {
            projectId = projectId_;
            logger.info('project [' + projectId + '] created/accesses');
            return storage.openProject({projectId: projectId});
        })
        .then(function (project_) {
            project = project_;
            logger.info('project opened');
            core = new Core(project, {
                globConf: gmeConfig,
                logger: logger.fork('core')
            });
            return storage.getBranches({projectId: projectId})
        })
        .then(function (branches) {
            baseCommitHash = branches.master;

            return Q.ninvoke(project, 'loadObject', baseCommitHash);
        })
        .then(function (baseCommit) {
            baseRootHash = baseCommit.root;
            return run({
                core: core,
                root: baseCommit.root,
                commit: baseCommitHash,
                commands: testParameters.commands,
                variables: testParameters.variables,
                repetition: testParameters.repetition || 1,
                project: project,
                gmeConfig: gmeConfig
            });
        })
        .then(function (parameters) {
            deferred.resolve({
                name: testParameters.name,
                size: testParameters.size,
                depth: testParameters.depth,
                raw: parameters.measurements
            });
        })
        .catch(deferred.reject);

    return deferred.promise.nodeify(callback);
}

module.exports = execute;