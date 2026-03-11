import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function runCapture(command, args) {
  const executable =
    process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  const result = spawnSync(executable, args, {
    cwd: rootDir,
    encoding: "utf-8",
    shell: false,
  });

  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
  };
}

function normalizeGitHubUrl(remoteUrl) {
  if (!remoteUrl) return "";

  if (remoteUrl.startsWith("git@github.com:")) {
    const repo = remoteUrl.replace("git@github.com:", "").replace(/\.git$/, "");
    return `https://github.com/${repo}`;
  }

  return remoteUrl.replace(/\.git$/, "");
}

function main() {
  const packageJson = JSON.parse(
    readFileSync(path.join(rootDir, "package.json"), "utf-8"),
  );
  const version = packageJson.version;
  if (!version) {
    throw new Error("Version is missing in package.json");
  }

  const updatePath = path.join(rootDir, "update.json");
  const previousUpdate = existsSync(updatePath)
    ? JSON.parse(readFileSync(updatePath, "utf-8"))
    : {};

  const previousVersion =
    typeof previousUpdate.version === "string" ? previousUpdate.version : "";

  const remote = runCapture("git", ["remote", "get-url", "origin"]);
  const repoUrl =
    remote.status === 0
      ? normalizeGitHubUrl(remote.stdout)
      : "https://github.com/aldimenur/editon";

  const bundleDir = path.join(
    rootDir,
    "src-tauri",
    "target",
    "release",
    "bundle",
  );
  const platformArtifacts = [
    {
      platform: "windows-x86_64",
      fileName: `Editon_${version}_x64-setup.exe`,
      sigPath: path.join(
        bundleDir,
        "nsis",
        `Editon_${version}_x64-setup.exe.sig`,
      ),
    },
    {
      platform: "darwin-aarch64",
      fileName: `Editon_${version}_aarch64.dmg`,
      sigPath: path.join(bundleDir, "dmg", `Editon_${version}_aarch64.dmg.sig`),
    },
    {
      platform: "darwin-x86_64",
      fileName: `Editon_${version}_x64.dmg`,
      sigPath: path.join(bundleDir, "dmg", `Editon_${version}_x64.dmg.sig`),
    },
  ];

  const platforms = {};
  for (const artifact of platformArtifacts) {
    if (!existsSync(artifact.sigPath)) continue;

    const signature = readFileSync(artifact.sigPath, "utf-8").trim();
    platforms[artifact.platform] = {
      signature,
      url: `${repoUrl}/releases/download/v${version}/${artifact.fileName}`,
    };
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error(
      `No updater signatures found in ${bundleDir}. Run tauri build first.`,
    );
  }
  const notes =
    previousVersion && previousVersion !== version
      ? `Full Changelog: ${repoUrl}/compare/v${previousVersion}...v${version}`
      : `Release v${version}`;

  const updateManifest = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms,
  };

  writeFileSync(
    updatePath,
    `${JSON.stringify(updateManifest, null, 2)}\n`,
    "utf-8",
  );
  console.log(`[manifest] Updated update.json for v${version}`);
}

main();
