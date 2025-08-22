const { applyIntent } = require('./intent');

function mapTradecardToAcf(tc = {}) {
  return applyIntent(tc).fields;
}

module.exports = { mapTradecardToAcf };
