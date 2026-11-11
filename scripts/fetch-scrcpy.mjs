#!/usr/bin/env node
// Installs the official scrcpy release for one Rust target into
// src-tauri/resources/scrcpy/. Any failure exits nonzero so CI cannot package an
// incomplete application.
//
// Usage: node scripts/fetch-scrcpy.mjs [--target <rust-triple>]

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const VERSION = "5.0.1";
const RELEASE_URL = `https://github.com/Genymobile/scrcpy/releases/download/v${VERSION}`;
const OUTPUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src-tauri/resources/scrcpy",
);
const PLACEHOLDER = ".gitkeep";

// The official adb is left out: scrcpy runs with the application's adb through
// the ADB environment variable.
const UNIX_FILES = ["scrcpy", "scrcpy-server", "scrcpy.png", "disconnected.png", "LICENSE"];
const WINDOWS_FILES = [
  "scrcpy.exe",
  "scrcpy-server",
  "scrcpy.png",
  "disconnected.png",
  "LICENSE.txt",
  "SDL3.dll",
  "avcodec-63.dll",
  "avformat-63.dll",
  "avutil-61.dll",
  "swresample-7.dll",
  "libusb-1.0.dll",
];

// Checksums come from the release's SHA256SUMS.txt.
const TARGETS = {
  "aarch64-apple-darwin": {
    name: `scrcpy-macos-aarch64-v${VERSION}`,
    extension: "tar.gz",
    sha256: "33611e51977a8289e2e124b220f727895181ef2eb9060e0987a4dc2db9cf0d6b",
    files: UNIX_FILES,
  },
  "x86_64-apple-darwin": {
    name: `scrcpy-macos-x86_64-v${VERSION}`,
    extension: "tar.gz",
    sha256: "31a5467a9e907f162b093267cbbab1276b15c6e709c2ea8159566a8d165beb50",
    files: UNIX_FILES,
  },
  "x86_64-unknown-linux-gnu": {
    name: `scrcpy-linux-x86_64-v${VERSION}`,
    extension: "tar.gz",
    sha256: "9f969d30cc574816077edecda65719c1c70b0aee1df1ba5fa00779ac07b8fd6e",
    files: UNIX_FILES,
  },
  "x86_64-pc-windows-msvc": {
    name: `scrcpy-win64-v${VERSION}`,
    extension: "zip",
    sha256: "b12a2c4ee8be317422451fc7dcf8ee20a71b5ea7ef9ad73ddd825a25316227a5",
    files: WINDOWS_FILES,
  },
};

const HOST_TARGETS = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "win32-x64": "x86_64-pc-windows-msvc",
};

function selectTarget() {
  const { values } = parseArgs({ options: { target: { type: "string" } } });
  const hostKey = `${process.platform}-${process.arch}`;
  const triple = values.target ?? HOST_TARGETS[hostKey];
  if (!triple) throw new Error(`no bundled scrcpy for host ${hostKey}; pass --target`);
  const target = TARGETS[triple];
  if (!target) throw new Error(`unsupported target ${triple}`);
  return { triple, target };
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function verifyChecksum(data, expected, fileName) {
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== expected) {
    throw new Error(`checksum mismatch for ${fileName}: expected ${expected}, got ${actual}`);
  }
}

// The tar found in PATH on Windows runners can be Git's, which cannot read zip.
function tarProgram() {
  if (process.platform !== "win32") return "tar";
  if (!process.env.SystemRoot) throw new Error("SystemRoot is not set");
  return join(process.env.SystemRoot, "System32", "tar.exe");
}

function extract(archive, destination) {
  execFileSync(tarProgram(), ["-xf", archive, "-C", destination], { stdio: "inherit" });
}

function requireFiles(directory, files) {
  const missing = files.filter((file) => !existsSync(join(directory, file)));
  if (missing.length > 0) throw new Error(`release is missing ${missing.join(", ")}`);
}

// Removing stale files keeps a switch between architectures from mixing builds.
function replaceBundledFiles(sourceDir, files) {
  for (const entry of readdirSync(OUTPUT_DIR)) {
    if (entry !== PLACEHOLDER) rmSync(join(OUTPUT_DIR, entry), { recursive: true });
  }
  for (const file of files) copyFileSync(join(sourceDir, file), join(OUTPUT_DIR, file));
}

async function main() {
  const { triple, target } = selectTarget();
  const fileName = `${target.name}.${target.extension}`;
  const workDir = mkdtempSync(join(tmpdir(), "adb-gui-scrcpy-"));
  try {
    console.log(`Fetching ${fileName}...`);
    const data = await download(`${RELEASE_URL}/${fileName}`);
    verifyChecksum(data, target.sha256, fileName);
    const archive = join(workDir, fileName);
    writeFileSync(archive, data);
    extract(archive, workDir);
    const sourceDir = join(workDir, target.name);
    requireFiles(sourceDir, target.files);
    replaceBundledFiles(sourceDir, target.files);
    console.log(`Bundled scrcpy ${VERSION} for ${triple} into ${OUTPUT_DIR}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`fetch-scrcpy: ${error.message}`);
  process.exitCode = 1;
});
