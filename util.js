const path = require("path");
const fs = require("fs");
const Promise = require('bluebird');
Promise.promisifyAll(fs);

let util = {
    async allFiles(dir, fn) {
        let files = await fs.readdirAsync(dir);
        for (let file of files) {
            let stat = await fs.statAsync(file);
            if (stat.isFile())
                fn(path.join(dir, file));
            else if (stat.isDirectory())
        }
    },

    recursiveWatch(dir, fn) {
    },
}
util.listAllDirs(".");
module.exports = util;
