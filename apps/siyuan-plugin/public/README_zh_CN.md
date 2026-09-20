# 一个思源图谱

从笔记、块或搜索结果出发，在交互式 2D / 3D 图谱中探索它们之间的联系。

[English](README.md) ·
[使用指南](https://github.com/CherryGS/sy-another-graph/blob/master/docs/user-guide_zh_CN.md) ·
[鼠标与键盘操作](https://github.com/CherryGS/sy-another-graph/blob/master/docs/mouse-keyboard_zh_CN.md)

_以下截图均使用测试工作区中的演示笔记。_

## 在图上探索与追溯来源

在 **2D / 3D** 图谱中浏览，Shift 点击多选起点，按方向和跳数查看邻域，或寻找最短路径。
支持块引用、包含、数据库关系和可选的文本提及，可预览原始笔记并查看关系依据。

![选中节点、邻域高亮和右侧关系详情](preview.jpg)

_选中 Graph Theory 后，高亮相邻节点，并在右侧查看关系详情。_

## 按跳数查看层级

切换到 **层级** 布局，节点按距最近已选起点的跳数从左到右排列。
支持 2D / 3D 和不同遍历方向；邻域深度用于控制高亮范围。

![节点从左到右按跳数分层排列](screenshots/layered.jpg)

_以 Graph Theory 为起点，其他文档依次分布在第 1–3 跳。_

## 发现有关联的文档

**发现关联** 可查找 **引用相同资料** 或 **被共同引用** 的文档。
查看候选排名与支持引用，点击 **＋** 将候选加入已选，继续探索。

![关联候选、引用依据和画布上的真实连接](screenshots/discovery.jpg)

_SolidJS 同时引用 Graph Theory 和 Rust WASM，因此后者成为「被共同引用」的候选。_

## 筛选范围，或从搜索开始

按笔记本、文档或块、节点类型及排除子树筛选，把常用配置保存为 **命名预设**。
原生搜索和 [HZ 简搜](https://github.com/Hug-Zephyr/HZ-syplugin-simple-search) 支持用全部结果建图，补齐祖先上下文，并用外环标记命中。

## 调整外观与导出

按类型、分支、笔记本或连接度着色，调整标签与社区聚合，显示 2D 社区背景，并导出当前可见图谱为 JSON。

## 开始使用

1. 在桌面版思源 **3.8.3+** 中启用插件，点击顶栏图标或按 **Alt + Shift + G**。
2. 默认查看文档与引用，也可从文档或块的右键菜单选择 **在图谱中查看**。
3. 打开 **筛选** 调整范围，选中起点后尝试 **层级** 布局或 **发现关联**。

界面跟随思源语言，支持简体中文和英文。图谱读取本地索引，不修改笔记。
大图流畅度取决于数据规模、硬件和布局设置。

搜索行为、文本提及排除、来源诊断、运行要求与各项限制，详见
[使用指南](https://github.com/CherryGS/sy-another-graph/blob/master/docs/user-guide_zh_CN.md)。

## 许可与致谢

项目自有代码采用 MIT 许可。图谱可视化由 [Cosmograph](https://cosmograph.app/) 提供，
遵循 [CC BY-NC 4.0 / 独立商业许可条款](https://cosmograph.app/docs-general/citing-and-licensing/)，并保留署名。
其他依赖保留各自许可，参见 [文本提及依赖声明](third-party-mentions.txt)
与 [社区依赖声明](third-party-communities.txt)。
