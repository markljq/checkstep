# 更新日志

本项目的所有重要变更记录在此文件中。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.9] - 2026-11-04

### 变更
- 全新应用图标：扁平化设计，蓝色圆角方块 + 白色「C」形弧线内嵌对勾（矢量源 `build/icon.svg`，脚本可重新生成）

## [1.0.8] - 2026-11-04

### 移除
- 废弃「直接执行项」（项目下未分组执行项）概念，执行项必须归属里程碑；旧数据加载与导入时自动迁移（丢弃未分组项）
- 移除底部全局「新增执行项」按钮

### 变更
- 种子演示数据全部重组入里程碑

## [1.0.7] - 2026-11-04

### 修复
- 分享进度图底部图例与进度标注文字重叠的问题（图例左置、标注右置）

## [1.0.6] - 2026-11-03

### 变更
- 分享进度图重设计为「纵向里程碑卡时间线」：里程碑自上而下、执行项胶囊自动换行、左侧纵向轴标注进度；画布宽度自适应内容
- 进度图配色自动跟随深浅主题与主题色，画布过宽问题修复

## [1.0.5] - 2026-11-03

### 新增
- 「分享进度」按钮：一键生成时间线进度图，支持复制到剪贴板 / 保存 PNG（2x），不包含具体完成时间
- 执行步骤支持编辑与删除；悬停步骤行高亮

### 修复
- data: 图片被 CSP 拦截导致 PNG 无法显示的问题（`img-src` 增加 `data:`）

## [1.0.4] - 2026-11-03

### 新增
- 首次启动使用指引弹窗（仅出现一次，可跳过）
- 项目标题与总进度条吸顶：滚动长清单时始终可见
- 顶部「全部折叠 / 全部展开」按钮（取代原搜索框）
- 右下角「待办」悬浮按钮：视口内无未执行项时出现，点击定位最早的未执行项并高亮

### 修复
- 吸顶头部因负 margin 产生的 20px 偏移

## [1.0.3] - 2026-11-02

### 新增
- 项目复制：完整复制清单结构，执行状态重置
- 执行项复制
- 导入 / 导出：JSON 全量备份 / 单项目导出、Markdown 清单导出、JSON 导入（追加或替换）

### 变更
- 执行模式 / 编辑模式双模式工作流
- 深浅主题 + 8 种主题色自定义

## [1.0.2] - 2026-11-02

### 新增
- 执行项支持多行连续录入的执行步骤，步骤可逐项打勾
- 完成时间自动记录，支持修改（精确到分钟）

## [1.0.1] - 2026-11-02

### 新增
- 项目 / 里程碑 / 执行项三层清单结构与拖拽排序
- 本地 JSON 持久化（原子写入 + 损坏备份）、单实例锁

[Unreleased]: https://github.com/markljq/checkstep/compare/v1.0.9...HEAD
[1.0.9]: https://github.com/markljq/checkstep/compare/v1.0.8...v1.0.9
[1.0.8]: https://github.com/markljq/checkstep/compare/v1.0.7...v1.0.8
[1.0.7]: https://github.com/markljq/checkstep/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/markljq/checkstep/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/markljq/checkstep/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/markljq/checkstep/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/markljq/checkstep/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/markljq/checkstep/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/markljq/checkstep/releases/tag/v1.0.1
