import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import YAML from 'yaml';

export type VpkgManifest = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    version: string;
    description?: string;
    tags?: string[];
  };
  flow?: { files?: string[] };
  vvm?: { descriptors?: string[] };
  env?: { descriptors?: string[] };
  apix?: { schemaFragment?: string };
  tests?: { specs?: string[] };
  extra?: { files?: string[] };
};

export type VpkgBundleFile = {
  path: string;
  encoding: 'base64';
  content: string;
  bytes: number;
};

export type VpkgBundle = {
  schemaVersion: string;
  manifest: VpkgManifest;
  files: VpkgBundleFile[];
  createdAt: string;
  checksum: string;
};

const REGISTRY_ROOT = path.join(os.homedir(), '.voike', 'registry');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function readManifestFile(root: string): { manifest: VpkgManifest; manifestPath: string } {
  const yamlPath = path.join(root, 'vpkg.yaml');
  const jsonPath = path.join(root, 'vpkg.json');
  if (fs.existsSync(yamlPath)) {
    const raw = fs.readFileSync(yamlPath, 'utf-8');
    const manifest = YAML.parse(raw) as VpkgManifest;
    return { manifest, manifestPath: yamlPath };
  }
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const manifest = JSON.parse(raw) as VpkgManifest;
    return { manifest, manifestPath: jsonPath };
  }
  throw new Error(`vpkg.yaml or vpkg.json not found in ${root}`);
}

function collectManifestPaths(manifest: VpkgManifest): string[] {
  const paths = new Set<string>();
  manifest.flow?.files?.forEach((file) => paths.add(file));
  manifest.vvm?.descriptors?.forEach((file) => paths.add(file));
  manifest.env?.descriptors?.forEach((file) => paths.add(file));
  manifest.tests?.specs?.forEach((file) => paths.add(file));
  manifest.extra?.files?.forEach((file) => paths.add(file));
  if (manifest.apix?.schemaFragment) {
    paths.add(manifest.apix.schemaFragment);
  }
  return Array.from(paths.values()).filter(Boolean);
}

function encodeFile(root: string, relativePath: string): VpkgBundleFile {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Referenced file missing: ${relativePath}`);
  }
  const data = fs.readFileSync(absolute);
  return {
    path: relativePath,
    encoding: 'base64',
    content: data.toString('base64'),
    bytes: data.length,
  };
}

export function buildBundle(rootDir: string, outDir: string) {
  const root = path.resolve(rootDir);
  const { manifest, manifestPath } = readManifestFile(root);
  if (!manifest?.metadata?.name || !manifest.metadata.version) {
    throw new Error('Manifest metadata.name and metadata.version are required.');
  }
  const referencedPaths = collectManifestPaths(manifest);
  const files: VpkgBundleFile[] = [
    encodeFile(root, path.relative(root, manifestPath)),
    ...referencedPaths.map((relative) => encodeFile(root, relative)),
  ];
  const payload = JSON.stringify(
    files.map((file) => `${file.path}:${file.bytes}`),
  );
  const checksum = crypto.createHash('sha256').update(payload).digest('hex');
  const bundle: VpkgBundle = {
    schemaVersion: '1.0',
    manifest,
    files,
    createdAt: new Date().toISOString(),
    checksum,
  };
  ensureDir(outDir);
  const fileName = `${sanitizeName(manifest.metadata.name)}-${sanitizeName(manifest.metadata.version)}.vpkg`;
  const outputPath = path.join(outDir, fileName);
  fs.writeFileSync(outputPath, JSON.stringify(bundle, null, 2));
  cacheBundle(outputPath, manifest);
  return { bundle, outputPath };
}

export function cacheBundle(bundlePath: string, manifest: VpkgManifest) {
  const registryDir = path.join(
    REGISTRY_ROOT,
    sanitizeName(manifest.metadata.name),
    sanitizeName(manifest.metadata.version),
  );
  ensureDir(registryDir);
  const fileName = path.basename(bundlePath);
  fs.copyFileSync(bundlePath, path.join(registryDir, fileName));
}

export function encodeBundle(bundle: VpkgBundle) {
  const raw = JSON.stringify(bundle);
  return Buffer.from(raw, 'utf-8').toString('base64');
}

export function decodeBundle(encoded: string): VpkgBundle {
  const raw = Buffer.from(encoded, 'base64').toString('utf-8');
  return JSON.parse(raw) as VpkgBundle;
}

export function readBundleFromFile(bundlePath: string): VpkgBundle {
  const raw = fs.readFileSync(bundlePath, 'utf-8');
  return JSON.parse(raw) as VpkgBundle;
}

export function extractBundle(bundle: VpkgBundle, destination: string) {
  ensureDir(destination);
  for (const file of bundle.files) {
    const absolute = path.join(destination, file.path);
    ensureDir(path.dirname(absolute));
    const buffer = Buffer.from(file.content, file.encoding);
    fs.writeFileSync(absolute, buffer);
  }
}

export function resolveRegistryBundle(name: string, version?: string): string | null {
  const nameDir = path.join(REGISTRY_ROOT, sanitizeName(name));
  if (!fs.existsSync(nameDir)) {
    return null;
  }
  let resolvedVersion = version;
  if (!resolvedVersion) {
    const versions = fs
      .readdirSync(nameDir)
      .filter((entry) => fs.statSync(path.join(nameDir, entry)).isDirectory())
      .sort()
      .reverse();
    resolvedVersion = versions[0];
  }
  if (!resolvedVersion) {
    return null;
  }
  const versionDir = path.join(nameDir, sanitizeName(resolvedVersion));
  if (!fs.existsSync(versionDir)) {
    return null;
  }
  const files = fs.readdirSync(versionDir).filter((file) => file.endsWith('.vpkg'));
  if (!files.length) {
    return null;
  }
  return path.join(versionDir, files[0]);
}

export function parsePackageRef(ref: string): { name: string; version?: string } {
  const [name, version] = ref.split('@');
  if (!name) {
    throw new Error('Package reference must include a name (e.g., my-app@0.1.0)');
  }
  return { name, version };
}
