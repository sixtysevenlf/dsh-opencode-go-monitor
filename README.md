# 省钱+余额监控悬浮窗（dsh-opencode-go-monitor）

DSH（DeepSeek Harness）Web UI 悬浮面板插件：**三标签页** 实时显示 DeepSeek、**阿里百炼** 与 **OpenCode Go** 的额度余额（标签切换带滑动+淡入动画）。

- **三标签页**：DeepSeek 余额 / 阿里百炼余额 / OpenCode Go 余额，点击切换，带方向滑动 + 淡入动画
- OpenCode Go 页：**月度 / 滚动 / 每周** 三档额度：剩余 %（绿≥50% / 橙≥25% / 红<25%）+ 进度条 + 已用 % + 重置时间
- DeepSeek 页：余额、预计剩余 tokens（按**实际日均单价自动估算**，官网平台数据可用时用 日均花费 ÷ 日均 token，否则回退 0.12 元/百万）、当前模型、**官网平台用量**（当月 token 总量 / 花费金额 / API 请求次数 / 日均）
- 阿里百炼页：阿里云账号余额（BSS `QueryAccountBalance`，需 `ALIBABA_ACCESS_KEY_ID` / `ALIBABA_ACCESS_KEY_SECRET`）
- 可**拖动**（位置记忆）、右下角**调整大小**（尺寸记忆）
- 轮询：DeepSeek 每 30s、阿里百炼每 60s、OpenCode Go 每 60s、官网用量每 30s

## 省钱功能

- **DeepSeek 官方高低价时段**（自动展示）：高峰 = 北京时间 **09:00-12:00 / 14:00-18:00**，其余为空闲时段（**半价**）；面板显示当前时段状态与距下次切换倒计时（DeepSeek 页，纯时间计算）
- **限额**（金额 + tok 量，DeepSeek 页）：
  - 「省钱」开关：显示 **每日金额 / 每日 tok** 两条进度条（今日用量来自官网平台），超限红色告警（金额超限 / tok 超限分别提示）
  - 「分析」按钮循环切换两种模式（设置里也有选择）：
    - **关**：仅手动限额
    - **官网用量分析**：基于**官网平台当月数据**（活跃日平均）——每日建议 = 官网日均 token / 金额；每小时建议 = 日均 ÷ 24；高价时段 2 倍价建议每小时用量**减半**
  - 分析建议显示在悬浮窗，点「采纳」一键套用到**手动限额**（分析模式永不自动修改限额）：每日 tok=官网日均、每日金额=官网日均金额
- **金额来源**：全部金额来自 **DeepSeek 官网平台**（/api/v0/usage/cost，人民币），不再采用本地网关记账或本地推算
- **官网平台用量**（DeepSeek 页，可选）：配置凭据 `DEEPSEEK_PLATFORM_TOKEN`（登录 platform.deepseek.com 后，浏览器 DevTools → 存储 → Local Storage → `userToken` 的值）后，显示**官网当月** token 总量 / 花费金额 / API 请求次数与日均（官方控制台私有端点 /api/v0/usage/amount|cost）；未配置时显示提示。用量数据**全部以官网为准**（已移除本地 opencode 记录）
  - **金额单位**：设置 → 常规可选「人民币 ¥ / 美元 $」，全部金额（余额、今日/累计花费、限额、建议金额）统一按所选单位换算显示；汇率自动获取（USD→CNY，失败时用默认值）
  - **高价区每小时限额**：设置 → 常规：`高价区每小时 tok 上限(手动，高峰自动减半)`——填**基准每小时**（= 官网日均 ÷ 24），**高峰时段（09-12/14-18）自动减半**即高价区生效上限；小时颗粒度 = **官网日数据定基准 + 本地 session 事件推算实时增量**（监听每轮 agent 请求的 provider token 用量累计当前小时）；面板「小时」进度条显示当前小时 token / 生效限额，接近或超限有红色告警与语音提醒（小时超限不拦截请求，仅提醒）
  - 设置 → 常规：`每日金额上限(手动)` / `每日 tok 上限(手动)` / `高价区每小时 tok 上限(手动，高峰自动减半)` 手动输入 + 金额单位 + 分析模式选择
