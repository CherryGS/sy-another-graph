/** Synthetic developer fixture input. It is never imported by the plugin. */
export const STAGES = [1000, 5000, 10000, 25000, 50000, 100000];
export const BATCH_BLOCKS = 300;

export function fixtureId(stamp, slot) {
  if (!/^\d{14}$/.test(stamp) || !Number.isSafeInteger(slot) || slot < 0 || slot >= 36 ** 6)
    throw new Error("Invalid fixture identity input");
  return `${stamp}-s${slot.toString(36).padStart(6, "0")}`;
}

const indent = (text, count = 2) => text.split("\n").map((line) => " ".repeat(count) + line).join("\n");

/**
 * Plan one append-only document, including its implicit parent-document cost.
 * All forward targets are in this document; cross-document targets already exist.
 * SiYuan 3.8.3 does not backfill refs when a missing cross-document target appears.
 */
export function makeFixtureDocument({ stamp, batch, nativeBudget = BATCH_BLOCKS, corpusExists = true, priorAnchors = [], pilot = false }) {
  if (!Number.isInteger(batch) || batch < 0 || batch > 100000)
    throw new Error("Invalid batch number");
  const overhead = pilot ? 1 : corpusExists ? 3 : 5;
  const bodyBudget = nativeBudget - overhead;
  if (!Number.isInteger(bodyBudget) || bodyBudget < 1 || bodyBudget > 990)
    throw new Error("Document budget must leave 1–990 native body blocks");
  const records = [];
  const sources = [];
  const parts = [];
  const allocate = (type, referenced = false) => {
    const id = fixtureId(stamp, batch * 1000 + records.length + 1);
    records.push({ id, type });
    if (referenced) sources.push(id);
    return id;
  };
  const ial = (id) => `{: id="${id}" custom-atlas-stress-run="${stamp}"}`;
  const paragraph = () => {
    const id = allocate("p", true);
    return (refs) => `Repeated passage ${refs(id)}\n${ial(id)}`;
  };
  const heading = (level) => {
    const id = allocate("h", true);
    return (refs) => `${"#".repeat(level)} Repeated section ${refs(id)}\n${ial(id)}`;
  };
  const list = (depth, items = 1) => {
    const listId = allocate("l");
    const children = Array.from({ length: items }, () => {
      const item = allocate("i");
      const text = allocate("p", true);
      const nested = depth > 1 ? list(depth - 1) : null;
      return (refs) => `- ${ial(item)} Repeated list item ${refs(text)}\n  ${ial(text)}${nested ? `\n\n${indent(nested(refs))}` : ""}`;
    });
    return (refs) => `${children.map((child) => child(refs)).join("\n")}\n${ial(listId)}`;
  };
  const deep = pilot ? 6 : 12 + (batch % 4) * 4;
  let unit = 0;
  while (records.length < bodyBudget) {
    const remaining = bodyBudget - records.length;
    const kind = unit % 30;
    if (kind === 0) parts.push(heading(1 + Math.floor(unit / 30) % 6));
    else if (kind === 1) {
      const id = allocate("c");
      parts.push(() => `\`\`\`text\nSynthetic fixture: code is literal text.\n\`\`\`\n${ial(id)}`);
    } else if (kind === 2) {
      const id = allocate("m");
      parts.push(() => `$$\na^2 + b^2 = c^2\n$$\n${ial(id)}`);
    } else if (kind === 3) {
      const id = allocate("t", true);
      parts.push((refs) => `| Label | Sources |\n| --- | --- |\n| Repeated row | ${refs(id)} |\n${ial(id)}`);
    } else if (kind === 4 && remaining >= 2) {
      const id = allocate("b");
      const child = paragraph();
      parts.push((refs) => `${child(refs).split("\n").map((line) => `> ${line}`).join("\n")}\n${ial(id)}`);
    } else if (kind === 5 && remaining >= 7) parts.push(list(1, 3));
    else if (kind === 6 && remaining >= 3) {
      const id = allocate("s");
      const first = paragraph();
      const second = paragraph();
      parts.push((refs) => `{{{row\n\n${first(refs)}\n\n${second(refs)}\n\n}}}\n${ial(id)}`);
    } else if (unit === 7 && remaining >= deep * 3) parts.push(list(deep));
    else parts.push(paragraph());
    unit++;
  }

  const ids = records.map(({ id }) => id);
  const pool = [...new Set([...ids, ...priorAnchors])];
  const referenceBudget = 4 * nativeBudget;
  const references = new Map();
  for (let index = 0; index < sources.length; index++) {
    const sourceId = sources[index];
    const count = Math.floor(referenceBudget / sources.length) + (index < referenceBudget % sources.length ? 1 : 0);
    if (count > pool.length) throw new Error("The requested reference density needs more existing targets");
    const selected = new Set();
    const add = (id) => { if (id && selected.size < count) selected.add(id); };
    if (index % 11 === 0) add(sourceId);
    add(sources[(index + 1) % sources.length]);
    add(sources[(index + sources.length - 1) % sources.length]);
    if (priorAnchors.length) {
      add(priorAnchors[0]);
      add(priorAnchors[(batch * 17 + index * 13) % priorAnchors.length]);
    }
    // Deterministic, bounded fallback fills distinct targets without retries.
    const offset = (Math.imul(batch + 1, 104729) + Math.imul(index + 1, 8191)) >>> 0;
    for (let step = 0; selected.size < count && step < pool.length; step++)
      add(pool[(offset + step) % pool.length]);
    references.set(sourceId, [...selected]);
  }
  const refs = (id) => references.get(id).map((target) => `((${target} "source"))`).join(" ");
  const markdown = parts.map((part) => part(refs)).join("\n\n");
  const typeCounts = {};
  for (const { type } of records) typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  return {
    batch,
    path: pilot ? "/Generator Pilot" : `/Corpus/Batch ${String(batch).padStart(5, "0")}/Repeated note`,
    markdown,
    ownedIds: ids,
    referenceSources: Object.fromEntries(references),
    anchors: sources.filter((_, index) => index % Math.max(1, Math.floor(sources.length / 6)) === 0).slice(0, 6),
    expectedNativeBlocks: nativeBudget,
    expectedDocumentBlocks: records.length + 1,
    expectedReferences: referenceBudget,
    markdownBytes: Buffer.byteLength(markdown),
    typeCounts,
    deepListLevels: unit > 7 && bodyBudget >= 16 + deep * 3 ? deep : 0,
  };
}

export function planStages({ stamp = "20260909000000", existingBlocks = 0, nextBatch = 0, priorAnchors = [], corpusExists = false } = {}) {
  const results = [];
  let blocks = existingBlocks;
  let references = 0;
  let bytes = 0;
  let documents = 0;
  let batch = nextBatch;
  const anchors = [...priorAnchors];
  for (const target of STAGES) {
    while (blocks < target) {
      const remaining = target - blocks;
      const minimum = corpusExists ? 4 : 6;
      const nativeBudget = Math.max(minimum, Math.min(BATCH_BLOCKS, remaining));
      const document = makeFixtureDocument({ stamp, batch, nativeBudget, corpusExists, priorAnchors: anchors });
      blocks += document.expectedNativeBlocks;
      references += document.expectedReferences;
      bytes += document.markdownBytes;
      documents++;
      batch++;
      corpusExists = true;
      anchors.push(...document.anchors);
    }
    results.push({ target, fixtureBlocks: blocks, addedReferences: references, createRequests: documents, markdownMiB: Number((bytes / 1024 / 1024).toFixed(2)) });
  }
  return results;
}
