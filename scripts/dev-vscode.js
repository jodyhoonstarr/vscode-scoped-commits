#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const yarnBin = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
const codeBin = process.platform === 'win32' ? 'code.cmd' : 'code';
const forwardedArgs = process.argv.slice(2);

if (forwardedArgs.includes('--help') || forwardedArgs.includes('-h')) {
  console.log(`Start webpack watch, then open a new VS Code window with this extension in development mode.

Usage:
  yarn dev
  yarn dev -- <path-to-open>
  yarn dev -- --user-data-dir=/tmp/vscode-conventional-commits-dev

Any extra arguments after "--" are forwarded to the "code" CLI.`);
  process.exit(0);
}

let launchedVSCode = false;
let shuttingDown = false;
let buildOutput = '';

console.log('Starting webpack watch...');

const webpackWatch = spawn(yarnBin, ['webpack-dev'], {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
});

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  process.exitCode = exitCode;

  if (!webpackWatch.killed) {
    webpackWatch.kill('SIGINT');
  }
}

function launchVSCode() {
  const args = [
    '--new-window',
    `--extensionDevelopmentPath=${repoRoot}`,
    ...forwardedArgs,
  ];

  console.log('\nOpening VS Code...');
  console.log(`code ${args.join(' ')}`);

  const vscode = spawn(codeBin, args, {
    cwd: repoRoot,
    stdio: 'ignore',
  });

  vscode.on('error', (error) => {
    if (error.code === 'ENOENT') {
      console.error(
        'Could not find the "code" CLI. Install it from VS Code via "Shell Command: Install \'code\' command in PATH".',
      );
    } else {
      console.error('Failed to open VS Code:', error);
    }

    shutdown(1);
  });

  vscode.unref();
}

function handleBuildOutput(chunk, target) {
  const text = chunk.toString();
  target.write(text);

  if (launchedVSCode) {
    return;
  }

  buildOutput = (buildOutput + text).slice(-4096);

  if (buildOutput.includes('compiled successfully')) {
    launchedVSCode = true;
    launchVSCode();
  }
}

webpackWatch.stdout.on('data', (chunk) => {
  handleBuildOutput(chunk, process.stdout);
});

webpackWatch.stderr.on('data', (chunk) => {
  handleBuildOutput(chunk, process.stderr);
});

webpackWatch.on('error', (error) => {
  console.error('Failed to start webpack watch:', error);
  shutdown(1);
});

webpackWatch.on('exit', (code, signal) => {
  if (shuttingDown) {
    return;
  }

  if (signal) {
    console.error(`webpack watch exited due to signal ${signal}.`);
  } else if (code !== 0) {
    console.error(`webpack watch exited with code ${code}.`);
  }

  shutdown(code ?? 1);
});

process.on('SIGINT', () => {
  shutdown(0);
});

process.on('SIGTERM', () => {
  shutdown(0);
});