- **额外功能：超限断点截断**（默认关，开启前有确认警告）：今日金额或 tok 超限后，模型回复允许**完整生成并执行工具调用**（工具请求是天然断点），随后拦截后续请求——**不截断思考链、不回传异常 reasoning context**；超限后 agent 不再响应新请求，调整限额或关闭本功能即恢复（今日用量 = 官网平台；官网日统计未结算时今日为 0，不触发拦截）
- **额外功能：低耗压缩（工具结果只留变化）**（默认关，开启前有确认警告）：高峰时段（09-12 / 14-18，可关）且用量达到阈值（默认 80%）时，较长工具结果自动与上次执行结果做**行级 diff，只保留变化行**（完全相同则只剩一句"无变化"），大幅降低上下文与花费；开启弹窗会提醒与断点截断**搭配使用最佳**（压缩先省输入、超限再硬停）
- **语音提醒（TTS）**：接近限额（剩余 ≤2%）小音量提醒、达到限额大音量提醒；音量可调（接近 0-1 / 超限 0-10），带「试听」按钮（先接近后超限连播）

> 本插件已合并原「余额悬浮窗」（dsh-balance-window）的面板，部署时请将旧插件注册改为 `disabled`（见安装步骤），避免两个面板重叠。

风格与 DSH 自带「余额悬浮窗」（dsh-balance-window，DeepSeek 余额）一致。

## 隐私说明（重要）

- **不依赖本地 opencode**：不读取任何 opencode 配置文件；用量/金额全部来自 **DeepSeek 官网平台**
- API key / token 来源（按优先级）：
  1. **DSH 凭据系统**：写在 `$DSH_HOME/.credentials.yaml` 本地文件（设置 → 凭据）
  2. 环境变量兜底
- key/token 只在进程内存中使用，用于调用官方接口，**不落盘、不写日志、不发给任何第三方**
- 仓库内不含任何密钥 —— **每个部署者在自己的机器上配置自己的凭据，看到的是自己的余额与官网用量**

## 前置条件

