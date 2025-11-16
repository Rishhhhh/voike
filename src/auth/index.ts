import crypto from 'crypto';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export const DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000';
export const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000001';

export type OrganizationRecord = {
  id: string;
  name: string;
  slug: string | null;
};

export type ProjectRecord = {
  id: string;
  name: string;
  organizationId: string;
};

export type ApiKeyRecord = {
  id: string;
  projectId: string;
  key: string;
  label?: string | null;
};

export type WaitlistRecord = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  notes?: string | null;
  created_at?: Date;
  approved_at?: Date | null;
  updated_at?: Date;
  organization_id?: string | null;
  project_id?: string | null;
  api_key_id?: string | null;
  organization?: OrganizationRecord | null;
  project?: ProjectRecord | null;
  apiKey?: ApiKeyRecord | null;
};

const generateKey = () => crypto.randomBytes(32).toString('hex');

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .substring(0, 64) || 'org';

export const ensureAuthTables = async (pool: Pool, playgroundKey?: string) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY,
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY,
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      key TEXT UNIQUE NOT NULL,
      label TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      organization_id UUID,
      project_id UUID,
      api_key_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(
    `INSERT INTO organizations (id, name, slug)
     VALUES ($1, 'Playground Org', 'playground')
     ON CONFLICT (id) DO NOTHING;`,
    [DEFAULT_ORGANIZATION_ID],
  );

  await pool.query(
    `INSERT INTO projects (id, organization_id, name)
     VALUES ($1, $2, 'Playground Project')
     ON CONFLICT (id) DO NOTHING;`,
    [DEFAULT_PROJECT_ID, DEFAULT_ORGANIZATION_ID],
  );

  const existingKey = await pool.query(
    `SELECT key FROM api_keys WHERE project_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [DEFAULT_PROJECT_ID],
  );
  if (existingKey.rowCount === 0) {
    const key = playgroundKey || generateKey();
    await pool.query(
      `INSERT INTO api_keys (id, project_id, key, label) VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO NOTHING`,
      [uuidv4(), DEFAULT_PROJECT_ID, key, 'playground'],
    );
  }
};

export const createOrganization = async (
  pool: Pool,
  name: string,
  slug?: string,
): Promise<OrganizationRecord> => {
  const id = uuidv4();
  const finalSlug = slug ? toSlug(slug) : toSlug(name);
  await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)`, [
    id,
    name,
    finalSlug,
  ]);
  return { id, name, slug: finalSlug };
};

export const listOrganizations = async (pool: Pool): Promise<OrganizationRecord[]> => {
  const { rows } = await pool.query(`SELECT id, name, slug FROM organizations ORDER BY created_at DESC`);
  return rows;
};

