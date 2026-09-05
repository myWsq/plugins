---
name: onboard
description: "Onboard project-owned Claude Code plugins into a user-selected marketplace using its delivery contract. Use when preparing a plugin for a marketplace, registering a public or private source, or updating a registered version. Resolve the target from the current request or existing user configuration."
---

# Onboard a plugin into a marketplace

Prepare the plugin in its owning project, then follow the target marketplace's registration or
update process. Do not assume a marketplace address, maintenance repository, credential name,
or release command.

## Resolve the target and contract

Prefer the target explicitly named in the current request. Otherwise use marketplace settings
explicitly recorded in the project or already-loaded personal instructions, such as an applicable
AGENTS.md containing the marketplace, maintenance repository, and contribution guide.
The current project's Git remote identifies the plugin source, not the destination. Neither this
skill's distribution marketplace nor its installation cache determines the target. If the target
is missing or ambiguous, ask which marketplace to use while continuing local plugin discovery.

Read the supplied contract or the contribution documentation linked from the target's README.
The contract may be an accessible URL or a user-specified local file. Read the applicable AGENTS.md
when working in a maintenance checkout. Do not guess documentation paths, descriptor schemas,
branches, or CI workflows. If a private contract is inaccessible, explain the access gap and
complete independent local checks; do not substitute another marketplace's requirements.

Determine whether the target references plugins through a native marketplace index, collects
already-built plugin directories, or supports another documented delivery mechanism. Distinguish
editable source from generated marketplace output and register changes at the authoritative source.
Report the contract used rather than maintaining a separate copy of its rules.

## Prepare the plugin

Inspect project conventions, Git remotes, existing plugin directories, and build tooling. Reuse
an installable directory where available; otherwise choose a location under the target contract.
Avoid treating the entire application repository as the plugin payload.

Check the manifest, version, license, components, and resource references against the contract.
Respect existing names and licenses; do not invent a public license for unlicensed private code.
Distinguish native Claude Code requirements from additional marketplace rules rather than treating
one builder's restrictions as universal.

For a target that collects built directories, finish the build in the source project and include
all required runtime files. Do not assume the marketplace executes upstream build scripts. For
Git subdirectory references, verify that the selected directory can be installed independently.
Check path boundaries, document external runtime dependencies, and handle symlinks, submodules,
and large files according to the contract.

A private source does not imply private artifacts. Explain the publication scope and installer
access requirements for the target's reference or copy mechanism. Copying into a public marketplace
publishes the selected directory. Respect established publication intent; ask about visibility only
when it remains unclear and changes the delivery scope. Do not change repository visibility yourself.

## Versions and authentication

Provide the version, ref, or immutable commit SHA required by the target. When pinning Git content,
verify that the referenced commit contains the final tracked delivery files and is available from
the registered remote. Do not present uncommitted changes as the contents of HEAD, or register an
unpushed commit or example value as an available source.

For updates, compare the registered source and published version and follow the target's version
rules. Moving a tag alone does not establish that installed users will receive an update. The
contract determines which metadata is authoritative and whether the index repeats it.

Use the target's supported authentication mechanism and required permissions for private sources.
Keep credentials in user or CI secret storage, never in plugin files, source URLs, registration
configuration, or PR bodies. Do not guess secret names or require access to the skill author's
repositories. Report source access as verified only after a successful live check.

## Register, verify, and hand off

Update the target's authoritative index or source configuration under its contribution rules.
Check naming conflicts and preserve unrelated plugins. Run documented builds, version gates, and
installation checks, reporting each verification actually completed. Do not edit a generated
marketplace repository; if the index itself is authoritative, update it through its contribution flow.

If only the source project is accessible, prepare the deliverable and provide usable configuration
or a patch for the maintainer, identifying any missing access, real revision, or registration step.
Do not grant marketplace administration privileges merely to complete onboarding.

Continue with commits, pushes, PRs, and releases according to the current request and existing
permissions. When publication is requested and the target has a documented release entry point,
use it and track the result. Installing this skill does not grant release authority. Without that
authority, submit an update through the contribution process rather than bypassing review. For a
request that only asks how onboarding works, explain the requirements without modifying the project.

Report the target marketplace, delivery directory, plugin name and version, source and pinned
revision, registration location, verification results, and outstanding steps. Distinguish delivery
prepared, request submitted, plugin accepted, and version published.
