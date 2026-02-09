/**
 * pannellum-js-tiles-generator
 *
 * Client-side library for converting equirectangular panorama images
 * into Pannellum-compatible multi-resolution cubic tile sets using
 * Three.js / WebGL.
 *
 * @packageDocumentation
 */

export { PannellumTiler } from './PannellumTiler';

export {
  generateConfig,
  calculateCubeResolution,
  calculateMaxLevel,
} from './config-generator';

export type {
  TilerOptions,
  ProcessConfig,
  ProcessResult,
  ProgressInfo,
  ZipResult,
  RawResult,
  StreamResult,
  StreamItem,
  Tile,
  TileMetadata,
  ResultMetadata,
  CubeFace,
} from './types';
