/**
 * Ambient declaration for `draco3dgltf`, which ships no type definitions.
 * Only the two factory functions assetgen uses are declared; the returned
 * encoder/decoder modules are opaque to us and handed straight to
 * `@gltf-transform`'s `NodeIO.registerDependencies`.
 */
declare module "draco3dgltf" {
  export function createEncoderModule(options?: unknown): Promise<unknown>;
  export function createDecoderModule(options?: unknown): Promise<unknown>;
  const draco3dgltf: {
    createEncoderModule: typeof createEncoderModule;
    createDecoderModule: typeof createDecoderModule;
  };
  export default draco3dgltf;
}
