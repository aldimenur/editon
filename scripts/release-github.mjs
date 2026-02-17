import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const ASSET_EXTENSIONS = new Set([
  ".exe",
  ".msi",
  ".dmg",
  ".appimage",
  ".deb",
  ".rpm",
  ".zip",
  ".tar",
  ".gz",
  ".sig",
  ".pkg",
]);

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const out = {};
  const lines = readFileSync(filePath, "utf-8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, value] = match;
    out[key] = unquote(value);
  }

  return out;
}

const dotenv = loadDotEnv(path.join(rootDir, ".env"));
const runEnv = { ...process.env, ...dotenv };

function run(command, args, options = {}) {
  const executable =
    process.platform === "win32" && command === "npm" ? "npm.cmd" : command;

  const result = spawnSync(executable, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
    env: runEnv,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(command, args) {
  const executable =
    process.platform === "win32" && command === "npm" ? "npm.cmd" : command;

  const result = spawnSync(executable, args, {
    cwd: rootDir,
    encoding: "utf-8",
    shell: false,
    env: runEnv,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function collectAssets(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectAssets(fullPath));
      continue;
    }

    const stat = statSync(fullPath);
    if (!stat.isFile() || stat.size === 0) continue;

    const lowerName = entry.name.toLowerCase();
    const extension = path.extname(lowerName);
    const isTarGz = lowerName.endsWith(".tar.gz");

    if (ASSET_EXTENSIONS.has(extension) || isTarGz) {
      files.push(fullPath);
    }
  }

  return files;
}

function main() {
  const packageJsonPath = path.join(rootDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  const version = packageJson.version;

  if (!version) {
    throw new Error("Version is missing in package.json");
  }

  const tag = `v${version}`;
  const bundleDir = path.join(
    rootDir,
    "src-tauri",
    "target",
    "release",
    "bundle",
  );

  if (
    !runEnv.TAURI_SIGNING_PRIVATE_KEY ||
    !runEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  ) {
    throw new Error(
      "Missing TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PASSWORD. Set them in .env.",
    );
  }

  console.log(`[release] Building Tauri app for ${tag}...`);
  run("npm", ["run", "tauri", "build"]);
  run("npm", ["run", "update:manifest"]);

  let assets = [];
  try {
    assets = collectAssets(bundleDir);
  } catch {
    console.warn(`[release] Bundle directory not found: ${bundleDir}`);
  }

  const releaseExists = runCapture("gh", ["release", "view", tag]).status === 0;

  if (releaseExists) {
    if (assets.length === 0) {
      console.log(
        `[release] Release ${tag} already exists and no assets were found to upload.`,
      );
      return;
    }

    console.log(
      `[release] Uploading ${assets.length} assets to existing release ${tag}...`,
    );
    run("gh", ["release", "upload", tag, ...assets, "--clobber"]);
    return;
  }

  const createArgs = [
    "release",
    "create",
    tag,
    "--title",
    `Editon ${tag}`,
    "--generate-notes",
  ];

  if (assets.length > 0) {
    createArgs.push(...assets);
  }

  console.log(`[release] Creating GitHub release ${tag}...`);
  run("gh", createArgs);
}

main();
