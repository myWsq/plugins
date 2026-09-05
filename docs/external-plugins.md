# 接入外部插件

插件源码留在所属项目中，plugins-builder 按固定 commit 收集已完成构建的插件目录，
生成独立 marketplace 仓库。安装者仅需访问 marketplace，无需访问上游仓库。
本地 `plugins/<name>/` 的片段展开和构建流程继续保留。

## 上游交付格式

在项目中提供一个独立、可直接安装的 Claude Code 插件目录：

```text
integrations/claude-plugin/
├── .claude-plugin/plugin.json
├── LICENSE
├── skills/                  # 可选
├── commands/                # 可选
├── agents/                  # 可选
├── hooks/hooks.json         # 有 hooks 目录时必需
├── .mcp.json                # 可选
├── scripts/                 # 可选，插件使用的运行脚本
└── README.md                # 建议提供使用说明
```

`plugin.json` 必须包含 kebab-case 的 `name`、严格 SemVer 的 `version`、非空
`description` 和 `author.name`。其余 Claude 原生字段直接保留，不由 builder 重写。
插件目录必须有自己的 `LICENSE`，不会被 builder 的许可证覆盖。允许只有 commands、
hooks 或 MCP 的插件，不强制存在 skills。

目录整体发布，包括辅助脚本、二进制资源和原始 manifest；文件字节及可执行位保留。
不得包含符号链接、Git 子模块、Git LFS 指针或秘密文件。单个文件上限为 32 MiB。常见凭据路径 `.env`、`.env.*`、`.npmrc`、
`.netrc`、`.ssh`、`.git` 会被拒绝；该检查不是通用秘密扫描，发布者仍须审查全部文件。
占位配置示例使用 `config.example.json` 等文件名。

上游负责提前编译、展开模板并提交最终插件目录。builder 不运行上游构建脚本、不安装依赖，
不展开外部插件里的 fragment 指令。插件不得依赖交付目录之外的源码文件；运行时外部程序、
服务和环境变量应在 README 中说明。不要把整个业务仓库作为交付目录。

## 登记来源

创建 `catalog/plugins/<name>.json`，例如：

```json
{
  "name": "project-a-tools",
  "category": "development",
  "origin": {
    "repository": "https://github.com/your-org/project-a.git",
    "path": "integrations/claude-plugin",
    "ref": "v1.2.0",
    "sha": "0123456789abcdef0123456789abcdef01234567"
  }
}
```

将名称加入 `catalog/marketplace.json.plugins`。上面的 SHA 是示例，必须换成上游真实的
40 位小写 commit SHA。`path` 可以为 `.`（专用插件仓库根目录），不能使用绝对路径或 `..`。
支持无凭据的 HTTPS URL 和 `git@host:owner/repo.git` SSH 地址。

外部 descriptor 仅接受 `name`、`category`、`origin`；版本、描述和作者由上游 manifest
提供，名称必须和 catalog 一致。`ref` 可选，仅用作供人阅读的版本标签；**SHA 是唯一锁定依据**，
构建不会解析 ref 或自动跟随新版本。完整 SHA 必须能从 Git 服务获取。

更新时，在上游提升插件版本并提交交付目录，再通过 PR 更新 builder 中的 SHA/ref，运行
`npm run verify` 并按现有 release 流程发布。分类等 marketplace 条目变化也要求上游插件
版本提升。第一版不自动发现版本、不自动创建更新 PR、不支持 release ZIP 来源。

来源声明保存在 builder 的版本历史中，不额外写入公开产物；公开 manifest 自身的
`repository`、README 等内容可能暴露上游地址，应由上游决定是否保留。

## 私有仓库认证

私有源码发布到公开 marketplace 时，**选中的整个插件目录会公开**，其余源码不会被收集。
若插件也需保持私有，marketplace 仓库同样应设为 private。

本地使用已有 Git credential helper 或 SSH agent。GitHub HTTPS 来源还支持环境变量
`PLUGIN_SOURCE_TOKEN`，可由秘密管理工具注入；不要把 token 写入 URL、catalog 或文件。
该变量仅发送给 `https://github.com/` 来源。SSH 来源使用现有 agent 和 known_hosts；
builder 不关闭主机校验。非 GitHub 私有来源使用对应 Git credential helper/SSH 配置。

Actions 推荐使用 GitHub App：

1. 创建只授予仓库 **Contents: read** 的 App，并安装到需要收集的来源仓库。
2. 设置 builder Actions variables：`PLUGIN_SOURCE_APP_ID`、`PLUGIN_SOURCE_OWNER`
   （来源仓库所属用户或组织）、`PLUGIN_SOURCE_REPOSITORIES`（逗号或换行分隔的仓库名称）。
   明确列出仓库，避免授予不必要的访问范围；第一版一个 App token 对应一个 owner。
3. 将 App 私钥保存为 Actions secret `PLUGIN_SOURCE_APP_PRIVATE_KEY`。

verify/release workflow 会生成短期只读 token，仅传入真实 catalog 构建步骤。
也可以不配置 App，改用具有来源仓库 Contents 读取权限的 fine-grained token，存入
`PLUGIN_SOURCE_TOKEN` secret。默认 `GITHUB_TOKEN` 不具有其他 private 仓库的访问权。
这套读取凭据独立于写入市场的 `MARKETPLACE_REPO_SSH_KEY`，禁止复用发布 deploy key。

同仓库 PR 的代码必须可信，因为其构建步骤可以访问 Actions secrets。fork PR 不会获得
来源凭据；存在私有来源时，其 catalog build 会明确失败，维护者应在审查后使用可信分支验证。
不要改用 `pull_request_target` 执行未经审查的 PR 代码。

## 校验边界

构建检查来源锁定、目录边界、真实文件、manifest 必需字段、名称与版本、LICENSE 及
hooks/MCP/LSP 配置 JSON 语法。它不替代 Claude Code 全量 schema 校验或安装烟测，也不保证
运行时脚本与外部服务可用。提取失败或校验失败不会替换上次成功的 dist。

发布门禁比较整个插件目录与 marketplace 条目：新增 commands、MCP 配置或辅助资源等
任何变化都要求插件版本严格增加。本地测试使用临时 Git 仓库，无需网络或私有凭据。
