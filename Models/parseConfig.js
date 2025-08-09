/* Models/parseConfig.js */

const Parse = require('parse/node');
require('dotenv').config();

// Initialize Parse SDK
Parse.initialize(
  process.env.APP_ID || 'myAppId',
  null, // JavaScript Key (not needed for Node.js)
  process.env.MASTER_KEY || 'myMasterKey'
);

Parse.serverURL = process.env.SERVER_URL || 'http://localhost:5000/parse';

// Export configured Parse
module.exports = Parse;