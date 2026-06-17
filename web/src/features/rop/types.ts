/**
 * ROP-optimization feature types. The canonical shapes live in @drilliq/shared
 * (the API/web contract). We re-export them here as the feature's local surface
 * so view components import from one place.
 */
export type {
  RopPoint,
  RopData,
  RopOptimizationFilters,
} from '@drilliq/shared';

/** Distinct option lists for the sidebar filters (GET …/options). */
export interface RopOptions {
  wells: { id: string; name: string }[];
  holeSizes: string[];
  bitFamilies: ('TCI' | 'MILLED_TOOTH' | 'PDC' | 'DIAMOND' | 'OTHER')[];
  mudTypes: { id: string; name: string }[];
}

/** The view selected in the top-right toggle. */
export type RopView =
  | 'summary'
  | 'contour'
  | 'mse'
  | 'hydraulics'
  | 'economics'
  | 'scatter'
  | 'bysize'
  | 'table';
