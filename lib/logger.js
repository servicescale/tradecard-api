const chalk = require('chalk');

let verbose = false;

function setVerbose(value) {
  verbose = Boolean(value);
}

function formatMessage(prefix, message, data, colorFn, writer = console.log) {
  const output = colorFn(`${prefix} ${message}`);
  if (data) {
    writer(output, data);
  } else {
    writer(output);
  }
}

function log(stage, message, data = null, options = {}) {
  if (options.verbose && !verbose) return;
  const prefix = `[${new Date().toISOString()}] [${stage}]`;
  formatMessage(prefix, message, data, chalk.gray, console.log);
}

function warn(stage, message, data = null) {
  const prefix = `[${new Date().toISOString()}] [WARN] [${stage}]`;
  formatMessage(prefix, message, data, chalk.yellow, console.warn);
}

function info(stage, message, data = null) {
  const prefix = `[${new Date().toISOString()}] [INFO] [${stage}]`;
  formatMessage(prefix, message, data, chalk.blue, console.log);
}

function error(stage, message, data = null) {
  const prefix = `[${new Date().toISOString()}] [ERROR] [${stage}]`;
  formatMessage(prefix, message, data, chalk.red, console.error);
}

function debug(stage, message, data = null) {
  log(stage, message, data, { verbose: true });
}

const Logger = {
  log,
  info,
  warn,
  error,
  debug,
  setVerbose,
};

module.exports = { Logger };
