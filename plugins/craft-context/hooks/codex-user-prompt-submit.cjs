#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const { resolve } = require("node:path");

function formatCodexHookOutput(event, output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  if (event !== "UserPromptSubmit" || typeof output.additionalContext !== "string") return output;
  const { additionalContext, ...rest } = output;
  const priorSpecific = rest.hookSpecificOutput;
  const specific = priorSpecific && typeof priorSpecific === "object" && !Array.isArray(priorSpecific)
    ? priorSpecific
    : {};
  return {
    ...rest,
    hookSpecificOutput: { ...specific, hookEventName: "UserPromptSubmit", additionalContext },
  };
}

function hookEventName(rawInput) {
  try {
    const input = JSON.parse(rawInput);
    return typeof input.hook_event_name === "string" ? input.hook_event_name : "";
  } catch {
    return "";
  }
}

function normalizeOutput(event, rawOutput) {
  const output = JSON.parse(rawOutput || "{}");
  if (!output || typeof output !== "object" || Array.isArray(output)) throw new Error("Hook output must be a JSON object");
  return formatCodexHookOutput(event, output);
}

function run({ input, output, errorOutput, spawnProcess, bundlePath, args, env }) {
  return new Promise((resolveResult) => {
    let rawInput = "";
    input.setEncoding("utf8");
    input.on("data", chunk => { rawInput += chunk; });
    input.on("end", () => {
      const child = spawnProcess(process.execPath, [bundlePath, ...args], {
        env,
        stdio: ["pipe", "pipe", "inherit"],
      });
      let rawOutput = "";
      let spawnError;
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => { rawOutput += chunk; });
      child.on("error", error => { spawnError = error; });
      child.on("close", (code, signal) => {
        if (spawnError) {
          errorOutput.write("Craft Hook launcher could not start its child process.\n");
          resolveResult(1);
          return;
        }
        if (signal || code !== 0) {
          resolveResult(signal ? 1 : code ?? 1);
          return;
        }
        try {
          const normalized = normalizeOutput(hookEventName(rawInput), rawOutput);
          output.write(`${JSON.stringify(normalized)}\n`);
          resolveResult(0);
        } catch {
          errorOutput.write("Craft Hook returned invalid JSON.\n");
          resolveResult(1);
        }
      });
      child.stdin.end(rawInput);
    });
  });
}

function start(isMain, optionsFactory) {
  if (isMain) return launchCommandLine(optionsFactory());
}

function commandOptions() {
  return {
    input: process.stdin,
    output: process.stdout,
    errorOutput: process.stderr,
    spawnProcess: spawn,
    bundlePath: resolve(__dirname, "../dist/plugin/craft-codex-hook.cjs"),
    args: process.argv.slice(2),
    env: process.env,
    setExitCode: code => { process.exitCode = code; },
  };
}

function main(options) {
  return run(options).then(code => {
    options.setExitCode(code);
    return code;
  });
}

function launchCommandLine(options) {
  return main(options);
}

module.exports = { commandOptions, formatCodexHookOutput, hookEventName, launchCommandLine, main, normalizeOutput, run, start };

start(require.main === module, commandOptions);
