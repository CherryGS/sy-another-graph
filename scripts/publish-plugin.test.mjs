import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  bumpVersion,
  commandRunner,
  planRelease,
  publishPlugin,
  runPublishCli,
} from "./lib/publishing.mjs";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));

function fixture(t, options = {}) {
  const temporaryRoot = realpathSync(tmpdir());
  const temporary = mkdtempSync(join(temporaryRoot, "atlas-publish-"));
  t.after(() => {
    assert.equal(dirname(resolve(temporary)), temporaryRoot);
    assert.ok(temporary.startsWith(join(temporaryRoot, "atlas-publish-")));
    rmSync(temporary, { recursive: true, force: true });
  });
  const root = join(temporary, "work"),
    remote = join(temporary, "remote.git");
  mkdirSync(root);
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "--bare", "--initial-branch=master", remote);
  git("init", "--initial-branch=master");
  git("config", "user.name", "Release Test");
  git("config", "user.email", "release@example.test");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  git("config", "core.autocrlf", options.crlf ? "true" : "false");
  git("config", "core.hooksPath", join(temporary, "no-hooks"));
  const packagePath = join(root, "apps/siyuan-plugin/package.json");
  const manifestPath = join(root, "apps/siyuan-plugin/public/plugin.json");
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(
    packagePath,
    JSON.stringify({ name: "example", version: "0.1.0", private: true }, null, 2) + "\n",
  );
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        name: "example",
        version: "0.1.0",
        author: "Owner",
        url: "https://github.com/Owner/example",
        minAppVersion: "3.8.3",
        displayName: { default: "测试图谱" },
        description: { default: "Test" },
        readme: { default: "README.md" },
      },
      null,
      2,
    ) + "\n",
  );
  if (options.crlf) {
    writeFileSync(join(root, ".gitattributes"), "*.json text eol=crlf\n");
    for (const path of [packagePath, manifestPath])
      writeFileSync(path, readFileSync(path, "utf8").replaceAll("\n", "\r\n"));
  }
  writeFileSync(join(root, ".gitignore"), "dist/\n");
  writeFileSync(join(root, "source.txt"), "baseline\n");
  git("add", ".");
  git("commit", "-m", "initial");
  git("tag", "-a", "v0.1.0", "-m", "baseline");
  git("remote", "add", "origin", remote);
  git("push", "-u", "origin", "master", "refs/tags/v0.1.0");
  writeFileSync(join(root, "source.txt"), "feature\n");
  git("commit", "-am", "feat: improve graph & labels");
  const head = git("rev-parse", "HEAD"),
    remoteHead = git("rev-parse", "origin/master");
  const commands = [],
    messages = [];
  let published;
  const realRun = commandRunner(root);
  const run = (program, args, settings) => {
    commands.push([program, ...args]);
    if (program === "git") {
      if (args[0] === "remote" && args[1] === "get-url")
        return options.wrongRemote
          ? "https://github.com/Other/example"
          : "git@github.com:Owner/example.git";
      if (args[0] === "commit" && options.failCommit) throw new Error("commit hook failed");
      if (args[0] === "commit") options.beforeCommit?.({ root, git });
      return realRun(program, args, { ...settings, capture: true });
    }
    if (program === "pnpm") {
      if (args[0] === "check") {
        options.duringCheck?.({ root, manifestPath, packagePath });
        if (options.failCheck) throw new Error("build failed");
      } else {
        assert.deepEqual(args, ["package:artifacts", "--tag", `v${json(packagePath).version}`]);
        const path = join(root, "apps/siyuan-plugin/dist/package.zip");
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `validated package ${json(packagePath).version}`);
      }
      return "";
    }
    assert.equal(program, "gh");
    if (args[0] === "api") {
      if (args[1] === "repos/Owner/example") {
        if (options.failAuth) throw new Error("GitHub authentication failed");
        return JSON.stringify({
          full_name: "Owner/example",
          default_branch: "master",
          private: false,
          archived: false,
          permissions: { push: true },
        });
      }
      assert.equal(args[1], "repos/Owner/example/releases/latest");
      return JSON.stringify(published || { tag_name: options.latestTag || "v0.1.0" });
    }
    assert.deepEqual(args.slice(0, 2), ["release", "create"]);
    if (options.failUpload) throw new Error("upload failed");
    const bytes = readFileSync(args[3]);
    published = {
      tag_name: args[2],
      draft: false,
      prerelease: false,
      html_url: `https://github.com/Owner/example/releases/tag/${args[2]}`,
      assets: [
        {
          name: "package.zip",
          state: "uploaded",
          size: bytes.length,
          digest: `sha256:${options.badDigest ? "bad" : createHash("sha256").update(bytes).digest("hex")}`,
        },
      ],
    };
    return published.html_url;
  };
  const publish = (confirm = async () => true) =>
    publishPlugin(planRelease(root, "patch"), {
      run,
      confirm,
      log: (message) => messages.push(message),
    });
  return {
    root,
    remote,
    git,
    run,
    commands,
    messages,
    head,
    remoteHead,
    packagePath,
    manifestPath,
    publish,
  };
}

