import crypto from 'crypto';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export const DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000';
export const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000001';

export type UserStatus = 'pending' | 'approved' | 'rejected';

export type UserRecord = {
  id: string;
  email: string;
  name: string | null;
  status: UserStatus;
  passwordHash: string | null;
  waitlistId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  lastLoginAt?: Date | null;
};

export type OrganizationRecord = {
  id: string;
  name: string;
  slug: string | null;
  ownerUserId?: string | null;
};

export type ProjectRecord = {
  id: string;
  name: string;
  organizationId: string;
  ownerUserId?: string | null;
};

export type ApiKeyRecord = {
  id: string;
  projectId: string;
  key: string;
  label?: string | null;
  createdByUserId?: string | null;
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
  user_id?: string | null;
  organization?: OrganizationRecord | null;
  project?: ProjectRecord | null;
  apiKey?: ApiKeyRecord | null;
  user?: UserRecord | null;
};

const generateKey = () => crypto.randomBytes(32).toString('hex');

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .substring(0, 64) || 'org';

const mapOrganizationRow = (row: any): OrganizationRecord => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  ownerUserId: row.owner_user_id ?? null,
});

const mapProjectRow = (row: any): ProjectRecord => ({
  id: row.id,
  name: row.name,
  organizationId: row.organization_id,
  ownerUserId: row.owner_user_id ?? null,
});

const mapApiKeyRow = (row: any): ApiKeyRecord => ({
  id: row.id,
  projectId: row.project_id,
  key: row.key,
  label: row.label,
  createdByUserId: row.created_by_user_id ?? null,
});

const mapUserRow = (row: any): UserRecord => ({
  id: row.id,
  email: row.email,
  name: row.name,
  status: row.status,
  passwordHash: row.password_hash,
  waitlistId: row.waitlist_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastLoginAt: row.last_login_at,
});

export const ensureAuthTables = async (pool: Pool, playgroundKey?: string) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT,
      status TEXT DEFAULT 'pending',
      waitlist_id UUID UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      owner_user_id UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(
    `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY,
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      owner_user_id UUID REFERENCES users(id),
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY,
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      created_by_user_id UUID REFERENCES users(id),
      key TEXT UNIQUE NOT NULL,
      label TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(
    `ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);`,
  );

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
      user_id UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(
    `ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);`,
  );

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

export const createUser = async (
  pool: Pool,
  email: string,
  status: UserStatus = 'pending',
  name?: string | null,
  waitlistId?: string,
): Promise<UserRecord> => {
  const id = uuidv4();
  const normalizedEmail = email.trim().toLowerCase();
  const { rows } = await pool.query(
    `INSERT INTO users (id, email, name, status, waitlist_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       status = EXCLUDED.status,
       name = COALESCE(EXCLUDED.name, users.name),
       waitlist_id = COALESCE(users.waitlist_id, EXCLUDED.waitlist_id),
       updated_at = NOW()
     RETURNING *`,
    [id, normalizedEmail, name || null, status, waitlistId || null],
  );
  return mapUserRow(rows[0]);
};

export const findUserByEmail = async (pool: Pool, email: string): Promise<UserRecord | null> => {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [
    email.trim().toLowerCase(),
  ]);
  return rows[0] ? mapUserRow(rows[0]) : null;
};

export const findUserById = async (pool: Pool, id: string): Promise<UserRecord | null> => {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ? mapUserRow(rows[0]) : null;
};

export const setUserPasswordHash = async (
  pool: Pool,
  userId: string,
  passwordHash: string,
): Promise<UserRecord> => {
  const { rows } = await pool.query(
    `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [userId, passwordHash],
  );
  return mapUserRow(rows[0]);
};

