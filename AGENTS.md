# DocGraph Agent

Flue-powered AI agent for document knowledge graph extraction and Agentic RAG.

## Deployment

- **App**: https://docgraph-agent.fly.dev
- **Health**: https://docgraph-agent.fly.dev/health
- **Endpoint**: POST https://docgraph-agent.fly.dev/agents/docgraph/default
- **Region**: Mumbai (bom)
- **DB**: docgraph-agent-db (Fly Postgres + pgvector, 512MB)

## Structure

```
.flue/
  agents/docgraph.ts    — Main handler (process, graph, chat, create/list workspaces)
  roles/knowledge-architect.md — Entity extraction expert role
  app.ts                — Hono server with CORS + Google provider config
.agents/
  skills/extract-entities/SKILL.md — Structured entity/relationship extraction
  skills/chat/SKILL.md             — Agentic RAG with citations
lib/
  db.ts          — PostgreSQL connection pool + all DB queries
  embeddings.ts  — Google text-embedding-004 batch API client
sql/
  schema.sql     — Full pgvector schema (workspaces, documents, entities, relationships)
```

## Secrets (Fly.io)

- `DATABASE_URL` — postgres://docgraph_agent:...@docgraph-agent-db.flycast:5432/docgraph_agent
- `GOOGLE_GENERATIVE_AI_API_KEY` — Gemini API key

## Deploy

```bash
fly deploy                    # Build + deploy to Fly.io
fly logs -a docgraph-agent    # View logs
fly ssh console -a docgraph-agent-db  # SSH into Postgres machine
```

## Test

```bash
# Health check
curl https://docgraph-agent.fly.dev/health

# List workspaces
curl -X POST https://docgraph-agent.fly.dev/agents/docgraph/default \
  -H "Content-Type: application/json" \
  -d '{"mode":"list-workspaces","userId":"test"}'

# Process a document
curl -X POST https://docgraph-agent.fly.dev/agents/docgraph/default \
  -H "Content-Type: application/json" \
  -d '{"mode":"process","workspaceId":"<uuid>","docName":"test.txt","text":"..."}'
```
