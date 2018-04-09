#!/usr/bin/env node

const Promise = require('bluebird');
const path = require("path");
const process = require("process");
const puppeteer = require('puppeteer');
const fs = require("fs");
const repl = require("repl");

Promise.promisifyAll(fs);

let endpointFilename = ".wsEndpoint";

async function connect(filename) {
    let wsEndpoint;
    try {
        wsEndpoint = await fs.readFileAsync(filename, { encoding: "utf-8" } );
        console.log("read wsEndpoint", wsEndpoint, "from", filename);

        if (wsEndpoint) {
            let browser = await puppeteer.connect({
                browserWSEndpoint: wsEndpoint,
            });
            return browser;
        }
    } catch (e) { }

    return null;
}

async function launch() {
    let browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox'],
    });
    let wsEndpoint = browser.wsEndpoint();
    await fs.writeFileAsync(endpointFilename, wsEndpoint);
    return browser;
}

(async() => {
    let argv = process.argv;
    if (path.basename(argv[0]) == "node") {
        argv.shift();
    }

    // search first in the current directory
    let browser = await connect(endpointFilename);
    if ( ! browser && argv.length > 1) {
        // then search first in the script directory
        let scriptFilename = process.argv[argv.length-1];
        let scriptDir = path.dirname(scriptFilename)
        browser = await connect(`${scriptDir}/${endpointFilename}`);
    }

    if (!browser) {
        for (let arg of argv) {
            arg = arg.replace(/^--?/, "")
            if (arg == "new") {
                browser = launch();
            }
        }
        console.log("* there is no browser instance running");
        console.log("* run with --new run a new instance");
        return;
    }

    let currentPage = async () => {
        let pages = await browser.pages();
        if (!pages || pages.length == 0)
            pages = [await browser.newPage()];

        return pages[0];
    }

    let currentRepl = null;
    let replStart = () => {
        currentRepl = repl.start({
            prompt: ">>> ",
            //eval(cmd, ctx, __, cb) {
            //    let result = eval.call(ctx, cmd);
            //    return cb(null, result);
            //},
        });
        Object.assign(currentRepl.context, {
            browser,
            currentPage,
            hope: async (promise, k) => {
                let val = await promise;
                currentRepl.context[k || "__"] = val;
            },
        });
    }

    let scriptContext = {
        browser,
        currentPage,
        repl: replStart,
    }

    let loadScript = async function(filename) {
        let cwd = process.env.PWD;
        filename = `${cwd}/${filename}`;
        console.log("loading module", filename);
        delete require.cache[require.resolve(filename)];
        let module = require(filename);
        let script = null;
        if (typeof module == "function")
            script = module;
        else if (typeof module.run == "function")
            script = module.run;
        if (script) {
            await script(scriptContext);
        } else {
            console.log("invalid module:", filename, 
                "must export a function: function(browser) {...}");
        }
    }

    if (argv.length > 1 ) {
        let scriptFilename = process.argv[argv.length-1];
        try {
            await loadScript(scriptFilename);
        } catch (e) {
            console.log(e.stack);
            console.log(e.message);
        }
    }

    if ( ! currentRepl)
        browser.disconnect();
})();

