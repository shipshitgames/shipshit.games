/**
 * Minimal typed view of the LDtk project JSON (https://ldtk.io/json/) that the
 * engine loader reads. Intentionally a SUBSET — only the fields the loader
 * consumes are typed; unknown fields pass through untouched. Pinned to the
 * LDtk 1.5 layout (see `SUPPORTED_LDTK_VERSION` in ./ldtk).
 *
 * deepnight/ldtk is MIT; this is our own structural reading of its export, not
 * a vendored copy of the schema.
 */

/** Root of an `.ldtk` project file. */
export interface LdtkRoot {
  /** LDtk app version that wrote the file, e.g. `"1.5.3"`. */
  jsonVersion: string
  defaultGridSize?: number
  defs?: LdtkDefs
  levels: LdtkLevel[]
}

export interface LdtkDefs {
  layers?: LdtkLayerDef[]
  tilesets?: LdtkTilesetDef[]
}

export interface LdtkLayerDef {
  uid: number
  identifier: string
  /** `'IntGrid' | 'Entities' | 'Tiles' | 'AutoLayer'`. */
  type: string
  gridSize?: number
  intGridValues?: LdtkIntGridValueDef[]
}

export interface LdtkIntGridValueDef {
  value: number
  identifier?: string | null
  color?: string
}

export interface LdtkTilesetDef {
  uid: number
  identifier: string
  relPath?: string | null
  pxWid?: number
  pxHei?: number
  tileGridSize?: number
}

export interface LdtkLevel {
  identifier: string
  iid?: string
  uid?: number
  /** Level width/height in pixels. */
  pxWid: number
  pxHei: number
  worldX?: number
  worldY?: number
  /** Hex background colour, e.g. `"#1a1414"`. */
  bgColor?: string
  __bgColor?: string
  /** Render order: index 0 is the top-most layer. May be null in separate-level mode. */
  layerInstances?: LdtkLayerInstance[] | null
  fieldInstances?: LdtkFieldInstance[]
}

export interface LdtkLayerInstance {
  __identifier: string
  /** `'IntGrid' | 'Entities' | 'Tiles' | 'AutoLayer'`. */
  __type: string
  /** Grid width/height in cells. */
  __cWid: number
  __cHei: number
  /** Cell size in pixels. */
  __gridSize: number
  __tilesetDefUid?: number | null
  __tilesetRelPath?: string | null
  layerDefUid?: number
  /** Row-major IntGrid values; `0` is empty, `>0` is a value id. */
  intGridCsv?: number[]
  /** Tiles painted by auto-rules (IntGrid+AutoLayer / AutoLayer). */
  autoLayerTiles?: LdtkTileInstance[]
  /** Hand-painted tiles (Tiles layers). */
  gridTiles?: LdtkTileInstance[]
  entityInstances?: LdtkEntityInstance[]
  __pxTotalOffsetX?: number
  __pxTotalOffsetY?: number
}

export interface LdtkTileInstance {
  /** `[pixelX, pixelY]` in layer space. */
  px: [number, number]
  /** `[pixelX, pixelY]` in the tileset image. */
  src: [number, number]
  /** Flip bits: bit 0 = X, bit 1 = Y. */
  f: number
  /** Tile id within the tileset. */
  t: number
  /** Alpha (0..1). */
  a?: number
}

export interface LdtkEntityInstance {
  __identifier: string
  /** `[cellX, cellY]` grid position. */
  __grid: [number, number]
  __pivot?: [number, number]
  __tags?: string[]
  /** Footprint in pixels. */
  width: number
  height: number
  /** `[pixelX, pixelY]` of the entity's pivot in layer space. */
  px: [number, number]
  iid?: string
  defUid?: number
  fieldInstances?: LdtkFieldInstance[]
}

export interface LdtkFieldInstance {
  __identifier: string
  __type?: string
  __value: unknown
  defUid?: number
}