test("version increments reset lower components and reject non-stable versions", () => {
  assert.equal(bumpVersion("0.1.9", "patch"), "0.1.10");
  assert.equal(bumpVersion("0.1.9", "minor"), "0.2.0");
  assert.equal(bumpVersion("0.1.9", "major"), "1.0.0");
  for (const version of ["01.2.3", "1.2", "1.2.3-beta.1", "-1.0.0"])
    assert.throws(() => bumpVersion(version, "patch"));
  assert.throws(() => bumpVersion("1.2.3", "other"));
});

test("dry-run previews the requested version without Git or file mutations", async (t) => {
  const f = fixture(t);
  const output = [];
  t.mock.method(console, "log", (value) => output.push(value));
  await runPublishCli(f.root, ["--bump", "minor", "--dry-run"]);
  assert.match(output.join("\n"), /0\.1\.0 → 0\.2\.0/);
  assert.equal(json(f.packagePath).version, "0.1.0");
  assert.equal(f.git("status", "--porcelain"), "");
  assert.equal(existsSync(join(f.root, ".git/plugin-releases")), false);
});

test("a confirmed release commits only versions and atomically pushes its tested revision", async (t) => {
  const f = fixture(t);
  const result = await f.publish(async (preview) => {
    assert.match(preview.notes, /feat: improve graph & labels/);
    assert.equal(json(f.packagePath).version, "0.1.1");
    assert.ok(existsSync(preview.asset));
    assert.equal(f.git("rev-parse", "HEAD"), f.head);
    assert.equal(
      f.commands.some((command) => command[1] === "push"),
      false,
    );
    return true;
  });
  assert.equal(result.version, "0.1.1");
  assert.equal(json(f.manifestPath).version, "0.1.1");
  assert.equal(f.git("status", "--porcelain"), "");
  const released = f.git("rev-parse", "HEAD");
  assert.equal(f.git("rev-parse", "v0.1.1^{}"), released);
  assert.equal(f.git("--git-dir", f.remote, "rev-parse", "master"), released);
  assert.deepEqual(f.git("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n"), [
    "apps/siyuan-plugin/package.json",
    "apps/siyuan-plugin/public/plugin.json",
  ]);
  const push = f.commands.find((command) => command[1] === "push");
  assert.deepEqual(push, [
    "git",
    "push",
    "--atomic",
    "origin",
    `${released}:refs/heads/master`,
    "refs/tags/v0.1.1",
  ]);
  const upload = f.commands.find((command) => command[0] === "gh" && command[1] === "release");
  assert.ok(
    upload.includes("--verify-tag") &&
      upload.includes("--latest") &&
      upload.includes("--notes-file"),
  );
});

test("cancelling after preparation restores versions without creating a commit or tag", async (t) => {
  const f = fixture(t);
  assert.deepEqual(await f.publish(async () => false), { cancelled: true });
  assert.equal(f.git("rev-parse", "HEAD"), f.head);
  assert.equal(f.git("status", "--porcelain"), "");
  assert.equal(json(f.manifestPath).version, "0.1.0");
  assert.equal(f.git("tag", "--list", "v0.1.1"), "");
});

for (const failure of ["failCheck", "failCommit"]) {
  test(`${failure} restores both the worktree and the script-owned index changes`, async (t) => {
    const f = fixture(t, { [failure]: true });
    await assert.rejects(f.publish(), /failed/);
    assert.equal(f.git("status", "--porcelain"), "");
    assert.equal(f.git("rev-parse", "HEAD"), f.head);
    assert.equal(f.git("--git-dir", f.remote, "rev-parse", "master"), f.remoteHead);
    assert.equal(json(f.packagePath).version, "0.1.0");
  });
}

