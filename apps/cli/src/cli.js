#!/usr/bin/env node
const version = "0.1.0";
const [command] = process.argv.slice(2);

function help() {
  console.log(`Ship Shit Games CLI ${version}

usage:
  shipshitgames --help
  shipshitgames --version

Install the desktop app on macOS:
  brew tap shipshitgames/tap
  brew install --cask shipshitgames-studio
`);
}

if (!command || command === "--help" || command === "-h" || command === "help") {
  help();
  process.exit(0);
}

if (command === "--version" || command === "-v" || command === "version") {
  console.log(version);
  process.exit(0);
}

console.error(`unknown command: ${command}`);
help();
process.exit(1);
