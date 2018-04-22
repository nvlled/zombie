const path = require("path");
const fs = require("fs");
const Promise = require('bluebird');
const { exec } = require("child_process");
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

    exec(cmd, env) {
        return new Promise(resolve => {
            exec(cmd, env, (...args) => {
                resolve(args);
            });
        });
    },
}
module.exports = util;