| 依赖 | 说明 |
| --- | --- |
| DeepSeek Harness（web 或桌面端） | 插件运行在 DSH 内 |
| DeepSeek API key | DSH **设置 → 凭据** 添加 `DEEPSEEK_API_KEY`（DeepSeek 余额标签页用） |
| OpenCode Go 订阅 + API key | DSH **设置 → 凭据** 添加 `OPENCODE_GO_API_KEY`（在 [opencode.ai/auth](https://opencode.ai/auth) 获取） |
| 阿里云 AccessKey | DSH **设置 → 凭据** 添加 `ALIBABA_ACCESS_KEY_ID` 和 `ALIBABA_ACCESS_KEY_SECRET`（阿里百炼余额标签页用；需有 `bss:QueryAccountBalance` 权限） |
| **DeepSeek 官网登录会话 token** | DSH **设置 → 凭据** 添加 `DEEPSEEK_PLATFORM_TOKEN`（**查看自己官网用量/金额/小时粒度的必需项**，获取方法见下） |

## 安装

### 文件分享安装（zip 包，最简单）

拿到 `dsh-opencode-go-monitor-1.0.0.zip`（30 KB 单文件，可直接用微信/QQ/U 盘分享）后：

1. **解压**得到 `dsh-opencode-go-monitor/` 文件夹（内含 `package.json`、`lib/`、`README.md`）
2. 把整个文件夹**复制到** `$DSH_HOME/profiles/node_modules/` 下（Windows 默认 `C:\Users\<你>\.dsh\profiles\node_modules\`）
3. 编辑 `$DSH_HOME/profiles/web/cordis.patch.yml`（没有则新建，内容为 `[]`），追加：

   ```yaml
   # 省钱+余额监控悬浮窗
   - insert:
       - id: opencode-go-monitor
         name: 'dsh-opencode-go-monitor'
   ```

4. 保存后**热加载**生效，浏览器硬刷新（Ctrl+Shift+R）即可看到悬浮窗
5. 配置凭据：见下方「前置条件」与「获取 DEEPSEEK_PLATFORM_TOKEN」（登录过官网的浏览器一般会自动读取，零配置）

> zip 包内不含任何密钥；需要升级时用新 zip 覆盖 `lib/` 与 `package.json` 再刷新即可（或删掉旧文件夹重新解压）。

### 从 GitHub 获取

```bash
git clone https://github.com/<owner>/dsh-save-balance-monitor.git dsh-opencode-go-monitor
```

clone 出来的 `dsh-opencode-go-monitor/` 就是插件文件夹（含 `package.json` 和 `lib/`），按下方方式一或方式二安装即可。所有密钥都不在仓库里，需要**你自己配置**（见上文「前置条件」与「获取 DEEPSEEK_PLATFORM_TOKEN」）。

### 方式一：标准流程（推荐，热加载）

1. 把插件文件夹（含 `package.json` 和 `lib/`）整个复制到 `$DSH_HOME/profiles/node_modules/dsh-opencode-go-monitor/`

   `$DSH_HOME` 默认位置：Windows `~\.dsh`；macOS / Linux `~/.dsh`（可用 `echo $DSH_HOME` 确认）

2. 编辑 `$DSH_HOME/profiles/web/cordis.patch.yml`（没有则新建，内容为 `[]`），追加：

   ```yaml
   # OpenCode Go 余额悬浮窗
   - insert:
       - id: opencode-go-monitor
         name: 'dsh-opencode-go-monitor'
   ```

3. `cordis.patch.yml` 修改会**热加载**，无需重启；刷新浏览器页面（Ctrl+Shift+R）即可看到面板

4. 配置凭据：DSH **设置 → 凭据** → 添加 `DEEPSEEK_API_KEY`、`OPENCODE_GO_API_KEY`，以及 `DEEPSEEK_PLATFORM_TOKEN`（官网用量必需，见下）

5. 若旧版「余额悬浮窗」（`dsh-balance-window`）还注册着，把它的 `insert:` 块替换为禁用条目：

   ```yaml
   - id: balance-window
     disabled: true
   ```

### 获取 DEEPSEEK_PLATFORM_TOKEN（查看自己官网用量/金额）

DeepSeek 官网控制台的用量/金额端点需要登录会话 token（API key 认证不了）。**每个用户都要用自己的**。

**插件会先尝试自动读取**：启动后自动扫描本机 Chrome / Edge / 360 极速浏览器（含各 profile）的 Local Storage，找到 platform.deepseek.com 域下的 userToken 并**用官网实体验证**后直接使用——**只要你在这些浏览器里登录过官网，通常无需任何手动配置**（读到的 token 只在内存中使用，不落盘、不写凭据文件）。

> ⚠ 自动读取是"尽力而为"：token 若被浏览器压缩进 LevelDB 的 snappy 块（旧数据），可能读不到。此时按下面手动配置一次即可（读不到时面板会有提示）。

**手动配置（自动读取无效时）**：

1. 用任意浏览器（Chrome / Edge / 360 极速「极速模式」）登录 **https://platform.deepseek.com**
2. 打开开发者工具：**F12**（或右键 → 检查）
3. 切到 **Application / 应用程序 → Local Storage / 本地存储 → `https://platform.deepseek.com`**
4. 找到键 **`userToken`**，复制它的值（很长一串，`eyJ...` 开头）
   - 若找不到：切到 **Console / 控制台**，输入 `localStorage.getItem('userToken')` 回车，复制引号里的内容
5. 把这段值填到 **DSH 设置 → 凭据 → `DEEPSEEK_PLATFORM_TOKEN`**（或写进 `~/.dsh/.credentials.yaml`：`DEEPSEEK_PLATFORM_TOKEN: <值>`）
6. 面板 DeepSeek 页 **30 秒内**出现「官网当月」行（token 总量 / 花费 / 请求次数 / 日均）即成功

> ⚠ token 与你的官网登录会话绑定：**退出登录、清理浏览器缓存后失效**，重新按上面取一次即可。token 只存在你自己机器的凭据文件里，绝不提交进代码/仓库。

### 方式二：super-injector（如果装有）

```text
dev_install_package dir=<本文件夹绝对路径>
```

## 自定义（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OGM_API_KEY` | — | OpenCode Go 备用 key（无 DSH 凭据时使用） |
| `OGM_PLATFORM_TOKEN` | — | DeepSeek 官网 userToken 备用（无 DSH 凭据时使用） |
| `OGM_BASE` | `https://opencode.ai/zen/go/v1/usage` | 余额接口地址 |

## 排错

| 现象 | 处理 |
| --- | --- |
| 状态行「余额失败：未配置 OPENCODE_GO_API_KEY 凭据」 | DSH 设置 → 凭据 添加 `OPENCODE_GO_API_KEY`，或设置环境变量 `OGM_API_KEY` |
| 状态行「余额失败：HTTP 401」 | key 无效/过期，到 [opencode.ai/auth](https://opencode.ai/auth) 重新生成 |
| 面板 DeepSeek 页「官网用量: 未配置 DEEPSEEK_PLATFORM_TOKEN 凭据」 | 按上文「获取 DEEPSEEK_PLATFORM_TOKEN」配置 |
| 面板「官网用量: Platform token 无效或已过期」 | token 失效，重新从浏览器 localStorage 取新的 |
| DeepSeek 余额显示为负 | 账户余额已用超，注意在 [platform.deepseek.com](https://platform.deepseek.com) 充值 |
| 面板完全不显示 | 确认 `cordis.patch.yml` 注册行格式、`profiles/node_modules/dsh-opencode-go-monitor` 路径；浏览器硬刷新（Ctrl+Shift+R）；F12 控制台看红色报错 |
| 两个面板重叠 | 直接把其中一个拖开即可（位置记忆） |

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
