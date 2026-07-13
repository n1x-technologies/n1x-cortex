export interface Embedder {
  readonly id: string;
  readonly dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export async function createTransformersEmbedder(modelId: string, cacheDir: string): Promise<Embedder> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = cacheDir;
  env.allowLocalModels = false;
  // dtype: 'q8' matches the quantized default of the former @xenova/transformers,
  // so embeddings stay bit-identical to any store generated before this migration.
  const extractor = await pipeline('feature-extraction', modelId, { dtype: 'q8' });
  let dim = 0;
  return {
    id: modelId,
    get dim() { return dim; },
    async embed(texts: string[]): Promise<Float32Array[]> {
      const out: Float32Array[] = [];
      for (const t of texts) {
        const res = await extractor(t, { pooling: 'mean', normalize: true });
        const vec = res.data as Float32Array;
        dim = vec.length;
        out.push(Float32Array.from(vec));
      }
      return out;
    },
  };
}
