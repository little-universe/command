// // module.exports = require('./src/command.js')
const foo = require('@little-universe/do-not-allow-missing-properties');
if("doNotAllowMissingProperties" in foo)
{
    console.log("Wow, nice!");
}

console.log("OK!")
