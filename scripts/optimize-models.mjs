// Shrinks the character models before they are committed: npm run models
// Drops the attributes the game never reads, shares duplicated data, then quantizes and
// meshopt-compresses the geometry (the game decodes it with three's MeshoptDecoder).
// Safe to run again on files it already processed.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The characters only: the small scenery props are reshaped in the game and stay plain.
const DIR = 'models';
const KEEP = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']);

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

for (const file of readdirSync(DIR).filter(f => f.endsWith('.glb'))) {
  const path = join(DIR, file);
  const before = statSync(path).size;
  const document = await io.read(path);
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) {
        if (!KEEP.has(semantic)) primitive.setAttribute(semantic, null);
      }
    }
  }
  await document.transform(
    dedup(),
    prune(),
    reorder({ encoder: MeshoptEncoder }),
    // Positions stay float: quantizing them splits the skin and skews skinned normals.
    quantize({ pattern: /^(NORMAL|TEXCOORD|JOINTS|WEIGHTS)/, quantizeNormal: 10, quantizeTexcoord: 12 }),
  );
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(path, document);
  console.log(file, `${(before / 1024).toFixed(0)} KB → ${(statSync(path).size / 1024).toFixed(0)} KB`);
}
