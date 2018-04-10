

async function run({browser, getPage, repl}) {
    let page = await getPage("sample-page");
    await page.goto("http://localhost:7892/sample-form.php");
    let username = await page.$("input[name=username]");
    let password = await page.$("input[name=password]");
    await username.type("someuser");
    await password.type("blah");
    await username.press("Enter");
}

module.exports = run;
