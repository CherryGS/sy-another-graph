export interface CommunityRequest {
  nodes: number;
  endpoints: Uint32Array;
  resolution: number;
}

export type CommunityResponse =
  { membership: Uint32Array; calculationMs: number } | { error: string };
