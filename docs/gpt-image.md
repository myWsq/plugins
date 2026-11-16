# gpt-image

External plugin from [wuyoscar/gpt_image_2_skill](https://github.com/wuyoscar/gpt_image_2_skill),
collected from the `claude-plugin` delivery branch of the
[myWsq/GPT-Image2-Skill](https://github.com/myWsq/GPT-Image2-Skill) fork. The fork adds Image 2.6
SVG output (`--format svg`, `--svg-model`, `--svg-effort`), `--complexity`, and token usage
reporting, proposed upstream in
[PR #36](https://github.com/wuyoscar/GPT-Image2-Skill/pull/36). The delivery branch contains only
the runtime plugin; the gallery images stay upstream.

## Installation

```text
/plugin marketplace add myWsq/plugins
/plugin install gpt-image@plugins
```

## Runtime requirements

- Python 3.11+ and `uv`; the first run resolves `openai`, `python-dotenv` and `Pillow`.
- `OPENAI_API_KEY` from the environment, `./.env` or `~/.env`. Every generation bills that account.

## Updating

Rebuild the `claude-plugin` branch from the fork's source branch, bump the version in
`.claude-plugin/plugin.json`, then update `catalog/plugins/gpt-image.json` to the new commit SHA.
Once upstream ships the same features, the origin can point back at an upstream delivery.
