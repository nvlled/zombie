#!/usr/bin/env node

const Promise = require('bluebird');
const path = require("path");
const process = require("process");
const puppeteer = require('puppeteer');
const fs = require("fs");
const repl = require("repl");

Promise.promisifyAll(fs);

let endpointFilename = ".zombieteer-ws-endpoint";
let executableFilename = path.join(process.env.HOME, ".zombieteer-bin");

// overridable with commandline arguments: --name=value
let settings = {
    new:        false,
    repl:       false,
    bin:        "",
    "save-bin": false,
    // TODO: must also save sqlite file locally
    local:      false,
    exec:       "",
}

async function saveExecutablePath(executablePath, force=false) {
    if (!executablePath)
        return;

    let hasContents = !!await readExecutablePath()
    if (hasContents && !force)
        return;

    try {
        await fs.writeFileAsync(
            executableFilename,
            executablePath
        );
        console.log(`wrote executable path of chrome on` +
            `${executableFilename}: -> ${executablePath}`);
    } catch (e) { }
}

async function readExecutablePath() {
    try {
        return await fs.readFileAsync(
            executableFilename,
            { encoding: "utf-8" }
        );
    } catch (e) { }
    return "";
}

async function connect(wsEndpoint) {
    try {
        return await puppeteer.connect({
            browserWSEndpoint: wsEndpoint,
        });
    } catch(e) {
        console.log("invalid endpoint:", wsEndpoint);
    }
    return null;
}

async function getEndPointFilename() {
    if (settings.local) {
        return endpointFilename;
    } else {
        let homeDir = process.env.HOME;
        return `${homeDir}/${endpointFilename}`;
    }
}

async function readEndPoint() {
    let filename;
    try {
        filename = await getEndPointFilename();
        return await fs.readFileAsync(filename, { encoding: "utf-8" } );
    } catch (e) {
        console.warn(
            `failed to read endpoint: ${e.message}`
        );
    }
    return "";
}

async function saveEndPoint(wsEndpoint) {
    let filename = await getEndPointFilename();
    console.log(`saving endpoint to ${filename}: ${wsEndpoint}`);
    await fs.writeFileAsync(filename, wsEndpoint);
}

async function launch(args) {
    let browser = await puppeteer.launch(Object.assign({
        headless: false,
        args: ['--no-sandbox'],
    }, args));
    let wsEndpoint = browser.wsEndpoint();
    await saveEndPoint(wsEndpoint);
    return browser;
}

function parseCmdArgs() {
    let argv = process.argv;
    if (path.basename(argv[0]) == "node") {
        argv.shift();
    }

    // parse command line arguments
    let opts = {};
    let args = [];
    for (let arg of argv) {
        let rx = /^--?/;
        if (arg.match(rx)) {
            arg = arg.replace(rx, "")
            let fields = arg.split("=");
            let k = fields[0];
            let v = fields[1] || true;
            opts[k] = v;
        } else {
            args.push(arg);
        }
    }
    Object.assign(settings, opts);
    return args;
}

(async() => {
    let args = parseCmdArgs();
    let endpoint = await readEndPoint();
    console.log("trying to connect to endpoint:", endpoint);
    let browser = await connect(endpoint);

    var launchArgs = { }
    let executablePath = settings.bin || (await readExecutablePath());
    if (executablePath)
        await saveExecutablePath(executablePath, !!settings["save-bin"]);
    launchArgs["executablePath"] = executablePath;

    if (!browser) {
        if (settings.new) {
            browser = launch(launchArgs);
        } else {
            console.log("* there is no browser instance running");
            console.log("* run with --new run a new instance");
        }
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
    if (settings.exec) {
        // FIX: errors are not shown
        await (async function() {
            console.log(await eval(settings.exec));
        }).bind(scriptContext)();
    }

    if (args.length > 1 ) {
        let scriptFilename = args[args.length-1];
        try {
            await loadScript(scriptFilename);
        } catch (e) {
            console.log(e.stack);
            console.log(e.message);
        }
    }

    if (settings.repl)
        replStart();

    if ( ! currentRepl)
        browser.disconnect();
})();
