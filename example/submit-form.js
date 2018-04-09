

async function run({browser, currentPage, repl}) {
    let page = await currentPage();
    await page.goto("http://localhost:7892/sample-form.php");
    let username = await page.$("input[name=username]");
    let password = await page.$("input[name=password]");
    await username.type("someuser");
    await password.type("blah");
    await username.press("Enter");

    //repl(); // open a repl
}

module.exports = run;
