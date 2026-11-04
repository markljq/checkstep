# Check Step 技术文档

> 面向开发者的架构与实现说明。使用层面的问题请看 [USER-GUIDE.md](USER-GUIDE.md)。

## 目录

- [技术选型](#技术选型)
- [总体架构](#总体架构)
- [目录结构](#目录结构)
- [进程模型与 IPC](#进程模型与-ipc)
- [状态管理](#状态管理)
- [数据模型](#数据模型)
- [导入 / 导出的数据校验](#导入--导出的数据校验)
- [关键交互实现](#关键交互实现)
- [主题系统](#主题系统)
- [时间线进度图渲染管线](#时间线进度图渲染管线)
- [安全设计](#安全设计)
- [构建与打包](#构建与打包)
- [测试体系](#测试体系)
- [已知设计取舍](#已知设计取舍)

---

## 技术选型

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 桌面框架 | Electron 33 | Windows 优先，titleBarStyle hidden + titleBarOverlay 实现自绘标题栏 |
| 构建工具 | electron-vite 2 | main / preload / renderer 三段式构建，输出到 `out/` |
| UI | React 18 + TypeScript 5 | 仅使用 hooks，无 class 组件 |
| 组件库 | Fluent UI v9（`@fluentui/react-components`） | 仅用 FluentProvider 提供深浅两套 design token，交互组件全部自绘 |
| 打包 | electron-builder 25 | 目标 Windows NSIS |
| 测试 | playwright-core（`_electron`） | 驱动真实 Electron 进程的端到端测试 |

选型原则：**零运行时依赖**——`dependencies` 为空，React/Fluent UI 等全部打进渲染产物（见[构建与打包](#构建与打包)），无任何后端与网络依赖。

## 总体架构

```
┌────────────────────────── Electron 主进程 (src/main) ──────────────────────────┐
│  BrowserWindow 管理 · 启动诊断日志 · 单实例锁                                   │
│  JSON 持久化（原子写 + 损坏备份） · 文件对话框（保存文本/图片、打开文本）          │
└───────────────▲───────────────────────────────────────────────▲────────────────┘
                │ IPC (contextBridge)                           │
┌───────────────┴───────────────────────────────────────────────┴────────────────┐
│  preload (src/preload)：window.api = { load, save, getDataPath,                 │
│                                        saveText, openText, saveImage }          │
└───────────────▲────────────────────────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────── 渲染进程 (src/renderer) ───────────────────┐
│  store.ts   全局状态（useSyncExternalStore）+ 不可变更新 + 自动持久化            │
│             拖拽移动 / 导入校验 / Markdown 生成等纯函数                          │
│  App.tsx    外壳：标题栏、模式切换、主题与主题色                                  │
│  Sidebar    项目列表 · 导入导出入口        ProjectView 里程碑/执行项/分享进度     │
│  TaskItem   执行项与步骤                  TimelineImage 时间线图 SVG→PNG         │
│  Dialogs    表单/确认/多行步骤对话框 + Toast（模块级轻量全局状态）                │
└────────────────────────────────────────────────────────────────────────────────┘
```

数据流单向：**UI 事件 → `store.update()`（structuredClone 深拷贝 + mutate）→ 通知订阅者重渲染 + `window.api.save()` 异步持久化**。

## 目录结构

```
checkstep-desktop
├── build/                    # electron-builder 打包资源（应用图标 png/svg）
├── docs/                     # 本文档、使用说明、README 截图
├── scripts/
│   ├── gen-icon.js           # Electron canvas 渲染 SVG → 512x512 透明 PNG
│   └── gen-screenshots.mjs   # 用演示数据驱动应用生成 README 截图
├── src/
│   ├── main/index.ts         # 主进程全部逻辑（约 250 行）
│   ├── preload/
│   │   ├── index.ts          # contextBridge 暴露 window.api
│   │   └── index.d.ts        # 渲染层类型声明
│   └── renderer/
│       ├── index.html        # 含 CSP meta
│       └── src/
│           ├── main.tsx / App.tsx
│           ├── types.ts      # 数据模型（Step/Task/Milestone/Project/DB）
│           ├── store.ts      # 状态、持久化、拖拽逻辑、导入校验、Markdown
│           ├── transfer.ts   # 导入导出用户流程（对话框编排）
│           ├── styles.css    # CSS 变量驱动的全部样式（约 300 行）
│           └── components/   # Sidebar / ProjectView / TaskItem /
│                             # TimelineImage / Dialogs
├── tests/                    # 端到端测试与一次性诊断脚本（diag-*.mjs 可忽略）
├── electron.vite.config.ts
├── package.json              # build 字段即 electron-builder 配置
└── tsconfig.{node,web}.json  # 主进程与渲染层分开类型检查
```

## 进程模型与 IPC

主进程通过 `ipcMain.handle` 暴露 6 个通道，preload 用 `contextBridge.exposeInMainWorld('api', …)` 透出：

| 通道 | 签名 | 用途 |
| --- | --- | --- |
| `store:load` | `→ unknown \| null` | 读取本地 JSON；损坏时备份并返回 null |
| `store:save` | `(db) → boolean` | 原子写入（临时文件 + `renameSync`） |
| `store:path` | `→ string` | 返回数据文件绝对路径（界面展示用） |
| `file:saveText` | `(payload) → SaveResult` | 系统另存为对话框 + 写文本（JSON/Markdown 导出） |
| `file:openText` | `(payload) → OpenResult` | 系统打开对话框 + 读文本（JSON 导入） |
| `file:saveImage` | `(payload) → SaveResult` | 系统另存为 + base64 解码写 PNG（进度图导出） |

所有文件读写必须经过主进程，渲染层无 Node 能力（见[安全设计](#安全设计)）。

主进程其他职责：

- **启动诊断日志**：`userData/main.log` 记录启动、窗口显示、加载失败、渲染进程崩溃等事件，并带 `did-fail-load` 自动重载与 `render-process-gone` 重载兜底，规避"进程在、窗口无"的僵尸状态
- **单实例锁**：`app.requestSingleInstanceLock()`，二次启动唤起既有窗口，避免多开互相覆盖 JSON
- **原子写**：`writeFileSync(tmp)` → `renameSync(tmp, DATA_FILE)`；读失败先 `copyFileSync` 备份 `.corrupt-<ts>.bak` 再返回 null

## 状态管理

不引入 Redux/Zustand，`store.ts` 用 130 行实现够用的方案：

```ts
let db: DB | null = null
const listeners = new Set<() => void>()

export function useStore(): DB | null {
  return useSyncExternalStore(subscribe, () => db)   // React 18 并发安全的订阅
}

export function update(fn: (draft: DB) => void): void {
  const next = structuredClone(db)   // 深拷贝后自由 mutate
  fn(next)
  db = next
  emit()                             // 同步重渲染
  void window.api.save(db)           // 异步持久化，不阻塞 UI
}
```

要点：

- **写时整体替换**：`structuredClone` 保证不可变更新，调用方拿到的是可变草稿，写法接近 Immer 但零依赖
- **持久化即保存**：每次 `update` 全量落盘。数据量级（几十个项目 × 几百执行项）下 JSON.stringify 开销可忽略；若未来数据量增长，可改为增量队列或 debounce
- **导入两条路径**：`replaceAll`（整体替换，结构校验）与 `appendProjects`（追加项目，全部重生成 id 避免冲突）
- **对话框/Toast 状态**：同样是模块级变量 + `useSyncExternalStore` 的轻量方案（`Dialogs.tsx`），与主 store 隔离

## 数据模型

`src/renderer/src/types.ts`：

```ts
interface Step     { id: string; content: string; done: boolean }
interface Task     { id: string; title: string; note: string;
                     done: boolean; doneAt: string | null; steps: Step[] }
interface Milestone{ id: string; name: string; tasks: Task[] }
interface Project  { id: string; name: string; desc: string; milestones: Milestone[] }

interface DB {
  projects: Project[]
  currentProjectId: string
  mode: 'execute' | 'edit'
  theme: 'dark' | 'light'
  accent: 'blue'|'teal'|'purple'|'pink'|'orange'|'green'|'gold'|'red'
  guideSeen?: boolean          // 首次使用指引是否已读
}
```

- `doneAt` 格式固定 `YYYY-MM-DD HH:mm:ss`（本地时间，无时区），`null` 表示未完成；该格式同时是导出 Markdown 中的展示格式，并可用 `isValidDateTime` 校验
- **历史包袱处理**：v1.0.7 及之前存在"直接执行项"（项目下未分组的 `tasks`），v1.0.8 起废弃——加载时 `delete p.tasks`，导入校验时直接丢弃，保证旧文件能无损迁移
- id 生成：`Math.random().toString(36) + Date.now().toString(36)`，仅本地唯一即可

## 导入 / 导出的数据校验

`store.ts · normalizeDB(raw, freshIds)` 是导入的唯一入口，做到**不信任外部输入**：

1. 顶层必须有 `projects` 数组，否则整个文件判定不合法（返回 null，UI 提示取消）
2. 逐层过滤：非对象条目跳过；执行项必须有非空 `title`；步骤必须有非空 `content`
3. 字段规范化：`done` 只认严格 `true`；`doneAt` 必须通过格式校验否则置 null；`theme/accent/mode` 不合法时回落默认值
4. `freshIds=true`（追加导入）时所有 id 重生成，杜绝与现有数据冲突；`false`（整体替换）保留合法 id
5. 旧版字段 `projects[].tasks`（直接执行项）静默丢弃

## 关键交互实现

### 拖拽排序（HTML5 Drag & Drop）

- 拖拽载荷（`dragRef`，useRef 避免 dragover 高频 setState）分两类：`{kind:'task', id, groupId, index}` 与 `{kind:'milestone', id, index}`
- 插入位置在 `dragover` 时按 `clientY` 与目标行中点比较实时计算（before/after 指示线），**drop 时重新按落点坐标计算**，不信任 dragover 留下的异步 state
- 跨容器逻辑：拖到执行项上=插到其前/后；拖到列表空白=该组末尾；拖到里程碑标题=移入该组末尾（复用 `moveTaskTo(id, MAX_SAFE_INTEGER)`）
- 同组内向下移动时目标索引 `at -= 1`：因为先从原数组摘除再插入
- 编辑模式才开启 `draggable`，执行模式完全关闭拖拽

### 吸顶头部与待办定位

- 内容区头部 `.proj-top` 用 `position: sticky` 吸顶；滚动超过 4px 加阴影（`stuck` 态）
- `updateJumpVisible()`（scroll/resize 时 rAF 节流）遍历 `.task:not(.done)`，判断是否有任一未执行项与视口可见（头部以下）；全都不可见且有未执行项时显示 `jump-fab`
- 点击待办：若目标所在里程碑折叠则先展开，等待 360ms 展开动画后 `scrollIntoView({block:'center'})` 并加 `locate-flash` 高亮类 1.8s

### 完成时间编辑

- `toInputValue` / `fromInputValue` 负责 `HH:mm:ss` 字符串与 `<input type="datetime-local">` 值（`THH:mm`）互转，秒沿用原值
- 取消完成时同步清空 `doneAt` 并重置所有步骤勾选

## 主题系统

三层结构：

1. **CSS 变量**（`styles.css`）定义深浅两套界面底色、文字色、边框色，`<html data-theme="dark|light">` 切换
2. **主题色（accent）**：8 种颜色 × 深浅双值定义在 `store.ts · ACCENTS`，`App.tsx` 的 effect 把 `--accent / --on-accent / --accent-hover / --accent-soft` 写到 `document.documentElement.style`；hover 与 soft 底色用 `color-mix(in srgb, …)` 实时混色，无需为每种颜色手写衍生值
3. **Fluent UI**：`FluentProvider` 按 theme 切 `webDarkTheme / webLightTheme`，只影响少数 Fluent 控件（如 datetime picker）

## 时间线进度图渲染管线

`TimelineImage.ts`，纯函数生成 SVG 字符串：

1. **布局预排**：先按中英文混排宽度估算（中文 12px/字、西文 6.8px/字）量出每个里程碑"一整行"所需宽度，据此自适应画布宽度（320 ~ 980px），内容少时不留大片空白
2. **胶囊换行**：执行项渲染为 26px 高圆角胶囊，按最终宽度贪心换行，卡片高度随行数增长
3. **语义元素**：左侧纵向主轴（已完成段用主题色高亮）+ 三种轴节点（完成=实心勾、当前=光晕圈、待办=空心）；底部图例在左、「进行到第 N 项」在右，避免重叠
4. **配色**：`THEMES[theme]` 提供深浅两套灰阶 + accent 取自 `ACCENTS`，与界面观感一致
5. **PNG 导出**：`svgToPngBase64` 用 `data:image/svg+xml` 加载（规避 CSP 对 blob 的限制）→ Image → canvas 2x 缩放绘制 → `toDataURL`；复制走 `navigator.clipboard.write(ClipboardItem)`，保存走 `file:saveImage` IPC
6. 预览弹窗中直接用 SVG（矢量、文字可校验），仅在复制/保存时才栅格化

## 安全设计

- `contextIsolation: true` + `sandbox: false`（preload 需要完整 ipcRenderer）+ `nodeIntegration: false`
- 渲染层唯一入口是 `window.api` 的 6 个方法，无任意 IPC
- CSP（`index.html`）：`default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:`——无远程脚本/字体/网络请求；`data:` 与 `blob:` 仅为进度图/内联样式放行
- 外部链接一律 `shell.openExternal`（`setWindowOpenHandler` 返回 deny）
- 导入数据经 `normalizeDB` 白名单式重建，无 `eval`/动态注入

## 构建与打包

```
npm run dev     → electron-vite dev（main/preload/renderer 热更）
npm run build   → 输出 out/main, out/preload, out/renderer
npm run dist    → build + electron-builder --win → dist/CheckStep-Setup-<ver>.exe
```

`package.json · build` 关键配置与踩坑记录：

- **`files: ["out/**/*", "!node_modules/**/*"]`**：所有 npm 依赖（React、Fluent UI 等）都在 `devDependencies`，由 Vite 打进渲染产物，asar 内不含 node_modules——安装包从 111MB 降到约 81MB，也避免了打包阶段扫描庞大依赖树时被杀软限速导致的"packaging 卡死"
- **图标**：`win.icon = build/icon.png`（512×512 透明 PNG，electron-builder 自动生成多尺寸 ico 嵌入 exe）；图标源文件 `build/icon.svg`，用 `npx electron scripts/gen-icon.js`（Electron canvas 渲染，保留透明圆角）重新生成
- **NSIS**：`oneClick: false`（允许选目录）、`artifactName: CheckStep-Setup-${version}.exe`、创建桌面/开始菜单快捷方式
- 版本号唯一来源是 `package.json · version`

## 测试体系

`tests/*.mjs` 基于 `playwright-core` 的 `_electron` 启动真实应用：

```ts
const app = await electron.launch({
  args: ['.', `--user-data-dir=${tmpdir}`],   // 每次测试用独立临时 userData
  executablePath: require('electron'),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
})
```

| 脚本 | 覆盖点 |
| --- | --- |
| `smoke.mjs` | 启动、数据读写、种子数据、基础勾选 |
| `features.mjs` | JSON 导入导出（含坏文件）、Markdown 导出、完成时间编辑（对话框经 `app.evaluate` stub 系统对话框） |
| `duplicate.mjs` | 项目/执行项复制后状态重置、重名校验 |
| `optimize.mjs` | 吸顶位置、全部折叠/展开、悬浮待办定位 |
| `v105.mjs` | 分享进度图内容、步骤编辑与悬停样式 |
| `v104.mjs` | v1.0.4 系列交互回归 |
| `verify-dist.mjs` | 面向 `dist/` 产物的安装级验证 |

约定：

- 测试一律使用临时 `userData`，绝不触碰真实数据
- 系统对话框通过 `app.evaluate(({dialog}) => …)` 替换实现，避免阻塞自动化
- 首次启动需处理使用指引弹窗（点击「开始使用」或写入 `guideSeen: true`）
- `:hover` 类样式无法用合成鼠标触发，相关断言改为校验 CSS 规则存在

`diag-*.mjs` 为开发期一次性诊断脚本，不作为回归集。

## 已知设计取舍

- **全量 JSON 写入**：每次修改整体落盘。当前数据量（< 1MB）下开销可忽略；若项目数/执行项数增长两个数量级，应考虑增量持久化或 SQLite
- **无协作/云同步**：单实例锁 + 本地文件，定位单人工具
- **id 为随机字符串**：仅本地唯一，合并两份备份数据依赖"追加导入重生成 id"，不做跨设备 id 对齐
- **时间无时区语义**：`doneAt` 为本地时间字符串，面向"上线值班"场景足够，不适合跨时区审计
- **Windows 优先**：打包与自绘标题栏按 Win11 风格实现，macOS/Linux 可运行但未适配打包与标题栏细节
