
const sqlite = require("sqlite3");
const process = require("process");

const dbfilename = ".zombieteer-sq3";

function withDB(fn) {
    let db = new sqlite.Database(`${process.env.HOME}/${dbfilename}`);
    fn(db);
    db.close();
}

function dbExec(query, args=[], fn) {
    withDB(db => db.run(query, args, fn));
}

function dbQuery(query, args=[], fn) {
    withDB(db => db.run(query, args, fn));
}

function dbQueryAsync(query, args=[]) {
    return new Promise((resolve, reject) => {
        withDB(db => db.all(query, args, (err, rows) => {
            if (err)
                reject(err);
            else
                resolve(rows);
        }))
    });
}

function init() {
    dbExec("create table if not exists pages(id text, frameId text)");
}

async function getId(page) /* frameId:int */{
    if (!page)
        return null;
    let frameId = page.mainFrame()._id;
    let rows = await dbQueryAsync(
        "select * from pages where frameId = ?",
        [frameId],
    );
    if (!rows)
        return null;
    let row = rows[0];
    if (row) {
        return row.id;
    }
    return null;
}


async function findPage(id, browser) /* puppeteer.Page[] */ {
    for (let page of await browser.pages()) {
        let id_ = await getId(page);
        if (id_ == id) {
            return page;
        }
    }
    return null;
}

function setPage(id, page) {
    let frameId = "";
    if (typeof page.mainFrame == "function") {
        frameId = page.mainFrame()._id;
    } else if (typeof page == "string") {
        frameId = page;
    }
    if (!frameId) {
        console.warn("failed to get frameId of page", id);
        return;
    }

    return new Promise((resolve, reject) => {
        dbExec("delete from pages where id = ? or frameId = ?", 
            [id, frameId], 
            function(err) {
                console.log("deleted existing rows", id);
                if (err)
                    return reject(err);
                dbExec("insert into pages(id, frameId) values(?, ?)", 
                    [id, frameId],
                    function(err) {
                        console.log("create page", id);
                        if (err)
                            return reject(err);
                        resolve(this);
                    }
                );
            });
    });
}

// invoke when terminating browser
async function clearUnused(browser) {
    withDB(async db => {
        let stmt = db.prepare("delete from pages where frameId = ?");
        for (let page of await browser.pages()) {
            if ( ! getId(page)) {
                stmt.run(page.mainFrame()._id);
            }
        }
        stmt.finalize();
    });
}

init();

module.exports = {
    dbfilename,
    setPage,
    findPage,
    getId,
}
