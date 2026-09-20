# 发布「另一个图谱」

仓库为 `CherryGS/sy-another-graph`，插件 ID 为 `sy-another-graph`。
项目自有代码使用 MIT，第三方声明见 [NOTICE.md](../NOTICE.md)。

## 交互式发布

在仓库根目录运行：

```powershell
pnpm publish:plugin
```

选择要递增的版本段，例如当前为 `0.1.0` 时：

| 选择      | 新版本  | 用途           |
| --------- | ------- | -------------- |
| 1 / patch | `0.1.1` | 修复、小幅改进 |
| 2 / minor | `0.2.0` | 新增功能       |
| 3 / major | `1.0.0` | 不兼容改动     |
| 0         | 取消    | 保持当前版本   |

首次使用需安装 GitHub CLI 并完成 `gh auth login`；如 Git 尚未使用该登录，
可运行 `gh auth setup-git`。在默认分支上提交好待发布的改动后再运行脚本。
发布前会检查工作区、origin 地址、推送权限、远端提交、Latest 版本和已有标签。

脚本会同步修改 `apps/siyuan-plugin/package.json` 和
`apps/siyuan-plugin/public/plugin.json`，执行 `pnpm check`，然后打包。
更新说明默认取上次 Latest Release 之后的提交标题。终端展示完整说明、
版本、目标仓库、分支、安装包位置和 SHA-256 后，再确认是否发布。

确认后，脚本只提交两个版本文件，创建注释标签，原子推送分支和标签，
再创建带 `package.zip` 的正式 Latest Release。已有的本地提交也会随分支推送。
最后核验 Release 状态、附件大小，以及 GitHub 提供的附件摘要。

## 参数与预演

```powershell
# 只展示版本和流程，不修改文件，也不访问远端。
pnpm publish:plugin --bump minor --dry-run

# 指定升级类型和已有更新说明，最后仍需确认。
pnpm publish:plugin --bump patch --notes temp/release-notes.md

# 明确跳过最终确认，适用于已审阅内容的自动化调用。
pnpm publish:plugin --bump patch --notes temp/release-notes.md --yes
```

支持 `--help`。非交互终端需要指定 `--bump`，并使用 `--dry-run` 或 `--yes`。
当前仅支持稳定版本，不生成 prerelease。
自定义说明草稿统一放在仓库根目录的 `temp/` 下，该目录已被 Git 忽略。

## 取消与失败后继续

检查失败或最终确认被取消时，脚本恢复自己写入且未被再次修改的版本内容。
它不会丢弃其他文件的改动，也不会替你提交已有的未提交工作。
准备过的 `dist/` 可能仍是候选版本；需要本地安装时重新执行 `pnpm release`。

安装包和实际使用的更新说明另存于 Git 私有目录的 `plugin-releases/` 下，
每次使用独立目录，终端会打印位置。它们不会进入源码提交或集市安装包。

如果版本提交之后推送、上传或校验失败，脚本保留已经生成的提交、标签和恢复资料；
具体停在哪一步需要先核对，标签不一定已经创建。
先检查现状，不要直接重新递增版本：

1. 如果报错是提交夹带额外文件、提交钩子修改版本或工作区有改动，先修正并重新检查、打包。
   此类校验失败不能直接继续推送或上传之前的安装包。
2. 如果已进入推送阶段，先核对本地标签所指提交以及远端分支、标签。
   `schannel` / TLS 握手失败发生在 Git 网络连接阶段；连接恢复后可继续推送同一次发布：

   ```powershell
   git show --stat vX.Y.Z
   git ls-remote origin refs/heads/master refs/tags/vX.Y.Z "refs/tags/vX.Y.Z^{}"
   # 确认版本提交和标签有效后，原子推送标签对应的提交与标签。
   git push --atomic origin "vX.Y.Z^{}:refs/heads/master" refs/tags/vX.Y.Z
   ```

   不要为重试递增版本、移动已有标签或强制推送；远端同名标签指向其他提交时应先核查。

3. 用 `gh release view vX.Y.Z --repo CherryGS/sy-another-graph` 检查 Release。
4. 如果尚无 Release，使用保留的安装包和说明创建：

   ```powershell
   gh release create vX.Y.Z "保留目录/package.zip" --repo CherryGS/sy-another-graph --verify-tag --title "vX.Y.Z · 另一个图谱" --notes-file "保留目录/release-notes.md" --latest
   ```

5. 如果已有草稿，检查并补齐该草稿的附件和说明后发布；如果正式 Release 已存在，
   核对附件和摘要。不要为日常更新移动已发布标签或覆盖已发布版本。

## Arrow 安装提示

Arrow 17 的清单声明了未随包发布的 `bin/arrow2csv.cjs`。仓库补丁为该入口转接到
原有 `arrow2csv.js`，不改动图谱使用的 Arrow API。pnpm 11 首次应用补丁时会先为
依赖创建命令入口，所以全新安装仍可能出现一次内部 `.bin` 警告；安装完成后入口
可用，后续冻结安装不应重复出现。这个提示与 Git 推送的 TLS 错误无关。

## 其他命令

| 命令                                  | 作用                                                     |
| ------------------------------------- | -------------------------------------------------------- |
| `pnpm release`                        | 构建并安装到本地 `E:/Data/Siyuan`。                      |
| `pnpm package`                        | 构建、校验并生成 `apps/siyuan-plugin/dist/package.zip`。 |
| `pnpm package:artifacts --tag vX.Y.Z` | 对已经检查的构建产物打包，核对目标版本。                 |
| `pnpm test:publish`                   | 在临时本地 Git 仓库中测试发布流程，不访问 GitHub。       |

`publish:plugin` 专门负责 GitHub 发布，不改动现有本地安装命令。
Rust crate 的独立版本号不随插件版本递增。

## 思源集市

首次上架由维护者手动向 `siyuan-note/bazaar` 的 `main` 分支提交 PR，
在 `plugins.txt` 增加一行 `CherryGS/sy-another-graph`。该脚本不会创建集市 PR。
之后更新只需递增清单版本并发布新的 Latest Release，集市会自动拉取。

参考：[官方提交流程](https://github.com/siyuan-note/bazaar/blob/main/README.zh-CN.md)、
[插件示例](https://github.com/siyuan-note/plugin-sample)。
