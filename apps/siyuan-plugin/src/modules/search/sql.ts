/** SiYuan's SQL-search parser normalizes the MySQL RLIKE operator to REGEXP.
 * Its read-only query endpoint accepts SQLite syntax directly. Preserve quoted
 * literals/identifiers and comments while mirroring that operator normalization. */
export function readOnlySearchProbe(query: string): string {
  const sql = query.trim().replace(/;\s*$/, "");
  const tokens =
    /'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\r\n]*|\/\*[\s\S]*?\*\/|\brlike\b/gi;
  const normalized = sql.replace(tokens, (token) => (/^rlike$/i.test(token) ? "REGEXP" : token));
  return `SELECT 1 FROM (\n${normalized}\n) LIMIT 0`;
}
