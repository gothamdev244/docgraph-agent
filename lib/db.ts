import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export interface Entity {
  id: string;
  name: string;
  type: string;
  description: string | null;
  doc_id: string;
  workspace_id: string;
}

export interface Relationship {
  id: string;
  source_id: string;
  target_id: string;
  label: string;
  strength: number;
  doc_id: string;
  workspace_id: string;
}

export interface GraphData {
  nodes: Entity[];
  edges: Relationship[];
}

export async function createWorkspace(userId: string, name: string): Promise<string> {
  const { rows } = await pool.query(
    'INSERT INTO workspaces (user_id, name) VALUES ($1, $2) RETURNING id',
    [userId, name],
  );
  return rows[0].id;
}

export async function getWorkspaces(userId: string) {
  const { rows } = await pool.query(
    `SELECT w.id, w.name, w.created_at,
       (SELECT count(*) FROM documents d WHERE d.workspace_id = w.id) AS doc_count,
       (SELECT count(*) FROM entities e WHERE e.workspace_id = w.id) AS entity_count
     FROM workspaces w WHERE w.user_id = $1 ORDER BY w.created_at DESC`,
    [userId],
  );
  return rows;
}

export async function insertDocument(
  workspaceId: string,
  name: string,
  rawText: string,
): Promise<string> {
  const { rows } = await pool.query(
    'INSERT INTO documents (workspace_id, name, raw_text) VALUES ($1, $2, $3) RETURNING id',
    [workspaceId, name, rawText],
  );
  return rows[0].id;
}

export async function insertEntity(
  name: string,
  type: string,
  description: string | null,
  docId: string,
  workspaceId: string,
  embedding: number[],
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO entities (name, type, description, doc_id, workspace_id, embedding)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [name, type, description, docId, workspaceId, JSON.stringify(embedding)],
  );
  return rows[0].id;
}

export async function insertRelationship(
  sourceId: string,
  targetId: string,
  label: string,
  strength: number,
  docId: string,
  workspaceId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO relationships (source_id, target_id, label, strength, doc_id, workspace_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sourceId, targetId, label, strength, docId, workspaceId],
  );
}

export async function getGraph(workspaceId: string): Promise<GraphData> {
  const [entities, relationships] = await Promise.all([
    pool.query(
      'SELECT id, name, type, description, doc_id, workspace_id FROM entities WHERE workspace_id = $1',
      [workspaceId],
    ),
    pool.query(
      'SELECT id, source_id, target_id, label, strength, doc_id, workspace_id FROM relationships WHERE workspace_id = $1',
      [workspaceId],
    ),
  ]);
  return { nodes: entities.rows, edges: relationships.rows };
}

export async function searchEntities(
  embedding: number[],
  workspaceId: string,
  limit = 10,
): Promise<Entity[]> {
  const { rows } = await pool.query(
    `SELECT id, name, type, description, doc_id, workspace_id,
       1 - (embedding <=> $1::vector) AS similarity
     FROM entities
     WHERE workspace_id = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(embedding), workspaceId, limit],
  );
  return rows;
}

export async function getConnectedEntities(
  entityId: string,
  hops = 2,
): Promise<{ entities: Entity[]; relationships: Relationship[] }> {
  const { rows } = await pool.query(
    `WITH RECURSIVE traversal AS (
       SELECT source_id, target_id, label, strength, doc_id, workspace_id, id, 1 AS depth
       FROM relationships WHERE source_id = $1 OR target_id = $1
       UNION
       SELECT r.source_id, r.target_id, r.label, r.strength, r.doc_id, r.workspace_id, r.id, t.depth + 1
       FROM relationships r
       JOIN traversal t ON (r.source_id = t.target_id OR r.source_id = t.source_id
         OR r.target_id = t.source_id OR r.target_id = t.target_id)
       WHERE t.depth < $2 AND r.id != t.id
     )
     SELECT DISTINCT * FROM traversal`,
    [entityId, hops],
  );

  const entityIds = new Set<string>();
  for (const r of rows) {
    entityIds.add(r.source_id);
    entityIds.add(r.target_id);
  }

  if (entityIds.size === 0) {
    return { entities: [], relationships: [] };
  }

  const { rows: entities } = await pool.query(
    'SELECT id, name, type, description, doc_id, workspace_id FROM entities WHERE id = ANY($1)',
    [Array.from(entityIds)],
  );

  return { entities, relationships: rows };
}

export async function getDocumentText(docId: string): Promise<string | null> {
  const { rows } = await pool.query('SELECT raw_text FROM documents WHERE id = $1', [docId]);
  return rows[0]?.raw_text ?? null;
}
