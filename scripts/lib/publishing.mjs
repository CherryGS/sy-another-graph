import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { validateMarketplaceManifest } from "./marketplace.mjs";

const versionFiles = ["apps/siyuan-plugin/package.json", "apps/siyuan-plugin/public/plugin.json"];
const kinds = ["patch", "minor", "major"];

function versionParts(version) {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "版本号必须是稳定版本，例如 0.1.0");
  return version.split(".").map(BigInt);
}

export function bumpVersion(version, kind) {
  assert.ok(kinds.includes(kind), "请选择 patch、minor 或 major");
  const [major, minor, patch] = versionParts(version);
  return kind === "major" ? `${major + 1n}.0.0`
    : kind === "minor" ? `${major}.${minor + 1n}.0` : `${major}.${minor}.${patch + 1n}`;
}

function newerThan(version, previous) {
  const left = versionParts(version), right = versionParts(previous);
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}

export function planRelease(root, kind) {
  root = resolve(root);
  const files = versionFiles.map(path => {
    const absolute = join(root, path), stat = lstatSync(absolute);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, `版本文件必须是普通文件：${path}`);
    const location = relative(realpathSync(root), realpathSync(absolute));
    assert.ok(!isAbsolute(location) && !location.startsWith(".."), `版本文件必须位于当前仓库内：${path}`);
    const before = readFileSync(absolute, "utf8");
    return { path, absolute, before, json: JSON.parse(before) };
  });
  const [pkg, manifest] = files.map(file => file.json);
  validateMarketplaceManifest(manifest, pkg);
  const version = bumpVersion(manifest.version, kind);
  for (const file of files) {
    const pattern = /^(\s*"version"\s*:\s*")[^"]*(")/gm;
    assert.equal([...file.before.matchAll(pattern)].length, 1, `无法唯一定位版本字段：${file.path}`);
    file.after = file.before.replace(pattern, (_match, prefix, suffix) => `${prefix}${version}${suffix}`);
    assert.deepEqual(JSON.parse(file.after), { ...file.json, version });
  }
  return { root, files, version, currentVersion: manifest.version, tag: `v${version}`,
    repository: new URL(manifest.url).pathname.slice(1),
    name: (manifest.displayName["zh-CN"] || manifest.displayName.default).replace(/\s+/g, " ").trim() };
}

/** Argument arrays avoid shell interpolation, including Windows pnpm.cmd quoting. */
export function commandRunner(root, pnpm = process.env.npm_execpath) {
  return (command, args, { capture = false } = {}) => {
    let executable = command, parameters = args;
    if (command === "pnpm") {
      assert.ok(pnpm, "请通过 pnpm publish:plugin 启动发布脚本");
      executable = process.execPath;
      parameters = [pnpm, ...args];
    }
    const result = spawnSync(executable, parameters, { cwd: root, encoding: "utf8", windowsHide: true,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    if (result.error) throw new Error(`无法运行 ${command}：${result.error.message}`, { cause: result.error });
    if (result.status !== 0) {
      const error = new Error(`${command} ${args.join(" ")} 执行失败${result.stderr ? `\n${result.stderr.trim()}` : ""}`);
      error.stderr = result.stderr || "";
      throw error;
    }
    return (result.stdout || "").trim();
  };
}

function github(run, path, optional = false) {
  try { return JSON.parse(run("gh", ["api", path], { capture: true })); }
  catch (error) {
    if (optional && /\bHTTP 404\b/.test(error.stderr || "")) return null;
    throw error;
  }
}

function remoteRepository(url) {
  const match = url.match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+\/[^/\s]+?)\/?$/);
  return match?.[1].replace(/\.git$/, "").toLowerCase();
}

function preflight(plan, run) {
  const git = (...args) => run("git", args, { capture: true });
  assert.equal(git("status", "--porcelain"), "", "请先提交工作区改动，再发布新版本");
  git("ls-files", "--error-unmatch", "--", ...versionFiles);
  const branch = git("symbolic-ref", "--quiet", "--short", "HEAD");
  for (const args of [["remote", "get-url", "--all", "origin"], ["remote", "get-url", "--push", "--all", "origin"]]) {
    assert.equal(remoteRepository(git(...args)), plan.repository.toLowerCase(), "origin 地址必须与 plugin.json 的 GitHub 仓库一致，且只有一个推送目标");
  }
  const repo = github(run, `repos/${plan.repository}`);
  assert.equal(repo.full_name.toLowerCase(), plan.repository.toLowerCase(), "GitHub 仓库身份不一致");
  assert.ok(!repo.private && !repo.archived && repo.permissions?.push, "需要一个可推送的公开 GitHub 仓库；请检查 gh 登录及仓库权限");
  assert.equal(branch, repo.default_branch, `请在默认分支 ${repo.default_branch} 上发布`);
  run("git", ["fetch", "origin", "--tags"]);
  const [behind, ahead] = git("rev-list", "--left-right", "--count", `origin/${branch}...HEAD`).split(/\s+/).map(Number);
  assert.equal(behind, 0, "远端包含本地没有的提交，请先同步后再发布");
  assert.equal(git("tag", "--list", plan.tag), "", `标签 ${plan.tag} 已存在，请检查之前的发布结果`);
  assert.equal(git("ls-remote", "--tags", "origin", `refs/tags/${plan.tag}`), "", `远端标签 ${plan.tag} 已存在`);
  const latest = github(run, `repos/${plan.repository}/releases/latest`, true);
  if (latest) {
    assert.match(latest.tag_name, /^v\d+\.\d+\.\d+$/, "现有 Latest Release 标签无法识别为稳定版本");
    assert.ok(newerThan(plan.version, latest.tag_name.slice(1)), "新版本必须高于 GitHub Latest Release");
    git("merge-base", "--is-ancestor", `refs/tags/${latest.tag_name}`, "HEAD");
  }
  return { branch, head: git("rev-parse", "HEAD"), latest, ahead };
}

