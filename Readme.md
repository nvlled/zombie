
# zombieteer
A simple wrapper for puppeteer.js that lets a running
chrome browser to be controlled by scripts

## features
- keeps an opened browser
- exposes a repl for controlling the browser 

## installation
```npm install -g zombieteer```

If you already have chrome installed, and want to avoid downloading another version, try:
```PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 npm install -g zombieteer```
then run with ```zombieteer --new --bin=/path/to/chrome```
note: the argument to bin must be the chrome binary itself, not a directory
You only need to specify --bin once. If you want to change it, add --save-bin


## usage
zombieteer path/to/_script_.js
_script_.js must export a function of type:
```
function({
    browser,     /*: puppeteer.Browser */
    currentPage, /*: () => puppeteer.Page */
    repl,        /*: () => void */
}) 
```

## running an example (see example/ dir)
0. cd example/
1. ./run-php-server.sh
2. zombieteer --new           # opens a new browser, do only once
3. zombieteer submit-form.js  # separate terminal