export const createProject = async (
  pool: Pool,
  name: string,
  organizationId: string,
): Promise<ProjectRecord> => {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO projects (id, name, organization_id) VALUES ($1, $2, $3)`,
    [id, name, organizationId],
  );
  return { id, name, organizationId };
};

const getOrganizationById = async (pool: Pool, id: string) => {
  const { rows } = await pool.query(`SELECT id, name, slug FROM organizations WHERE id = $1`, [id]);
  return rows[0] as OrganizationRecord | undefined;
};

const getProjectById = async (pool: Pool, id: string) => {
  const { rows } = await pool.query(
    `SELECT id, name, organization_id FROM projects WHERE id = $1`,
    [id],
  );
  return rows[0] as ProjectRecord | undefined;
};

const getApiKeyById = async (pool: Pool, id: string) => {
  const { rows } = await pool.query(
    `SELECT id, project_id, key, label FROM api_keys WHERE id = $1`,
    [id],
  );
  return rows[0] as ApiKeyRecord | undefined;
};

export const createApiKey = async (
  pool: Pool,
  projectId: string,
  label?: string,
  providedKey?: string,
): Promise<ApiKeyRecord> => {
  const id = uuidv4();
  const key = providedKey || generateKey();
  await pool.query(
    `INSERT INTO api_keys (id, project_id, key, label) VALUES ($1, $2, $3, $4)`,
    [id, projectId, key, label ?? null],
  );
  return { id, projectId, key, label };
};

export const findProjectByApiKey = async (
  pool: Pool,
  apiKey: string,
): Promise<ProjectRecord | null> => {
  const { rows } = await pool.query(
    `SELECT projects.id, projects.name, projects.organization_id
     FROM api_keys
     JOIN projects ON api_keys.project_id = projects.id
     WHERE api_keys.key = $1 AND api_keys.active = true`,
    [apiKey],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    name: rows[0].name,
    organizationId: rows[0].organization_id,
  };
};

export const addWaitlistEntry = async (
  pool: Pool,
  email: string,
  name?: string,
): Promise<WaitlistRecord> => {
  const id = uuidv4();
  const { rows } = await pool.query(
    `INSERT INTO waitlist (id, email, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email)
     DO UPDATE SET
       name = COALESCE(EXCLUDED.name, waitlist.name),
       updated_at = NOW()
     RETURNING *`,
    [id, email, name || null],
  );
  return rows[0];
};

export const listWaitlistEntries = async (pool: Pool): Promise<WaitlistRecord[]> => {
  const { rows } = await pool.query(`
    SELECT
      w.*,
      org.name AS organization_name,
      org.slug AS organization_slug,
      proj.name AS project_name,
      proj.organization_id AS project_organization_id,
      k.project_id AS api_key_project_id,
      k.key AS api_key_value,
      k.label AS api_key_label
    FROM waitlist w
    LEFT JOIN organizations org ON w.organization_id = org.id
    LEFT JOIN projects proj ON w.project_id = proj.id
    LEFT JOIN api_keys k ON w.api_key_id = k.id
    ORDER BY w.created_at DESC
  `);
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    notes: row.notes,
    created_at: row.created_at,
    approved_at: row.approved_at,
    updated_at: row.updated_at,
    organization_id: row.organization_id,
    project_id: row.project_id,
    api_key_id: row.api_key_id,
    organization: row.organization_id
      ? { id: row.organization_id, name: row.organization_name, slug: row.organization_slug }
      : null,
    project: row.project_id
      ? {
          id: row.project_id,
          name: row.project_name,
          organizationId: row.project_organization_id || row.organization_id,
        }
      : null,
    apiKey: row.api_key_id
      ? {
          id: row.api_key_id,
          projectId: row.api_key_project_id || row.project_id,
          key: row.api_key_value,
          label: row.api_key_label,
        }
      : null,
  }));
};

export const approveWaitlistEntry = async (
  pool: Pool,
  waitlistId: string,
  options: { organizationName?: string; projectName?: string; keyLabel?: string },
) => {
  const { rows } = await pool.query(`SELECT * FROM waitlist WHERE id = $1`, [waitlistId]);
  const entry = rows[0];
  if (!entry) {
    throw new Error('Waitlist entry not found');
  }

  if (entry.status === 'approved' && entry.organization_id && entry.project_id && entry.api_key_id) {
    const [organization, project, apiKey] = await Promise.all([
      getOrganizationById(pool, entry.organization_id),
      getProjectById(pool, entry.project_id),
      getApiKeyById(pool, entry.api_key_id),
    ]);
    return { entry, organization, project, apiKey };
  }

  const orgName = options.organizationName || entry.name || `org-${waitlistId.slice(0, 8)}`;
  const organization = await createOrganization(pool, orgName);

  const projectName = options.projectName || `project-${waitlistId.slice(0, 6)}`;
  const project = await createProject(pool, projectName, organization.id);

  const apiKey = await createApiKey(pool, project.id, options.keyLabel ?? 'primary');

  await pool.query(
    `UPDATE waitlist
     SET status = 'approved',
         approved_at = NOW(),
         organization_id = $2,
         project_id = $3,
         api_key_id = $4
     WHERE id = $1`,
    [waitlistId, organization.id, project.id, apiKey.id],
  );

  const updated = await pool.query(`SELECT * FROM waitlist WHERE id = $1`, [waitlistId]);

  return { entry: updated.rows[0], organization, project, apiKey };
};
