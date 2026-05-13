import type { FlueContext } from '@flue/sdk';
import * as v from 'valibot';
import {
  createWorkspace,
  getWorkspaces,
  insertDocument,
  insertEntity,
  insertRelationship,
  getGraph,
  searchEntities,
  getConnectedEntities,
  getDocumentText,
} from '../../lib/db.js';
import { embed, embedSingle } from '../../lib/embeddings.js';

export const triggers = { webhook: true };

const EntitySchema = v.object({
  name: v.string(),
  type: v.string(),
  description: v.string(),
});

const ExtractionSchema = v.object({
  entities: v.array(EntitySchema),
  relationships: v.array(
    v.object({
      source: v.string(),
      target: v.string(),
      label: v.string(),
      strength: v.number(),
    }),
  ),
});

export default async function ({ init, payload, log }: FlueContext) {
  const { mode } = payload;

  if (mode === 'create-workspace') {
    const id = await createWorkspace(payload.userId, payload.name);
    return { workspaceId: id };
  }

  if (mode === 'list-workspaces') {
    const workspaces = await getWorkspaces(payload.userId);
    return { workspaces };
  }

  if (mode === 'process') {
    return await processDocument({ init, payload, log });
  }

  if (mode === 'graph') {
    const graph = await getGraph(payload.workspaceId);
    return graph;
  }

  if (mode === 'chat') {
    return await handleChat({ init, payload, log });
  }

  return { error: 'Unknown mode. Use: create-workspace, list-workspaces, process, graph, chat' };
}

async function processDocument({ init, payload, log }: Pick<FlueContext, 'init' | 'payload' | 'log'>) {
  const { workspaceId, docName, text } = payload;

  const docId = await insertDocument(workspaceId, docName, text);
  log.info('document stored', { docId, docName });

  const harness = await init({
    model: 'google/gemini-2.5-flash',
  });
  const session = await harness.session();

  const { data: extraction } = await session.skill('extract-entities', {
    args: { documentText: text, documentName: docName },
    role: 'knowledge-architect',
    schema: ExtractionSchema,
  });

  log.info('extraction complete', {
    entities: extraction.entities.length,
    relationships: extraction.relationships.length,
  });

  const entityTexts = extraction.entities.map(
    (e) => `${e.name}: ${e.description}`,
  );
  const embeddings = await embed(entityTexts);

  const entityNameToId = new Map<string, string>();
  for (let i = 0; i < extraction.entities.length; i++) {
    const e = extraction.entities[i];
    const id = await insertEntity(
      e.name,
      e.type,
      e.description,
      docId,
      workspaceId,
      embeddings[i],
    );
    entityNameToId.set(e.name, id);
  }

  for (const rel of extraction.relationships) {
    const sourceId = entityNameToId.get(rel.source);
    const targetId = entityNameToId.get(rel.target);
    if (sourceId && targetId) {
      await insertRelationship(
        sourceId,
        targetId,
        rel.label,
        rel.strength,
        docId,
        workspaceId,
      );
    }
  }

  log.info('graph stored', { docId, entities: entityNameToId.size });

  return {
    docId,
    entitiesExtracted: extraction.entities.length,
    relationshipsExtracted: extraction.relationships.length,
  };
}

async function handleChat({ init, payload, log }: Pick<FlueContext, 'init' | 'payload' | 'log'>) {
  const { workspaceId, question } = payload;

  const questionEmbedding = await embedSingle(question);
  const relevantEntities = await searchEntities(questionEmbedding, workspaceId, 8);

  log.info('vector search results', { count: relevantEntities.length });

  const allRelationships = [];
  const allConnectedEntities = new Map<string, typeof relevantEntities[0]>();

  for (const entity of relevantEntities) {
    allConnectedEntities.set(entity.id, entity);
    const { entities: connected, relationships } = await getConnectedEntities(entity.id, 1);
    for (const r of relationships) allRelationships.push(r);
    for (const e of connected) allConnectedEntities.set(e.id, e);
  }

  const docIds = new Set(
    Array.from(allConnectedEntities.values()).map((e) => e.doc_id),
  );
  const sourceTexts: Record<string, string> = {};
  for (const docId of docIds) {
    const text = await getDocumentText(docId);
    if (text) sourceTexts[docId] = text.slice(0, 3000);
  }

  const context = {
    entities: Array.from(allConnectedEntities.values()).map((e) => ({
      name: e.name,
      type: e.type,
      description: e.description,
    })),
    relationships: allRelationships.map((r) => ({
      source: allConnectedEntities.get(r.source_id)?.name ?? r.source_id,
      target: allConnectedEntities.get(r.target_id)?.name ?? r.target_id,
      label: r.label,
      strength: r.strength,
    })),
    sourceExcerpts: Object.entries(sourceTexts).map(([docId, text]) => ({
      docId,
      excerpt: text,
    })),
  };

  const harness = await init({
    model: 'google/gemini-2.5-flash',
  });
  const session = await harness.session();

  const { text } = await session.skill('chat', {
    args: {
      question,
      context: JSON.stringify(context),
    },
    role: 'knowledge-architect',
  });

  return { answer: text, context: { entityCount: allConnectedEntities.size } };
}
