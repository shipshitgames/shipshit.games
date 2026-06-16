#!/usr/bin/env node
import { runNewCommand } from "./new-command.js";

const version = "0.1.0";
const [command, ...rest] = process.argv.slice(2);

function help() {
  console.log(`Ship Shit Games CLI ${version}

usage:
  shipshitgames <command> [options]

commands:
  new <dir>      Scaffold a new Ship Shit Games game repo (alias: init)
  --help         Show this help
  --version      Print the CLI version

Run "shipshitgames new --help" for scaffolder options.

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

if (command === "new" || command === "init") {
  const code = runNewCommand(rest, { stdout: process.stdout, stderr: process.stderr });
  process.exit(code);
}

console.error(`unknown command: ${command}`);
help();
process.exit(1);
