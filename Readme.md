
# zombieteer
A simple wrapper for puppeteer.js that lets a running
chrome browser to be controlled by scripts

## features
- keeps an opened browser
- exposes a repl for controlling the browser 

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
2. zombieteer --new         # opens a new browser, do only once
3. zombieteer submit-form.js


