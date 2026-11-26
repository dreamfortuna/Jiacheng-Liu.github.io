// GitHub Pages serves these precompressed files as opaque bytes. Older browsers use the original assets.
export async function assetBytes(path, revision) {
  const packed = typeof DecompressionStream === 'function';
  const suffix = revision ? '?v=' + encodeURIComponent(revision) : '';
  if (packed) {
    try {
      const response = await fetch(path + '.gzbin' + suffix);
      if (!response.ok || !response.body) throw new Error('压缩资源不可用');
      return await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    } catch (error) {
      console.warn('正在回退到标准资源', path, error);
    }
  }
  const response = await fetch(path + suffix);
  if (!response.ok) throw new Error('无法读取 ' + path);
  return response.arrayBuffer();
}
