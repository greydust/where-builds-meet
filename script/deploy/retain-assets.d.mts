/**
 * The deploy script runs from plain Node in the release workflow, so it stays a
 * `.mjs`. This states what it takes and what it reports, for the spec that
 * exercises the retention rules.
 */
export type RetainAssetsInput = { dist: string; previous: string; site: string; now?: number }

export type RetainAssetsResult = {
  /** Assets from the previous deployment kept this run. */
  retained: string[]
  /** Assets dropped because they are past the retention window. */
  expired: string[]
}

export declare function retainAssets(input: RetainAssetsInput): Promise<RetainAssetsResult>
