# dsh-opencode-go-monitor

DSH（DeepSeek Harness）Web UI 悬浮面板插件：实时显示 **OpenCode Go**（opencode 官方订阅）的额度余额与本地用量。

- **月度 / 滚动 / 每周** 三档额度：剩余 %（绿≥50% / 橙≥25% / 红<25%）+ 进度条 + 已用 % + 重置时间
- 今日 / 累计用量（tokens、费用、会话数）
- 可**拖动**（位置记忆）、右下角**调整大小**（尺寸记忆）
- 余额每 60s 轮询官方接口，用量每 5s 读本地数据

风格与 DSH 自带「余额悬浮窗」（dsh-balance-window，DeepSeek 余额）一致。

## 隐私说明（重要）

- 插件从**你自己电脑上**的 `~/.local/share/opencode/auth.json` 读取 `opencode-go` 的 API key
- key 只在进程内存中使用，仅用于调用官方余额接口 `https://opencode.ai/zen/go/v1/usage`，**不落盘、不写日志、不发给任何第三方**
- 用量数据来自**你自己的** `~/.local/share/opencode/opencode.db`（SQLite 只读）
- 仓库内不含任何密钥 —— **每个部署者看到的是自己的余额**

## 前置条件

| 依赖 | 说明 |
| --- | --- |
| DeepSeek Harness（web 或桌面端） | 插件运行在 DSH 内 |
| opencode CLI + **OpenCode Go 订阅** | 已通过 `/connect` 配置，`auth.json` 中存在 `opencode-go` 条目 |
| Node.js ≥ 22.5 | 用量统计需要内置 `node:sqlite`（DSH 自身运行 Node，通常已满足） |

> 余额功能不依赖 Node 版本；只有用量统计需要 `node:sqlite`，不可用时面板会显示「用量失败」而余额照常。

## 安装

### 方式一：标准流程（推荐，热加载）

1. 把本文件夹（含 `package.json` 和 `lib/`）整个复制到 `$DSH_HOME/profiles/node_modules/dsh-opencode-go-monitor/`

   `$DSH_HOME` 默认位置：Windows `~\.dsh`；macOS / Linux `~/.dsh`（可用 `echo $DSH_HOME` 确认）

2. 编辑 `$DSH_HOME/profiles/web/cordis.patch.yml`（没有则新建，内容为 `[]`），追加：

   ```yaml
   # OpenCode Go 余额悬浮窗
   - insert:
       - id: opencode-go-monitor
         name: 'dsh-opencode-go-monitor'
   ```

3. `cordis.patch.yml` 修改会**热加载**，无需重启；刷新浏览器页面（Ctrl+Shift+R）即可看到面板

### 方式二：super-injector（如果装有）

```text
dev_install_package dir=<本文件夹绝对路径>
```

## 自定义（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OGM_DATA_DIR` | `~/.local/share/opencode` | opencode 数据目录 |
| `OGM_AUTH` | `<数据目录>/auth.json` | auth.json 路径 |
| `OGM_DB` | `<数据目录>/opencode.db` | 用量数据库路径 |
| `OGM_PROVIDER` | `opencode-go` | auth.json 中的 provider 名 |
| `OGM_BASE` | `https://opencode.ai/zen/go/v1/usage` | 余额接口地址 |

## 排错

| 现象 | 处理 |
| --- | --- |
| 状态行「余额失败」 | 悬停查看详情：检查网络、`auth.json` 中 `opencode-go` 的 key、`OGM_BASE` |
| 状态行「用量失败」 | opencode 版本过新/过旧导致 DB 结构变化，或未装 `node:sqlite`；设置 `OGM_DB` 指向正确数据库 |
| 面板完全不显示 | 确认 `cordis.patch.yml` 注册行格式、`profiles/node_modules/dsh-opencode-go-monitor` 路径；浏览器硬刷新（Ctrl+Shift+R）；F12 控制台看红色报错 |
| 两个面板重叠 | 直接拖动分开即可（位置记忆） |

## 卸载

1. 从 `cordis.patch.yml` 删除注册行（热加载立即移除）
2. 删除 `profiles/node_modules/dsh-opencode-go-monitor/` 文件夹

## 结构

```
├── package.json      # 插件清单（dsh.client 双半声明）
└── lib/
    ├── index.js      # host 半：/api/opencode-go/balance（官方接口，60s 缓存）
    │                 #       /api/opencode-go/usage（本地 SQLite 只读聚合）
    └── client.js     # client 半：shell.overlay 悬浮面板（拖动/缩放/记忆）
```
