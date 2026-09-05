# External plugin sources

Plugin source stays in its owning project. plugins-builder collects an already-built plugin
directory at a pinned commit and generates a separate marketplace repository. Installers need
access only to the marketplace, not the upstream repository. Local `plugins/<name>/` compilation
and fragment expansion remain supported.

## Upstream delivery format

Provide a self-contained, directly installable Claude Code plugin directory:

```text
integrations/claude-plugin/
├── .claude-plugin/plugin.json
├── LICENSE
├── skills/                  # Optional
├── commands/                # Optional
├── agents/                  # Optional
├── hooks/hooks.json         # Required when hooks/ exists
├── .mcp.json                # Optional
├── scripts/                 # Optional runtime scripts
└── README.md                # Recommended usage instructions
```

`plugin.json` must contain a kebab-case `name`, strict SemVer `version`, and non-empty `description`
and `author.name`. Other native Claude fields are preserved without rewriting. Each plugin must
include its own `LICENSE`; the builder does not replace it with the builder's license. Plugins
containing only commands, hooks, or MCP configuration do not need a skills directory.

The entire directory is published, including auxiliary scripts, binary resources, and the original
manifest. File bytes and executable bits are preserved. Symlinks, Git submodules, Git LFS pointers,
and secret files are prohibited. Individual files are limited to 32 MiB. Common credential paths
`.env`, `.env.*`, `.npmrc`, `.netrc`, `.ssh`, and `.git` are rejected. This is not a general secret
scanner; publishers must review every delivered file. Use names such as `config.example.json`
for placeholder configuration examples.

Upstream must compile, expand templates, and commit the final directory before registration. The
builder neither runs upstream build scripts nor installs dependencies or expands external fragment
directives. Plugins must not depend on source files outside the delivery directory. Document runtime
programs, services, and environment variables in the README. Do not deliver an entire application repo.

## Register a source

Create `catalog/plugins/<name>.json`, for example:

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

Add the name to `catalog/marketplace.json.plugins`. Replace the example SHA with a real, lowercase,
40-character upstream commit SHA. `path` may be `.` for a dedicated plugin repository's root; absolute
paths and `..` are prohibited. Credential-free HTTPS and `git@host:owner/repo.git` SSH URLs are supported.

External descriptors accept only `name`, `category`, and `origin`. Version, description, and author
come from the upstream manifest, whose name must match the catalog. The optional `ref` is a label
for readers; **SHA is the only pin**. Builds do not resolve refs or follow new versions automatically.
The Git server must allow fetching the full pinned SHA.

For updates, bump the upstream plugin version and commit the delivery directory, then update the
builder's SHA/ref through a PR. Run `npm run verify` and use the existing release process. Marketplace
entry changes, including category, also require an upstream plugin version bump. The initial version
does not discover updates automatically, create update PRs automatically, or accept release ZIP sources.

Source declarations remain in the builder's version history and are not added to public artifacts.
The upstream manifest's `repository`, README, or other delivered files may expose the upstream address;
the upstream publisher decides whether to include it.

## Private repository authentication

Publishing a private source into a public marketplace **makes the entire selected plugin directory
public**. Other source files are not collected into the plugin. Keep the marketplace private too if
the plugin must remain private.

Locally, use an existing Git credential helper or SSH agent. GitHub HTTPS sources also support the
`PLUGIN_SOURCE_TOKEN` environment variable, which a secret manager can inject. Never put tokens in
URLs, catalog files, or artifacts. This token is sent only to `https://github.com/` sources. SSH uses
the existing agent and known_hosts; the builder does not disable host verification. Non-GitHub
private sources use their own Git credential helper or SSH configuration.

For Actions, a GitHub App is recommended:

1. Create an App with only repository **Contents: read** permission and install it on the source repos.
2. Set builder Actions variables `PLUGIN_SOURCE_APP_ID`, `PLUGIN_SOURCE_OWNER` (the source owner or
   organization), and `PLUGIN_SOURCE_REPOSITORIES` (comma- or newline-separated repository names).
   List repositories explicitly to limit access. The initial integration uses one owner per App token.
3. Store the App private key in the `PLUGIN_SOURCE_APP_PRIVATE_KEY` Actions secret.

The verify and release workflows mint a short-lived read-only token and pass it only to the real
catalog build step. Alternatively, omit the App configuration and store a fine-grained token with
source Contents read access in the `PLUGIN_SOURCE_TOKEN` secret. The default `GITHUB_TOKEN` cannot
read other private repositories. Source read credentials are separate from the marketplace's
`MARKETPLACE_REPO_SSH_KEY`; never reuse the publishing deploy key.

Same-repository PR code must be trusted because its build can access Actions secrets. Fork PRs do
not receive source credentials. With private sources, their catalog build fails explicitly; review
the changes before validating on a trusted branch. Do not use `pull_request_target` to execute
unreviewed PR code.

## Validation boundaries

The builder checks source pins, directory boundaries, real files, required manifest fields, names,
versions, LICENSE, and JSON syntax for hooks/MCP/LSP configuration. It does not replace complete
Claude Code schema validation or installation smoke tests, nor guarantee runtime scripts and
external services work. Fetch or validation failures preserve the last successful dist.

The release gate compares the entire plugin directory and marketplace entry. Changes to commands,
MCP configuration, auxiliary resources, or any other payload require a strictly greater plugin
version. Local tests use temporary Git repositories and need neither network access nor private
credentials.
