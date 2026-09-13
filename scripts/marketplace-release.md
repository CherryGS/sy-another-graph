# Marketplace releases

The plugin repository is `CherryGS/sy-another-graph`. The package ID remains
`sy-another-graph`; the displayed product name is `一个思源图谱` (A SiYuan graph).
The project's original code uses MIT, while bundled dependencies retain their
own licenses and the notices described in [NOTICE.md](../NOTICE.md).

## Prepare a version

1. Set the same version in `apps/siyuan-plugin/package.json` and
   `apps/siyuan-plugin/public/plugin.json`.
2. Run `pnpm check` from the repository root.
3. Run `pnpm package:artifacts --tag vX.Y.Z` to package that validated build.
   `pnpm package` also builds and validates the artifacts before packaging.
4. Inspect `apps/siyuan-plugin/dist/package.zip` and the printed SHA-256.

The packager requires a nonempty author, the matching GitHub repository URL,
canonical locale keys, matching source/build metadata, complete runtime assets,
and license notices. It creates ZIP paths with `/`, preserves binary files,
checks an extraction against the inputs, and excludes previous archives.
Local deployment skips `package.zip`; normal build/deploy commands retain their
existing local-workspace behavior.

## Publish

Authenticate with `gh auth login --hostname github.com --git-protocol https --web`.
Browser authentication and any account verification remain owner-operated.

Commit and push the release source, then create and push its `vX.Y.Z` tag.
Publish a regular GitHub Release with the matching version and the exact
`package.zip` attachment. For example, after the tag exists on the remote:

```sh
gh release create v0.1.0 apps/siyuan-plugin/dist/package.zip --repo CherryGS/sy-another-graph --verify-tag --title "v0.1.0 · 一个思源图谱" --notes-file release-notes.md
```

Prepare `release-notes.md` for that release before running the example.
Do not replace an existing release or move a published tag as part of a routine
update; publish a new version instead.

For the first listing, fork `siyuan-note/bazaar`, add exactly this line to
`plugins.txt`, and open a pull request against its `main` branch:

```text
CherryGS/sy-another-graph
```

The public repository's default-branch root must contain a nonempty `LICENSE`
or `LICENSE.txt`. The bazaar checks the Latest Release and its archive; source
files can stay in this repository's existing workspace layout. Icons and preview
images are optional under the current rules.

Resolve check results in the same pull request. Maintainers control review and
merging. Later releases only require a higher manifest version and a new GitHub
Release; the marketplace fetches updates automatically.

References: [official listing process](https://github.com/siyuan-note/bazaar/blob/main/README.zh-CN.md),
[plugin sample](https://github.com/siyuan-note/plugin-sample), and
[repository checks](https://github.com/siyuan-note/bazaar/blob/main/actions/util/repo.go).
