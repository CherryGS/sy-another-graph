/** Source membership is resolved before any display representation. */
export interface ScopeSpec {
  notebook: string;
  scopeId: string;
  includeChildDocuments: boolean;
  excludeIds: string[];
}

export interface ProjectionSpec {
  /** Positive rule: new, unknown non-document types remain hidden too. */
  documentsOnly: boolean;
  hiddenTypes: string[];
}

export interface NativeRelationSpec {
  references: boolean;
  hierarchy: boolean;
  databases: boolean;
}

export type GraphProjectionRules = ScopeSpec & ProjectionSpec & NativeRelationSpec;

export const DEFAULT_PROJECTION_RULES: GraphProjectionRules = {
  notebook: "",
  scopeId: "",
  includeChildDocuments: true,
  excludeIds: [],
  documentsOnly: true,
  hiddenTypes: [],
  references: true,
  hierarchy: false,
  databases: true,
};
