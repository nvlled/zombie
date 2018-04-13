const path = require("path");
const fs = require("fs");
const Promise = require('bluebird');
Promise.promisifyAll(fs);

let util = {
    async cat(filename) {
        return await fs.readFileAsync(filename, "utf-8");
    },

    async getVersion() {
        let json = await util.cat(`${__dirname}/package.json`);
        let match = json.match(/"version"\s*:\s*"(.*)"/);
        if (match) {
            return match[1];
        }
        return "dev";
    },
}
module.exports = util;
