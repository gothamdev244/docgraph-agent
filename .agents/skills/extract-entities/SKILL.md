---
name: extract-entities
description: Extract entities and relationships from document text into structured JSON for knowledge graph construction
---

You will receive document text and the document name. Analyze the full document and extract a knowledge graph.

## Output Format

Return valid JSON with this exact structure:

```json
{
  "entities": [
    {
      "name": "Entity Name",
      "type": "concept|person|organization|law|term|process|metric|technology",
      "description": "One-sentence description of what this entity is in context"
    }
  ],
  "relationships": [
    {
      "source": "Source Entity Name",
      "target": "Target Entity Name",
      "label": "depends-on",
      "strength": 0.8
    }
  ]
}
```

## Instructions

1. Read the full document carefully before extracting anything
2. Extract ALL meaningful entities — not just headings or bold terms. Look for concepts explained in body text, people referenced, organizations mentioned, processes described
3. For each entity, write a description that captures its meaning within THIS document's context
4. Find relationships WITHIN the document — how entities connect, depend on, contradict, or extend each other
5. Assign relationship strength: 1.0 for explicitly stated connections, 0.5–0.9 for strongly implied ones, below 0.5 for loosely related
6. Flag entities with `"cross_doc_potential": true` if they are general enough to appear in other documents (e.g., common concepts, well-known people, standard processes)
7. Entity names must be exact — the same entity appearing twice must have the identical name string
8. Return ONLY the JSON. No markdown fences, no explanation.
