# gpt-image (Claude Code plugin delivery)

Self-contained Claude Code plugin build of
[wuyoscar/gpt_image_2_skill](https://github.com/wuyoscar/gpt_image_2_skill), including
Image 2.6 SVG output and complexity control
([upstream PR #36](https://github.com/wuyoscar/GPT-Image2-Skill/pull/36)).
This branch contains only what the plugin needs at runtime; the prompt gallery images
stay in the source repository.

Built from `myWsq/GPT-Image2-Skill@feat/svg-output`.

## Install

```
/plugin install gpt-image --marketplace myWsq/plugins
```

## Contents

- `skills/gpt-image` — generate and edit images with GPT Image 2 / 2.5 / 2.6
  (PNG, JPEG, WebP, native GIF, editable SVG), plus the reference gallery.
- `skills/get-prompt-from-image` — reverse-engineer prompts from reference images.
- `src/gpt_image_cli` — the CLI the skill calls through `skills/gpt-image/scripts/generate.py`.

## Runtime requirements

- Python 3.11+ and [`uv`](https://docs.astral.sh/uv/) (resolves `openai`, `python-dotenv`, `Pillow` on first run).
- `OPENAI_API_KEY`, read from the process environment, then `./.env`, then `~/.env`.
  Calls bill the OpenAI account behind that key.

## SVG example

```bash
uv run skills/gpt-image/scripts/generate.py --model gpt-image-2.6-flare \
  --format svg --quality low -p "Flat vector fox app icon, no text" -f fox.svg
```

`--svg-model` selects the text model that authors the SVG (default `gpt-6.1-sol`).
Token usage for the reference image and the SVG author is printed on stderr.

## License

MIT, see `LICENSE` (upstream copyright retained).
