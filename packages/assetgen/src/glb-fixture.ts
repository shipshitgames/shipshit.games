/**
 * Dependency-free, deterministic GLB (binary glTF) builder.
 *
 * Mirrors the spirit of providers.ts' `makeSilentWav`: a tiny, valid, fully
 * deterministic binary so the `mock` provider and the unit/e2e suites can drive
 * the 3D-model pipeline (issue #20) without any network or heavy 3D toolchain.
 * No randomness and no wall-clock — same input always yields the same bytes, so
 * the asset indexer stays deterministic.
 *
 * The produced GLB carries a real indexed mesh, a one-joint skin (so it reads as
 * rigged) and a single named animation clip, which is exactly what the model
 * generator needs to exercise Draco geometry compression, animation extraction
 * and the `license.rig` record. It is valid input to both `@gltf-transform`'s
 * `NodeIO.readBinary` and this package's own `parseGltfJson` indexer.
 */

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;
const GLB_CHUNK_JSON = 0x4e4f534a; // "JSON"
const GLB_CHUNK_BIN = 0x004e4942; // "BIN\0"

// glTF accessor componentTypes.
const FLOAT = 5126;
const UNSIGNED_INT = 5125;
const UNSIGNED_SHORT = 5123;
// glTF bufferView targets.
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

/** Round a byte length up to the next 4-byte boundary (glTF chunk/accessor alignment). */
function alignTo4(n: number): number {
  return (n + 3) & ~3;
}

interface AccessorPart {
  data: Uint8Array;
  componentType: number;
  type: string;
  count: number;
  target?: number;
  min?: number[];
  max?: number[];
}

export interface MinimalGlbOptions {
  /** Name of the single animation clip embedded in the model. */
  animationName?: string;
  /** Drop the skin/animation so the model reads as static (no rig). */
  rigged?: boolean;
}

/**
 * Build a minimal but valid GLB: a unit quad mesh, optionally skinned to a single
 * joint, with one named animation clip. Returns the complete `.glb` byte buffer.
 */
export function buildMinimalGlb(options: MinimalGlbOptions = {}): Buffer {
  const animationName = options.animationName ?? "idle";
  const rigged = options.rigged ?? true;

  // Geometry shared by both rigged and static variants.
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
  const indices = new Uint32Array([0, 1, 2, 2, 1, 3]);

  const parts: AccessorPart[] = [
    { data: bytesOf(positions), componentType: FLOAT, type: "VEC3", count: 4, target: ARRAY_BUFFER, min: [0, 0, 0], max: [1, 1, 0] },
    { data: bytesOf(indices), componentType: UNSIGNED_INT, type: "SCALAR", count: 6, target: ELEMENT_ARRAY_BUFFER },
  ];

  const attributes: Record<string, number> = { POSITION: 0 };
  const nodes: Array<Record<string, unknown>> = [{ mesh: 0, name: "root" }];
  const sceneNodes = [0];
  let skins: Array<Record<string, unknown>> | undefined;
  let animations: Array<Record<string, unknown>> | undefined;

  if (rigged) {
    // One bone influencing every vertex fully (JOINTS_0 / WEIGHTS_0).
    const jointIndices = new Uint16Array(16); // 4 verts * VEC4, all zero -> joint 0
    const jointWeights = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    const inverseBind = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const jointsAccessor = parts.length;
    parts.push({ data: bytesOf(jointIndices), componentType: UNSIGNED_SHORT, type: "VEC4", count: 4, target: ARRAY_BUFFER });
    const weightsAccessor = parts.length;
    parts.push({ data: bytesOf(jointWeights), componentType: FLOAT, type: "VEC4", count: 4, target: ARRAY_BUFFER });
    const ibmAccessor = parts.length;
    parts.push({ data: bytesOf(inverseBind), componentType: FLOAT, type: "MAT4", count: 1 });
    attributes.JOINTS_0 = jointsAccessor;
    attributes.WEIGHTS_0 = weightsAccessor;

    nodes.push({ name: "joint0" });
    sceneNodes.push(1);
    skins = [{ inverseBindMatrices: ibmAccessor, joints: [1] }];
    // Bind the skin to the mesh node so the skeleton is actually used; without
    // this reference an optimize pass would `prune` the skin as dead weight.
    nodes[0]!.skin = 0;

    // A translation animation channel so animations[] reads back non-empty.
    const animInput = new Float32Array([0, 1]);
    const animOutput = new Float32Array([0, 0, 0, 0, 0.5, 0]);
    const inputAccessor = parts.length;
    parts.push({ data: bytesOf(animInput), componentType: FLOAT, type: "SCALAR", count: 2, min: [0], max: [1] });
    const outputAccessor = parts.length;
    parts.push({ data: bytesOf(animOutput), componentType: FLOAT, type: "VEC3", count: 2 });
    animations = [
      {
        name: animationName,
        samplers: [{ input: inputAccessor, output: outputAccessor, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
      },
    ];
  }

  // Lay accessors out into a single buffer with 4-byte alignment between views.
  const bufferViews: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const segments: Buffer[] = [];
  let byteOffset = 0;
  parts.forEach((part, index) => {
    const padded = alignTo4(part.data.length);
    const segment = Buffer.alloc(padded);
    Buffer.from(part.data).copy(segment);
    segments.push(segment);
    const view: Record<string, unknown> = { buffer: 0, byteOffset, byteLength: part.data.length };
    if (part.target) view.target = part.target;
    bufferViews.push(view);
    const accessor: Record<string, unknown> = { bufferView: index, componentType: part.componentType, count: part.count, type: part.type };
    if (part.min) accessor.min = part.min;
    if (part.max) accessor.max = part.max;
    accessors.push(accessor);
    byteOffset += padded;
  });
  const bin = Buffer.concat(segments);

  const gltf: Record<string, unknown> = {
    asset: { version: "2.0", generator: "assetgen-mock" },
    scene: 0,
    scenes: [{ nodes: sceneNodes }],
    nodes,
    meshes: [{ primitives: [{ attributes, indices: 1, mode: 4 }] }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };
  if (skins) gltf.skins = skins;
  if (animations) gltf.animations = animations;

  return packGlb(gltf, bin);
}

/** Concatenate accessor bytes (typed array → buffer view of its full backing range). */
function bytesOf(typed: Float32Array | Uint32Array | Uint16Array): Uint8Array {
  return new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
}

/** Wrap a glTF JSON document + binary payload into a GLB container. */
function packGlb(gltf: unknown, bin: Buffer): Buffer {
  const json = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonChunk = Buffer.alloc(alignTo4(json.length), 0x20); // pad JSON with spaces
  json.copy(jsonChunk);
  const binChunk = Buffer.alloc(alignTo4(bin.length), 0x00); // pad BIN with zeros
  bin.copy(binChunk);

  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(GLB_VERSION, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(GLB_CHUNK_JSON, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(GLB_CHUNK_BIN, 4);

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}