export const updateUserStatus = async (
  pool: Pool,
  userId: string,
  status: UserStatus,
): Promise<UserRecord> => {
  const { rows } = await pool.query(
    `UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [userId, status],
  );
  return mapUserRow(rows[0]);
};

export const recordUserLogin = async (pool: Pool, userId: string) => {
  await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);
};

export const createOrganization = async (
  pool: Pool,
  name: string,
  slug?: string,
  ownerUserId?: string | null,
): Promise<OrganizationRecord> => {
  const id = uuidv4();
  const finalSlug = slug ? toSlug(slug) : toSlug(name);
  await pool.query(`INSERT INTO organizations (id, name, slug, owner_user_id) VALUES ($1, $2, $3, $4)`, [
    id,
    name,
    finalSlug,
    ownerUserId ?? null,
  ]);
  return { id, name, slug: finalSlug, ownerUserId: ownerUserId ?? null };
};

export const listOrganizations = async (pool: Pool): Promise<OrganizationRecord[]> => {
  const { rows } = await pool.query(
    `SELECT id, name, slug, owner_user_id FROM organizations ORDER BY created_at DESC`,
  );
  return rows.map(mapOrganizationRow);
};

export const listOrganizationsByUser = async (
  pool: Pool,
  userId: string,
): Promise<OrganizationRecord[]> => {
  const { rows } = await pool.query(
    `SELECT id, name, slug, owner_user_id FROM organizations WHERE owner_user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(mapOrganizationRow);
};

export const createProject = async (
  pool: Pool,
  name: string,
  organizationId: string,
  ownerUserId?: string | null,
): Promise<ProjectRecord> => {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO projects (id, name, organization_id, owner_user_id) VALUES ($1, $2, $3, $4)`,
    [id, name, organizationId, ownerUserId ?? null],
  );
  return { id, name, organizationId, ownerUserId: ownerUserId ?? null };
};

const getOrganizationById = async (pool: Pool, id: string) => {
  const { rows } = await pool.query(
    `SELECT id, name, slug, owner_user_id FROM organizations WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapOrganizationRow(rows[0]) : undefined;
};

export const findProjectById = async (pool: Pool, id: string): Promise<ProjectRecord | null> => {
  const { rows } = await pool.query(
    `SELECT id, name, organization_id, owner_user_id FROM projects WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapProjectRow(rows[0]) : null;
};

const getApiKeyById = async (pool: Pool, id: string) => {
  const { rows } = await pool.query(
    `SELECT id, project_id, key, label, created_by_user_id FROM api_keys WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapApiKeyRow(rows[0]) : undefined;
};

export const createApiKey = async (
  pool: Pool,
  projectId: string,
  label?: string,
  providedKey?: string,
  createdByUserId?: string | null,
): Promise<ApiKeyRecord> => {
  const id = uuidv4();
  const key = providedKey || generateKey();
  await pool.query(
    `INSERT INTO api_keys (id, project_id, key, label, created_by_user_id) VALUES ($1, $2, $3, $4, $5)`,
    [id, projectId, key, label ?? null, createdByUserId ?? null],
  );
  return { id, projectId, key, label, createdByUserId: createdByUserId ?? null };
};

export const findProjectByApiKey = async (
  pool: Pool,
  apiKey: string,
): Promise<ProjectRecord | null> => {
  const { rows } = await pool.query(
    `SELECT projects.id, projects.name, projects.organization_id, projects.owner_user_id
     FROM api_keys
     JOIN projects ON api_keys.project_id = projects.id
     WHERE api_keys.key = $1 AND api_keys.active = true`,
    [apiKey],
  );
  if (!rows[0]) return null;
  return mapProjectRow(rows[0]);
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

export const findWaitlistEntryByEmail = async (
  pool: Pool,
  email: string,
): Promise<WaitlistRecord | null> => {
  const { rows } = await pool.query(`SELECT * FROM waitlist WHERE email = $1`, [email]);
  return rows[0] || null;
};

export const listWaitlistEntries = async (pool: Pool): Promise<WaitlistRecord[]> => {
  const { rows } = await pool.query(`
    SELECT
      w.*,
      org.name AS organization_name,
      org.slug AS organization_slug,
      org.owner_user_id AS organization_owner_user_id,
      proj.name AS project_name,
      proj.organization_id AS project_organization_id,
      proj.owner_user_id AS project_owner_user_id,
      k.project_id AS api_key_project_id,
      k.key AS api_key_value,
      k.label AS api_key_label,
      u.id AS user_id,
      u.email AS user_email,
      u.name AS user_name,
      u.status AS user_status,
      u.password_hash AS user_password_hash
    FROM waitlist w
    LEFT JOIN organizations org ON w.organization_id = org.id
    LEFT JOIN projects proj ON w.project_id = proj.id
    LEFT JOIN api_keys k ON w.api_key_id = k.id
    LEFT JOIN users u ON w.user_id = u.id
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
    user_id: row.user_id,
    organization: row.organization_id
      ? {
          id: row.organization_id,
          name: row.organization_name,
          slug: row.organization_slug,
          ownerUserId: row.organization_owner_user_id,
        }
      : null,
    project: row.project_id
      ? {
          id: row.project_id,
          name: row.project_name,
          organizationId: row.project_organization_id || row.organization_id,
          ownerUserId: row.project_owner_user_id,
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
    user: row.user_id
      ? {
          id: row.user_id,
          email: row.user_email,
          name: row.user_name,
          status: row.user_status,
          passwordHash: row.user_password_hash,
        }
      : null,
  }));
};

const ensureUserForWaitlist = async (pool: Pool, entry: WaitlistRecord) => {
  if (entry.user_id) {
    const user = await findUserById(pool, entry.user_id);
    if (user) return user;
  }
  const existing = await findUserByEmail(pool, entry.email);
  if (existing) {
    if (existing.status !== 'approved') {
      await updateUserStatus(pool, existing.id, 'approved');
    }
    await pool.query(`UPDATE waitlist SET user_id = $2 WHERE id = $1`, [entry.id, existing.id]);
    return existing;
  }
  const created = await createUser(pool, entry.email, 'approved', entry.name, entry.id);
  await pool.query(`UPDATE waitlist SET user_id = $2 WHERE id = $1`, [entry.id, created.id]);
  return created;
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

  const user = await ensureUserForWaitlist(pool, entry);

  if (entry.status === 'approved' && entry.organization_id && entry.project_id && entry.api_key_id) {
    const [organization, project, apiKey] = await Promise.all([
      getOrganizationById(pool, entry.organization_id),
      findProjectById(pool, entry.project_id),
      getApiKeyById(pool, entry.api_key_id),
    ]);
    return { entry, organization, project, apiKey, user };
  }

  const orgName = options.organizationName || entry.name || `org-${waitlistId.slice(0, 8)}`;
  const organization = await createOrganization(pool, orgName, undefined, user.id);

  const projectName = options.projectName || `project-${waitlistId.slice(0, 6)}`;
  const project = await createProject(pool, projectName, organization.id, user.id);

  const apiKey = await createApiKey(pool, project.id, options.keyLabel ?? 'primary', undefined, user.id);

  await pool.query(
    `UPDATE waitlist
     SET status = 'approved',
         approved_at = NOW(),
         organization_id = $2,
         project_id = $3,
         api_key_id = $4,
         user_id = $5
     WHERE id = $1`,
    [waitlistId, organization.id, project.id, apiKey.id, user.id],
  );

  const updated = await pool.query(`SELECT * FROM waitlist WHERE id = $1`, [waitlistId]);

  return { entry: updated.rows[0], organization, project, apiKey, user };
};

export const listProjectsByUser = async (pool: Pool, userId: string): Promise<ProjectRecord[]> => {
  const { rows } = await pool.query(
    `SELECT id, name, organization_id, owner_user_id FROM projects WHERE owner_user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(mapProjectRow);
};

export const verifyProjectOwnership = async (
  pool: Pool,
  userId: string,
  projectId: string,
): Promise<ProjectRecord | null> => {
  const { rows } = await pool.query(
    `SELECT id, name, organization_id, owner_user_id FROM projects WHERE id = $1 AND owner_user_id = $2`,
    [projectId, userId],
  );
  if (!rows[0]) return null;
  return mapProjectRow(rows[0]);
};
