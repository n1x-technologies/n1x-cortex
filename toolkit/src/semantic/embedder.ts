export interface Embedder {
  readonly id: string;
  readonly dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export async function createTransformersEmbedder(modelId: string, cacheDir: string): Promise<Embedder> {
  const { pipeline, env } = await import('@xenova/transformers');
  env.cacheDir = cacheDir;
  env.allowLocalModels = false;
  const extractor = await pipeline('feature-extraction', modelId);
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
