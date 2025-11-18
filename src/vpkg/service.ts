import crypto from 'crypto';

export type VpkgManifest = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    version: string;
    description?: string;
    tags?: string[];
  };
  [key: string]: unknown;
};

export type VpkgBundle = {
  schemaVersion: string;
  manifest: VpkgManifest;
  files: Array<{
    path: string;
    encoding: string;
    content: string;
    bytes?: number;
  }>;
  createdAt: string;
  checksum: string;
};

export type StoredVpkg = {
  pkgId: string;
  projectId: string;
  manifest: VpkgManifest;
  bundle: VpkgBundle;
  encoded: string;
  createdAt: string;
};

export type LaunchedApp = {
  appId: string;
  pkgId: string;
  projectId: string;
  name: string;
  version: string;
  status: 'deploying' | 'running';
  endpoint: string;
  launchedAt: string;
};

export class VpkgService {
  private packages = new Map<string, StoredVpkg>();
  private apps = new Map<string, LaunchedApp>();

  publish(projectId: string, manifest: VpkgManifest, encodedBundle: string): StoredVpkg {
    this.validateManifest(manifest);
    const bundle = this.decodeBundle(encodedBundle);
    const pkgId = `vpkg-${crypto.randomUUID()}`;
    const stored: StoredVpkg = {
      pkgId,
      projectId,
      manifest,
      bundle,
      encoded: encodedBundle,
      createdAt: new Date().toISOString(),
    };
    this.packages.set(pkgId, stored);
    return stored;
  }

  list(projectId: string): StoredVpkg[] {
    return Array.from(this.packages.values()).filter((pkg) => pkg.projectId === projectId);
  }

  get(pkgId: string, projectId: string): StoredVpkg | null {
    const pkg = this.packages.get(pkgId);
    if (!pkg || pkg.projectId !== projectId) {
      return null;
    }
    return pkg;
  }

  download(pkgId: string, projectId: string) {
    const pkg = this.get(pkgId, projectId);
    if (!pkg) {
      return null;
    }
    return {
      pkgId: pkg.pkgId,
      manifest: pkg.manifest,
      bundle: pkg.encoded,
    };
  }

  findByName(projectId: string, name: string, version?: string): StoredVpkg | null {
    const normalized = name.trim().toLowerCase();
    const packages = this.list(projectId).filter(
      (pkg) => pkg.manifest.metadata.name?.toLowerCase() === normalized,
    );
    if (!packages.length) return null;
    if (version) {
      return packages.find((pkg) => pkg.manifest.metadata.version === version) || null;
    }
    return packages.sort((a, b) => (a.manifest.metadata.version || '').localeCompare(b.manifest.metadata.version || '')).pop() || null;
  }

  launchFromPackage(pkgId: string, projectId: string): LaunchedApp {
    const pkg = this.get(pkgId, projectId);
    if (!pkg) {
      throw new Error('Package not found');
    }
    return this.createApp(pkg);
  }

  launchEphemeral(projectId: string, manifest: VpkgManifest, encodedBundle: string): LaunchedApp {
    const stored = this.publish(projectId, manifest, encodedBundle);
    return this.createApp(stored);
  }

  listApps(projectId: string): LaunchedApp[] {
    return Array.from(this.apps.values()).filter((app) => app.projectId === projectId);
  }

  getApp(appId: string, projectId: string): LaunchedApp | null {
    const app = this.apps.get(appId);
    if (!app || app.projectId !== projectId) {
      return null;
    }
    return app;
  }

  private createApp(pkg: StoredVpkg): LaunchedApp {
    const appId = `app-${crypto.randomUUID()}`;
    const app: LaunchedApp = {
      appId,
      pkgId: pkg.pkgId,
      projectId: pkg.projectId,
      name: pkg.manifest.metadata.name,
      version: pkg.manifest.metadata.version,
      status: 'running',
      endpoint: `/apps/${appId}`,
      launchedAt: new Date().toISOString(),
    };
    this.apps.set(appId, app);
    return app;
  }

  private decodeBundle(encoded: string): VpkgBundle {
    try {
      const raw = Buffer.from(encoded, 'base64').toString('utf-8');
      return JSON.parse(raw) as VpkgBundle;
    } catch (err) {
      throw new Error('Invalid bundle payload');
    }
  }

  private validateManifest(manifest: VpkgManifest) {
    if (!manifest?.metadata?.name || !manifest.metadata.version) {
      throw new Error('Manifest must include metadata.name and metadata.version');
    }
  }
}
