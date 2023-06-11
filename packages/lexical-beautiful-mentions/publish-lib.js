const path = require("path");
const { execSync } = require("child_process");

const libPath = path.join(__dirname, "./lib");

execSync("npm publish --dry-run", { cwd: libPath, stdio: "inherit" });
