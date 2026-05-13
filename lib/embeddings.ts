const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_API = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function embed(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is required');

  const response = await fetch(
    `${EMBEDDING_API}/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
        })),
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.embeddings.map((e: { values: number[] }) => e.values);
}

export async function embedSingle(text: string): Promise<number[]> {
  const [embedding] = await embed([text]);
  return embedding;
}
