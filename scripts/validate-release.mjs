import fs from "node:fs";

const PROJECT_URL = "https://github.com/DeadEzrah/marvel-multiverse";
const EXPECTED_MANIFEST = "https://raw.githubusercontent.com/DeadEzrah/marvel-multiverse/main/system.json";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const system = readJson("system.json");
const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const releaseTag = process.env.GITHUB_REF_TYPE === "tag"
  ? process.env.GITHUB_REF_NAME
  : process.env.CI_COMMIT_TAG;
const version = system.version;
const expectedDownload = `${PROJECT_URL}/releases/download/release-${version}/marvel-multiverse-${version}.zip`;

const failures = [];
const assertEqual = (label, actual, expected) => {
  if (actual !== expected) failures.push(`${label}: expected ${expected}, received ${actual}`);
};

assertEqual("package version", packageJson.version, version);
assertEqual("lockfile version", packageLock.version, version);
assertEqual("lockfile root version", packageLock.packages?.[""]?.version, version);
assertEqual("project URL", system.url, PROJECT_URL);
assertEqual("manifest URL", system.manifest, EXPECTED_MANIFEST);
assertEqual("download URL", system.download, expectedDownload);

if (releaseTag) assertEqual("release tag", releaseTag, `release-${version}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Release metadata is consistent for ${version}.`);