# market

A general-purpose Claude Code plugin onboarding skill. Users select the target marketplace in
their request or project/personal configuration. The skill does not default to its author's
marketplace or require access to the author's private repositories.

## Installation and usage

This marketplace distributes the plugin. In Claude Code, run:

```text
/plugin marketplace add myWsq/plugins
/plugin install market@plugins
/market:onboard Onboard this project's plugin into example-org/team-market using its contribution guide.
```

Replace `example-org/team-market` with your destination. The installation source and onboarding
target are independent. You can also supply a contract URL or a local maintenance checkout.

The skill reads the target's requirements, prepares the delivery directory, checks the version and
source, and follows its registration or update process. It supports both marketplaces referencing
external repositories and builders collecting plugin artifacts; delivery format, authentication,
and publication follow the target contract. With a maintenance checkout and appropriate access,
it can continue through edits and verification. Otherwise it produces materials for a maintainer.
When no target is specified or configured, it asks instead of choosing its distribution marketplace.

## Personal or project configuration

Record a default destination in existing personal instructions or a project AGENTS.md without
modifying the public skill. For example:

```markdown
## Plugin publication target

- Default marketplace: example-org/team-market
- Maintenance repository: example-org/team-market-builder
- Delivery contract: the contribution guide linked from the maintenance repository's README
```

This is an instruction example, not a required configuration file or fixed schema. The current
request takes precedence over defaults. Keep private addresses and personal release rules in your
own configuration; store credentials in secret storage rather than these instructions.

The skill does not bundle a copy of the target's contract. Complete onboarding requires access to
the target's requirements; unavailable documentation is reported as an unverified part of the work.
When publication is requested, the skill follows the target's documented entry point and actual
permissions rather than embedding repository-specific administrator operations. Delivery preparation,
update submission, acceptance, and publication are reported separately.

## License

MIT