function assertPrepared(plan, context, run) {
  assert.equal(run("git", ["rev-parse", "HEAD"], { capture: true }), context.head, "检查期间 HEAD 已变化，请重新准备发布");
  assert.equal(run("git", ["diff", "--cached", "--name-only"], { capture: true }), "", "检查期间暂存区已变化，请先处理暂存区");
  const changed = run("git", ["status", "--porcelain"], { capture: true }).split("\n").map(line => line.trim()).sort();
  assert.deepEqual(changed, versionFiles.map(path => `M ${path}`).sort(), "检查期间存在额外改动，请重新准备发布");
  for (const file of plan.files) assert.equal(readFileSync(file.absolute, "utf8"), file.after, `版本文件在检查期间发生变化：${file.path}`);
}

function releaseNotes(plan, context, run, notesFile) {
  if (notesFile) {
    const content = readFileSync(resolve(plan.root, notesFile), "utf8").trim();
    assert.ok(content, "更新说明文件不能为空");
    return `${content}\n`;
  }
  const range = context.latest ? `${context.latest.tag_name}..HEAD` : "HEAD";
  const subjects = run("git", ["log", "--reverse", "--format=%s", range], { capture: true }).split("\n").filter(Boolean);
  const escape = text => text.replace(/[\\`*_{}\[\]<>]/g, "\\$&").replace(/@/g, "@\u200b");
  return [`${plan.name} ${plan.version}`, "", "更新内容：", "",
    ...(subjects.length ? subjects.map(subject => `- ${escape(subject)}`) : ["- 版本更新。"]),
    ...(context.latest ? ["", `[完整变更](https://github.com/${plan.repository}/compare/${context.latest.tag_name}...${plan.tag})`] : []), ""].join("\n");
}

export async function publishPlugin(plan, { run = commandRunner(plan.root), confirm, log = console.log, notesFile } = {}) {
  const context = preflight(plan, run);
  const notes = releaseNotes(plan, context, run, notesFile);
  const git = (...args) => run("git", args, { capture: true });
  let committed = false, staged = false, recovery;
  try {
    for (const file of plan.files) assert.equal(readFileSync(file.absolute, "utf8"), file.before, `准备期间版本文件发生变化：${file.path}`);
    for (const file of plan.files) writeFileSync(file.absolute, file.after);
    run("pnpm", ["check"]);
    run("pnpm", ["package:artifacts", "--tag", plan.tag]);
    assertPrepared(plan, context, run);
    const archive = join(plan.root, "apps/siyuan-plugin/dist/package.zip");
    const bytes = readFileSync(archive);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const directory = resolve(plan.root, git("rev-parse", "--git-path", "plugin-releases"));
    mkdirSync(directory, { recursive: true });
    recovery = mkdtempSync(join(directory, `${plan.tag}-`));
    const asset = join(recovery, "package.zip"), notesPath = join(recovery, "release-notes.md");
    copyFileSync(archive, asset);
    writeFileSync(notesPath, notes);
    log(`\n准备完成：${plan.currentVersion} → ${plan.version}\n仓库：${plan.repository}\n分支：${context.branch}（本地领先 ${context.ahead} 个提交）\n标签：${plan.tag}\n安装包：${asset}\n大小：${bytes.length} 字节\nSHA-256：${sha256}\n\n${notes}`);
    if (!await confirm({ ...plan, asset, notesPath, sha256, notes, branch: context.branch })) {
      log("已取消发布，恢复脚本写入的版本内容，保留外部改动。准备的安装包和说明仍保留供查看。");
      return { cancelled: true };
    }
    assertPrepared(plan, context, run);
    assert.equal(createHash("sha256").update(readFileSync(asset)).digest("hex"), sha256, "待上传的安装包发生变化");
    assert.equal(readFileSync(notesPath, "utf8"), notes, "更新说明发生变化，请重新准备发布");
    run("git", ["add", "--", ...versionFiles]);
    staged = true;
    run("git", ["commit", "-m", `🔧 chore(release): ${plan.tag}`]);
    committed = true;
    const releaseHead = git("rev-parse", "HEAD");
    assert.equal(git("rev-parse", `${releaseHead}^`), context.head, "版本提交的父提交发生变化，停止推送");
    assert.deepEqual(git("diff-tree", "--no-commit-id", "--name-only", "-r", releaseHead).split("\n").sort(),
      [...versionFiles].sort(), "版本提交包含了额外文件，停止推送");
    assert.equal(git("status", "--porcelain"), "", "版本提交后工作区仍有改动，停止推送");
    for (const file of plan.files) assert.equal(readFileSync(file.absolute, "utf8"), file.after, "提交钩子修改了版本文件，停止推送");
    run("git", ["tag", "-a", plan.tag, releaseHead, "-m", `${plan.name} ${plan.version}`]);
    run("git", ["push", "--atomic", "origin", `${releaseHead}:refs/heads/${context.branch}`, `refs/tags/${plan.tag}`]);
    run("gh", ["release", "create", plan.tag, asset, "--repo", plan.repository, "--verify-tag",
      "--title", `${plan.tag} · ${plan.name}`, "--notes-file", notesPath, "--latest"]);
    const published = github(run, `repos/${plan.repository}/releases/latest`);
    assert.ok(published.tag_name === plan.tag && !published.draft && !published.prerelease, "GitHub Latest Release 状态与目标版本不一致");
    const attachment = published.assets?.find(item => item.name === "package.zip");
    assert.ok(attachment?.state === "uploaded" && attachment.size === bytes.length, "GitHub 安装包尚未完整上传");
    if (attachment.digest) assert.equal(attachment.digest, `sha256:${sha256}`, "GitHub 安装包摘要不匹配");
    log(`发布成功：${published.html_url}`);
    return { version: plan.version, url: published.html_url, sha256, recovery };
  } catch (error) {
    if (committed || git("rev-parse", "HEAD") !== context.head) {
      error.message += `\n版本提交已保留。请先检查标签和 GitHub Release，不要直接再次递增版本。\n恢复资料：${recovery || "尚未生成"}\n处理步骤：scripts/marketplace-release.md`;
    }
    throw error;
  } finally {
    if (!committed && git("rev-parse", "HEAD") === context.head) {
      for (const file of plan.files) {
        if (staged && git("show", `:${file.path}`).replaceAll("\r\n", "\n").trim() === file.after.replaceAll("\r\n", "\n").trim())
          run("git", ["restore", "--staged", "--", file.path]);
        try {
          if (readFileSync(file.absolute, "utf8") === file.after) writeFileSync(file.absolute, file.before);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
    }
  }
}

async function question(prompt) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const abort = new AbortController();
  terminal.on("SIGINT", () => abort.abort(new Error("已取消发布")));
  terminal.on("close", () => abort.abort(new Error("输入已结束")));
  try { return await terminal.question(prompt, { signal: abort.signal }); }
  finally { terminal.close(); }
}

export async function runPublishCli(root, args) {
  const { values } = parseArgs({ args, options: {
    bump: { type: "string" }, notes: { type: "string" },
    "dry-run": { type: "boolean" }, yes: { type: "boolean", short: "y" }, help: { type: "boolean", short: "h" },
  } });
  if (values.help) {
    console.log("用法：pnpm publish:plugin [--bump patch|minor|major] [--notes 文件] [--dry-run] [--yes]\n默认交互选择版本；检查打包后确认，再提交、推送并创建 Latest Release。\n--dry-run 仅预览，不修改文件或访问远端。--yes 跳过最后的发布确认。");
    return;
  }
  let kind = values.bump;
  if (!kind) {
    assert.ok(process.stdin.isTTY, "非交互终端请指定 --bump patch|minor|major，并使用 --dry-run 或 --yes");
    const current = JSON.parse(readFileSync(join(root, versionFiles[0]), "utf8")).version;
    console.log(`当前版本：${current}\n1. 补丁版本 → ${bumpVersion(current, "patch")}（修复、小幅改进）\n2. 次版本   → ${bumpVersion(current, "minor")}（新增功能）\n3. 主版本   → ${bumpVersion(current, "major")}（不兼容改动）\n0. 取消`);
    const choice = (await question("选择升级类型 [1]：")).trim() || "1";
    if (choice === "0") return;
    kind = { 1: "patch", 2: "minor", 3: "major" }[choice] || choice;
  }
  const plan = planRelease(root, kind);
  if (values["dry-run"]) {
    console.log(`预演：${plan.currentVersion} → ${plan.version}\n仓库：${plan.repository}\n标签：${plan.tag}\n同步两个版本文件 → pnpm check → 打包 package.zip → 审阅更新说明 → 版本提交 → 原子推送分支和标签 → GitHub Latest Release\n未修改文件或访问远端。正式发布时会检查工作区、分支、登录权限和远端版本。`);
    return;
  }
  assert.ok(values.yes || process.stdin.isTTY, "非交互发布需要明确指定 --yes；预览请使用 --dry-run");
  return publishPlugin(plan, { notesFile: values.notes,
    confirm: async () => values.yes || /^(y|yes)$/i.test((await question(`确认发布 ${plan.tag} 到 ${plan.repository}？[y/N]：`)).trim()),
  });
}
