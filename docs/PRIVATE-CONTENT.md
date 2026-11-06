# Private Sourcebook Content

Personal sourcebook-derived records must remain outside the public system compendiums and Git history.

Use the ignored `.private-content/` directory at the repository root for private working data, exports, notes, and local pack sources. Nothing in that directory is included by Git or the normal public pack build.

Recommended layout:

```text
.private-content/
  secret-wars/
  avengers/
  spider-verse/
  x-men/
  exports/
```

Store concise mechanical facts and original summaries rather than copied book prose. Private records can use the system's Gear, Alternate Form, Headquarters, Campaign Framework, team-maneuver, vehicle, starship, and Rank X fields.

Before publishing or committing changes:

1. Run `git status --short`.
2. Confirm no private record was copied under `packs/_source/`.
3. Keep public tests generic and independent of private records.
4. Export personal records directly to a private Foundry world or a separately maintained local-only module.

The public system must never require files from `.private-content/`.
