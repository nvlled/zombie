#!/usr/bin/env node

const Promise = require('bluebird');
const path = require("path");
const process = require("process");
const fs = require("fs");
const throttle = require("throttleit");
const puppeteer = require('puppeteer');
const repl = require("repl");
const db = require("./db");

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
    reload:     "",
    url:        "",
    watch:      false,
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
    return null;
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
    if (!filename)
        return;
    console.log(`saving endpoint to ${filename}: ${wsEndpoint}`);
    try {
        await fs.writeFileAsync(filename, wsEndpoint);
    } catch(e) { }
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
    console.log("launch args", launchArgs);

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

    let pageId = page => {
        return page.mainFrame()._id;
    }

    let identifyPage = async (id, page) => {
        return await db.setPage(id, page);
    }

    let getPage = async id => {
        let page = await db.findPage(id, browser);
        if (!page) {
            page = await browser.newPage();
            await identifyPage(id, page);
        }
        page.setCacheEnabled(false);
        return page;
    }

    let listPages = async () => {
        for (let page of await browser.pages()) {
            console.log(">",
                await db.getId(page),
                await page.title(),
                page.url(),
                "|",
                page.mainFrame()._id,
            );
        }
    }

    let context = () => ({
        browser,
        currentPage,
        repl: replStart,
        pageId,
        getPage,
        identifyPage,
        listPages,
        hope: async (promise, k) => {
            let val = await promise;
            currentRepl.context[k || "__"] = val;
        },
    });

    let currentRepl = null;
    let replStart = () => {
        currentRepl = repl.start({
            prompt: ">>> ",
        });
        Object.assign(currentRepl.context, context());
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
            await script(context());
        } else {
            console.log("invalid module:", filename, 
                "must export a function: function(browser) {...}");
        }
    }

    let reloadPage = null;
    if (settings.watch) {
        let id = settings.reload = settings.reload || process.env.PWD;
        id = path.basename(id);
        let handler = throttle(async function(eventType) {
            if (reloadPage) {
                console.log("file changed, reloading...", id);
                await reloadPage.reload();
                await reloadPage.evaluate(id => {
                    document.title = "*"+id+"-"+document.title;
                }, id);
            }
        }, 150);
        fs.watch(".zombie", handler);
        fs.watch(".", function(type, filename) {
            console.log("file "+type, ":", filename);
        });
        fs.watch(process.env.PWD, function(type, filename) {
            console.log("file "+type, ":", filename);
        });
    }

    if (settings.reload) {
        let id = settings.reload;
        reloadPage = await db.findPage(id, browser);
        if (!reloadPage) {
            reloadPage = await getPage(id);
            if (settings.url)
                await reloadPage.goto(settings.url);
        } else {
            await reloadPage.reload();
        }
    }

    if (settings.exec) {
        // FIX: errors are not shown
        await (async function() {
            console.log(await eval(settings.exec));
        }).bind(context())();
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

    if ( ! currentRepl && !settings.watch) {
        browser.disconnect();
    }
})();
