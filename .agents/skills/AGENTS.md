# Skill Authoring Rules

Instructions under `.agents/skills/` extend, and must not contradict, the
repository rules in `../../AGENTS.md`.

When creating or updating a skill:

- Keep `SKILL.md` concise and task-triggered.
- For new project-specific skills, use YAML frontmatter with `name` and
  `description` only; do not rewrite imported skill metadata unnecessarily.
- Put detailed optional material in directly linked `references/` files.
- Do not duplicate repository-wide rules inside every skill.
- Keep coding guidance aligned with the current Admission CRM modules,
  permission model, schema, and Vietnamese UI requirement in root
  `AGENTS.md`.
