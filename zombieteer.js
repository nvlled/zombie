#!/usr/bin/env node

const Promise = require('bluebird');
const path = require("path");
const process = require("process");
const fs = require("fs");
const throttle = require("throttleit");
const puppeteer = require('puppeteer');
const repl = require("repl");
const db = require("./db");
const util = require("./util");

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
    update:     false,
    slowmo:     null,
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
        return (await fs.readFileAsync(
            executableFilename,
            { encoding: "utf-8" }
        )).trim();
    } catch (e) { }
    return null;
}

async function connect(wsEndpoint) {
    try {
        return await puppeteer.connect({
            browserWSEndpoint: wsEndpoint,
            slowMo: parseFloat(settings.slowmo) || 0,
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
        return (await fs.readFileAsync(filename, { encoding: "utf-8" } )).trim();
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
    let browser = await connect(endpoint);

    var launchArgs = { }
    let executablePath = settings.bin || (await readExecutablePath());
    if (executablePath)
        await saveExecutablePath(executablePath, !!settings["save-bin"]);
    launchArgs["executablePath"] = executablePath;
    launchArgs["slowMo"] = parseFloat(settings.slowmo) || 0;

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

    let resizePage = async page => {
        let screenSize = await page.evaluate(() => {
            return {
                width: window.outerWidth,
                height: window.outerHeight,
            }
        });
        await page.setViewport({
            width: screenSize.width,
            height: screenSize.height,
        });
    }

    let setupPage = async page => {
        page.setCacheEnabled(false);
        await resizePage(page);
    }

    let getPage = async id => {
        let page = await db.findPage(id, browser);
        if (!page) {
            page = await browser.newPage();
            await identifyPage(id, page);
        }
        await setupPage(page);
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

    let noCmdRun = false;
    let reloadPage = null;

    if (settings.reload) {
        let id = settings.reload;
        if (typeof id == "boolean")
            id = process.env.PWD;

        reloadPage = await db.findPage(id, browser);

        if (!reloadPage) {
            reloadPage = await getPage(id);
            if (settings.url)
                await reloadPage.goto(settings.url);
        } else {
            await setupPage(reloadPage);
            await reloadPage.reload({
                waitUntil: "domcontentloaded",
            });
        }
    } else if (settings.url) {
        let page = await currentPage();
        await setupPage(page);
        await page.goto(settings.url);
        console.log("opening url:", settings.url);
    } else if (settings.version) {
        let prog = path.basename(args[0]);
        let version = await util.getVersion();
        console.log(`${prog} version: ${version}`);

    } else if (settings.exec) {
        // FIX: errors are not shown
        await (async function() {
            console.log(await eval(settings.exec));
        }).bind(context())();
    } else if (settings.update) {
        console.log("updating...");
        let cmd = "npm install -g zombieteer";
        let [err, stdout, stderr] = await util.exec(cmd, {
            env: Object.assign({
                PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: true,
            }, process.env),
        });
        if (err) {
            console.log(stderr);
        } else {
            console.log(stdout);
        }
    } else {
        noCmdRun = true;
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

    if (settings.repl) {
        replStart();
        noCmdRun = false;
    }

    if (noCmdRun) {
        console.log("** no command executed");
    } else {
        let pages = await browser.pages();
        await Promise.all(pages.map(resizePage));
    }

    if ( ! currentRepl && !settings.watch) {
        browser.disconnect();
    }
})();
