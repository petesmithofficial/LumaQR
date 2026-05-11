const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const engineSource = fs.readFileSync(path.join(root, "assets/js/qr-engine.js"), "utf8");
const context = {
  globalThis: {},
  TextEncoder,
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(engineSource, context, { filename: "qr-engine.js" });

const { QrEngine } = context;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertQr(text, options = {}) {
  const qr = QrEngine.encode(text, options);
  assert(Number.isInteger(qr.version), "version should be an integer");
  assert(qr.version >= 1 && qr.version <= 40, "version should be in QR range");
  assert(qr.size === qr.version * 4 + 17, "module size should match version");
  assert(qr.modules.length === qr.size, "matrix height should match size");
  assert(qr.modules.every((row) => row.length === qr.size), "matrix width should match size");
  assert(qr.modules.flat().every((module) => typeof module === "boolean"), "matrix should be boolean");
  assert(qr.byteLength <= qr.capacityBytes, "payload should fit reported capacity");

  const svg = QrEngine.toSvg(qr);
  assert(svg.startsWith("<svg"), "SVG should be generated");
  assert(svg.includes("<path"), "SVG should include dark modules");

  return qr;
}

const small = assertQr("https://example.com");
const medium = assertQr("Luma QR ".repeat(60));
const unicode = assertQr("PlasmaTech QR - こんにちは - Привет - مرحبا");
const long = assertQr("A".repeat(1400));
const high = assertQr("short high correction", { errorLevel: "H" });

assert(small.version < medium.version, "medium payload should use a larger version than small payload");
assert(unicode.byteLength > unicode.text.length, "Unicode payload should be UTF-8 encoded");
assert(long.errorLevel === "L" || long.errorLevel === "M", "long payload should fall back to a compact level");
assert(high.errorLevel === "H", "explicit high correction should be respected");

console.log("QR engine verification passed");
console.log(`Small: v${small.version} ${small.size}x${small.size} ${small.errorLabel}`);
console.log(`Medium: v${medium.version} ${medium.size}x${medium.size} ${medium.errorLabel}`);
console.log(`Unicode bytes: ${unicode.byteLength}`);
console.log(`Long: v${long.version} ${long.size}x${long.size} ${long.errorLabel}`);
