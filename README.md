# dsh-opencode-go-monitor

DSH（DeepSeek Harness）Web UI 悬浮面板插件：**双标签页** 实时显示 DeepSeek 与 **OpenCode Go** 的额度余额（标签切换带滑动+淡入动画）。

- **双标签页**：DeepSeek 余额 / OpenCode Go 余额，点击切换，带方向滑动 + 淡入动画
- OpenCode Go 页：**月度 / 滚动 / 每周** 三档额度：剩余 %（绿≥50% / 橙≥25% / 红<25%）+ 进度条 + 已用 % + 重置时间；下方为可选用量（今日/累计）
- DeepSeek 页：余额、预计剩余 tokens（按 ¥4/百万估算）、当前模型
- 可**拖动**（位置记忆）、右下角**调整大小**（尺寸记忆）
- 轮询：DeepSeek 每 30s、OpenCode Go 每 60s、用量每 5s

## 省钱功能

- **DeepSeek 官方高低价时段**（自动展示）：高峰 = 北京时间 **09:00-12:00 / 14:00-18:00**，其余为空闲时段（**半价**）；面板显示当前时段状态与距下次切换倒计时（DeepSeek 页）
- **限额**（金额 + tok 量，DeepSeek 页）：
  - 「省钱」开关：显示 **每日金额 / 每日 tok / 本小时 tok** 三条进度条，超限红色告警（金额超限 / tok 超限 / 本小时超限分别提示）
  - 「自动」按钮循环切换三种模式：
    - **关**：仅手动限额
    - **7 天平均**：每日 tok 上限 = 近 7 天日均 tok，每日金额上限 = 近 7 天日均花费
    - **单日小时平均**：每小时 tok 上限 = 最近有请求的单日 tok ÷ 24；**高峰时段（09-12 / 14-18）自动把每小时 tok 上限减半**（高价期自动限制 tok 量，花费等价）
  - 「一键限额」：把每日金额/tok 上限设为今日已用量
  - 设置 → 常规：`每日金额上限 $` / `每日 tok 上限` / `每小时 tok 上限（高峰自动减半）` 手动输入 + 自动限额模式选择
- **省钱分析（常驻显示）**：DeepSeek 页始终显示今日高峰/空闲请求分布、错峰建议（高峰挪空闲可省多少 / 当前时段该做什么）、近 7 天日均用量基线
- **自动省钱分析**：按 DeepSeek 官方时段把今日请求分成 高峰/空闲 两组，估算"高峰请求挪到空闲可省多少"

> 本插件已合并原「余额悬浮窗」（dsh-balance-window）的面板，部署时请将旧插件注册改为 `disabled`（见安装步骤），避免两个面板重叠。

风格与 DSH 自带「余额悬浮窗」（dsh-balance-window，DeepSeek 余额）一致。

## 隐私说明（重要）

- **不依赖本地 opencode**：余额查询**不读取** opencode 的配置文件（`auth.json` 等）
- API key 来源（按优先级）：
  1. **DSH 凭据系统**：`OPENCODE_GO_API_KEY`（设置 → 凭据，存在 `$DSH_HOME/.credentials.yaml` 本地文件）
  2. 环境变量 `OGM_API_KEY`
- key 只在进程内存中使用，仅用于调用官方余额接口 `https://opencode.ai/zen/go/v1/usage`，**不落盘、不写日志、不发给任何第三方**
- 仓库内不含任何密钥 —— **每个部署者看到的是自己的余额**

## 前置条件

| 依赖 | 说明 |
| --- | --- |
| DeepSeek Harness（web 或桌面端） | 插件运行在 DSH 内 |
| DeepSeek API key | DSH **设置 → 凭据** 添加 `DEEPSEEK_API_KEY`（DeepSeek 标签页用） |
| OpenCode Go 订阅 + API key | DSH **设置 → 凭据** 添加 `OPENCODE_GO_API_KEY`（在 [opencode.ai/auth](https://opencode.ai/auth) 获取） |
| ~~opencode CLI~~ | **不再需要**（仅"用量"统计可选依赖 opencode 的本地数据库） |

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

4. 配置凭据：DSH **设置 → 凭据** → 添加 `DEEPSEEK_API_KEY` 与 `OPENCODE_GO_API_KEY`

5. 若旧版「余额悬浮窗」（`dsh-balance-window`）还注册着，把它的 `insert:` 块替换为禁用条目：

   ```yaml
   - id: balance-window
     disabled: true
   ```

### 方式二：super-injector（如果装有）

```text
dev_install_package dir=<本文件夹绝对路径>
```

## 自定义（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OGM_API_KEY` | — | 备用 key（无 DSH 凭据时使用） |
| `OGM_DATA_DIR` | `~/.local/share/opencode` | opencode 数据目录（仅用量统计用） |
| `OGM_DB` | `<数据目录>/opencode.db` | 用量数据库路径（仅用量统计用） |
| `OGM_PROVIDER` | `opencode-go` | 用量统计过滤的 provider 名 |
| `OGM_BASE` | `https://opencode.ai/zen/go/v1/usage` | 余额接口地址 |

## 排错

| 现象 | 处理 |
| --- | --- |
| 状态行「余额失败：未配置 OPENCODE_GO_API_KEY 凭据」 | DSH 设置 → 凭据 添加 `OPENCODE_GO_API_KEY`，或设置环境变量 `OGM_API_KEY` |
| 状态行「余额失败：HTTP 401」 | key 无效/过期，到 [opencode.ai/auth](https://opencode.ai/auth) 重新生成 |
| 状态行「用量不可用」 | 未安装 opencode 或数据库缺失 —— 正常现象，余额不受影响 |
| 面板完全不显示 | 确认 `cordis.patch.yml` 注册行格式、`profiles/node_modules/dsh-opencode-go-monitor` 路径；浏览器硬刷新（Ctrl+Shift+R）；F12 控制台看红色报错 |
| 两个面板重叠 | 直接拖动分开即可（位置记忆） |

## 卸载

1. 从 `cordis.patch.yml` 删除注册行（热加载立即移除）
2. 删除 `profiles/node_modules/dsh-opencode-go-monitor/` 文件夹

## 结构

```
├── package.json      # 插件清单（dsh.client 双半声明）
└── lib/
    ├── index.js      # host 半：/api/opencode-go/balance（官方接口，凭据读 key，60s 缓存）
    │                 #       /api/opencode-go/usage（可选：本地 SQLite 只读聚合）
    └── client.js     # client 半：shell.overlay 悬浮面板（拖动/缩放/记忆）
```
