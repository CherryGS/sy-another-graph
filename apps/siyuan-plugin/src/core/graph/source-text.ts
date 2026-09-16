/** Native source material, separate from rendered and exported graph-node facts. */
export interface SourceTextBlock {
  id: string;
  rootId: string;
  type: string;
  title: string;
  ial: string;
  markdown: string | null;
}
