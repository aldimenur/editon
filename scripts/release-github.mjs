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

function normalizePrivateKey(value) {
  return value.trim().replace(/\r\n/g, "\n").replace(/\n/g, "\\n");
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const out = {};
  const lines = readFileSync(filePath, "utf-8").split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue;

    const startsWithDoubleQuote = value.startsWith('"');
    const startsWithSingleQuote = value.startsWith("'");
    const quote = startsWithDoubleQuote
      ? '"'
      : startsWithSingleQuote
        ? "'"
        : "";

    if (quote && !value.endsWith(quote)) {
      while (i + 1 < lines.length) {
        i += 1;
        value += `\n${lines[i]}`;
        if (lines[i].trim().endsWith(quote)) {
          break;
        }
      }
    }

    out[key] = unquote(value);
  }

  return out;
}

const dotenv = loadDotEnv(path.join(rootDir, ".env"));
const runEnv = { ...process.env, ...dotenv };

if (typeof runEnv.TAURI_SIGNING_PRIVATE_KEY === "string") {
  runEnv.TAURI_SIGNING_PRIVATE_KEY = normalizePrivateKey(
    runEnv.TAURI_SIGNING_PRIVATE_KEY,
  );
}

if (
  !runEnv.TAURI_SIGNING_PRIVATE_KEY &&
  typeof runEnv.TAURI_SIGNING_PRIVATE_KEY_FILE === "string" &&
  runEnv.TAURI_SIGNING_PRIVATE_KEY_FILE.trim()
) {
  const keyPath = path.isAbsolute(runEnv.TAURI_SIGNING_PRIVATE_KEY_FILE)
    ? runEnv.TAURI_SIGNING_PRIVATE_KEY_FILE
    : path.join(rootDir, runEnv.TAURI_SIGNING_PRIVATE_KEY_FILE);

  if (!existsSync(keyPath)) {
    throw new Error(`TAURI_SIGNING_PRIVATE_KEY_FILE not found: ${keyPath}`);
  }

  runEnv.TAURI_SIGNING_PRIVATE_KEY = normalizePrivateKey(
    readFileSync(keyPath, "utf-8"),
  );
}

function run(command, args, options = {}) {
  const useShell = process.platform === "win32" && command === "npm";

  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: useShell,
    env: runEnv,
    ...options,
  });

  if (result.error) {
    console.error(
      `[release] Failed to run ${command}: ${result.error.message}`,
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(command, args) {
  const useShell = process.platform === "win32" && command === "npm";

  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf-8",
    shell: useShell,
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

function filterAssetsByVersion(assets, version) {
  const needle = version.toLowerCase();

  return assets.filter((assetPath) => {
    const fileName = path.basename(assetPath).toLowerCase();
    return fileName.includes(needle);
  });
}

function parseTargets(argv) {
  const targets = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--target") continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("Missing value for --target");
    }
    targets.push(value);
    i += 1;
  }

  return [...new Set(targets)];
}

function main() {
  const targets = parseTargets(process.argv.slice(2));
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

  const targetLabel =
    targets.length > 0 ? ` (targets: ${targets.join(", ")})` : "";
  console.log(`[release] Building Tauri app for ${tag}${targetLabel}...`);
  const tauriArgs = ["run", "tauri", "build"];
  if (targets.length > 0) {
    tauriArgs.push("--");
    for (const target of targets) {
      tauriArgs.push("--target", target);
    }
  }
  run("npm", tauriArgs);
  run("npm", ["run", "update:manifest"]);

  let assets = [];
  try {
    assets = collectAssets(bundleDir);
  } catch {
    console.warn(`[release] Bundle directory not found: ${bundleDir}`);
  }

  const versionedAssets = filterAssetsByVersion(assets, version);
  if (assets.length > 0 && versionedAssets.length === 0) {
    console.warn(
      `[release] No assets matched version ${version}. Skipping upload to avoid attaching older builds.`,
    );
  }

  assets = versionedAssets;

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