for (const options of [{ wrongRemote: true }, { failAuth: true }, { latestTag: "v0.2.0" }]) {
  test(`preflight rejects ${Object.keys(options)[0]} before changing versions`, async (t) => {
    const f = fixture(t, options);
    await assert.rejects(f.publish());
    assert.equal(json(f.packagePath).version, "0.1.0");
    assert.equal(f.git("status", "--porcelain"), "");
    assert.equal(
      f.commands.some((command) => command[0] === "pnpm"),
      false,
    );
  });
}

test("failed commits restore CRLF version files and their normalized Git index", async (t) => {
  const f = fixture(t, { failCommit: true, crlf: true });
  await assert.rejects(f.publish(), /commit hook failed/);
  assert.equal(f.git("status", "--porcelain"), "");
  assert.equal(json(f.packagePath).version, "0.1.0");
  assert.ok(readFileSync(f.packagePath, "utf8").includes("\r\n"));
});

test("extra files staged by a commit hook are never pushed as a verified release", async (t) => {
  const f = fixture(t, {
    beforeCommit: ({ root, git }) => {
      writeFileSync(join(root, "source.txt"), "unverified hook change\n");
      git("add", "source.txt");
    },
  });
  await assert.rejects(f.publish(), /版本提交包含了额外文件/);
  assert.equal(f.git("--git-dir", f.remote, "rev-parse", "master"), f.remoteHead);
  assert.equal(
    f.commands.some((command) => command[1] === "push"),
    false,
  );
});

test("dirty worktrees and reused tags are not automatically committed or overwritten", async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, "untracked.txt"), "owner work");
  await assert.rejects(f.publish(), /提交工作区/);
  rmSync(join(f.root, "untracked.txt"));
  f.git("tag", "v0.1.1");
  await assert.rejects(f.publish(), /标签 v0.1.1 已存在/);
  assert.equal(f.git("rev-parse", "v0.1.1"), f.head);
  assert.equal(json(f.packagePath).version, "0.1.0");
});

test("remote divergence stops publication instead of force-pushing", async (t) => {
  const f = fixture(t);
  f.git("checkout", "-b", "remote-change", "v0.1.0");
  writeFileSync(join(f.root, "source.txt"), "remote work");
  f.git("commit", "-am", "remote change");
  f.git("push", "origin", "HEAD:master");
  f.git("checkout", "master");
  await assert.rejects(f.publish(), /远端包含/);
  assert.equal(
    f.commands.some((command) => command[1] === "push"),
    false,
  );
  assert.equal(json(f.packagePath).version, "0.1.0");
});

test("concurrent edits are preserved and are never included in the release commit", async (t) => {
  const f = fixture(t, {
    duringCheck: ({ root }) => writeFileSync(join(root, "source.txt"), "owner edit\n"),
  });
  await assert.rejects(f.publish(), /额外改动/);
  assert.equal(readFileSync(join(f.root, "source.txt"), "utf8"), "owner edit\n");
  assert.equal(json(f.packagePath).version, "0.1.0");
  assert.equal(f.git("rev-parse", "HEAD"), f.head);
});

for (const failure of ["failUpload", "badDigest"]) {
  test(`${failure} preserves the release commit, tag, and recovery artifacts`, async (t) => {
    const f = fixture(t, { [failure]: true });
    await assert.rejects(f.publish(), /版本提交已保留/);
    assert.equal(json(f.packagePath).version, "0.1.1");
    assert.equal(f.git("status", "--porcelain"), "");
    assert.equal(
      f.git("--git-dir", f.remote, "rev-parse", "v0.1.1^{}"),
      f.git("rev-parse", "HEAD"),
    );
    const upload = f.commands.find((command) => command[0] === "gh" && command[1] === "release");
    assert.ok(existsSync(upload[4]));
    assert.ok(existsSync(upload[upload.indexOf("--notes-file") + 1]));
    assert.equal(
      f.commands.some((command) => command.includes("--force") || command[1] === "reset"),
      false,
    );
  });
}
