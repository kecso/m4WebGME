/**
 * @author kecso / https://github.com/kecso
 */

function processResults(rough) {
    var raw = rough.raw,
        mean = 0,
        min,
        max,
        i;

    for (i = 0; i < raw.length; i += 1) {
        mean += raw[i];
        if (min === undefined || raw[i] < min) {
            min = raw[i];
        }
        if (max === undefined || raw[i] > max) {
            max = raw[i];
        }
    }

    mean /= i;

    rough.min = min;
    rough.mean = mean;
    rough.max = max;
    return rough;
}

function printResult(jsonData) {
    var line = '\n';
    switch (program.format) {
        case 'csv':
            line += jsonData.name + ',' + jsonData.size + ',' +
                jsonData.depth + ',' + jsonData.mean + ',' + jsonData.min + ',' + jsonData.max;
            break;
        default:
            line += JSON.stringify(jsonData);
    }

    if (program.output) {
        fs.appendFileSync(program.output, line, 'utf8');
    } else {
        console.log(line);
    }
}

var execute = require('./execute'),
    program = require('commander'),
    fs = require('fs');

program
    .option('-t --test-case <string>', 'The JSON file containing the testcase information')
    .option('-f --format [string]', 'The output format of the result [csv/json]')
    .option('-o --output <string>', 'The output file')
    .parse(process.argv);

execute(null, JSON.parse(fs.readFileSync(program.testCase, 'utf8')))
    .then(function (raw) {
        printResult(processResults(raw));
        process.exit(0);
    })
    .catch(function (err) {
        console.log('failed:', err);
        process.exit(1);
    });