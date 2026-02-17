declare module "../../../tools/playerDerivedHelpers" {
  export const deriveForPlayer: (latest: any, makeServerTimestamp?: () => any) => any;
  export const computeBaseStats: (values: Record<string, any>) => any;
  export const buildPlayerDerivedSnapshotEntry: (input: any) => any;
  export const readDerivedScanSec: (
    entry: Record<string, any>,
  ) => { sec: number | null; field: string | null };
  export const withDerivedScanSec: <T extends Record<string, any>>(
    entry: T,
    sec: number | null,
    field?: string | null,
  ) => T;
}
