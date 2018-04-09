
// run with something like node-watch:
// watch --interval=0.1 --wait=0.1 'zombieteer reload.js
//

const fs = require("fs");
module.exports = async function({browser, currentPage}) {
    let page = await currentPage();
    await page.reload();
}
