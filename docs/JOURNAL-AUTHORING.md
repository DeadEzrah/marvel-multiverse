# Marvel Journal Authoring

Marvel Multiverse styles every Foundry Journal window with a readable comic-book presentation. Ordinary headings, paragraphs, lists, links, tables, blockquotes, secrets, images, captions, and inline document links need no additional classes.

Adventure authors can use the stable `mm-journal-*` classes below for structured content. Add them through Foundry's HTML source editor. These classes affect Journal content only and do not depend on Foundry's internal application classes.

## Class Reference

| Class | Purpose |
|---|---|
| `mm-journal-kicker` | Short uppercase label above a title |
| `mm-journal-lead` | Larger introductory paragraph |
| `mm-journal-caption` | Muted caption or source note |
| `mm-journal-read-aloud` | Boxed text intended to be read to players |
| `mm-journal-callout` | General informational callout |
| `mm-journal-callout--success` | Success or favorable outcome variant |
| `mm-journal-callout--warning` | Warning or complication variant |
| `mm-journal-callout--danger` | Danger or critical consequence variant |
| `mm-journal-callout--narrator` | Narrator-only guidance variant |
| `mm-journal-check` | Structured check or challenge row |
| `mm-journal-check__label` | Name of the check |
| `mm-journal-check__value` | Target Number or other short value |
| `mm-journal-check__details` | Outcome, consequence, or instructions |
| `mm-journal-grid` | Responsive card grid |
| `mm-journal-card` | Card within a responsive grid |
| `mm-journal-card__title` | Card heading |
| `mm-journal-stat-block` | Compact responsive statistic summary |
| `mm-journal-stat-block__label` | Statistic label |
| `mm-journal-stat-block__value` | Statistic value |

Modifier classes are used together with their base class. For example:

```html
<div class="mm-journal-callout mm-journal-callout--warning">
  <strong>Escalation:</strong> Reinforcements arrive at the end of round 3.
</div>
```

## Adventure Opening

```html
<p class="mm-journal-kicker">Issue 1 · Opening Scene</p>
<h1>Attack on Midtown</h1>
<p class="mm-journal-lead">
  The heroes arrive as civilians flee a damaged intersection and an unstable
  device begins to overload.
</p>
```

## Read-Aloud Text

```html
<div class="mm-journal-read-aloud">
  A pulse of crimson energy races across the avenue. Streetlights burst,
  alarms begin to howl, and a figure rises from the smoke.
</div>
```

## Narrator Notes and Outcomes

```html
<div class="mm-journal-callout mm-journal-callout--narrator">
  <strong>Narrator:</strong> Do not reveal the controller until a hero examines
  the damaged device.
</div>

<div class="mm-journal-callout mm-journal-callout--success">
  <strong>Success:</strong> The evacuation route remains open.
</div>

<div class="mm-journal-callout mm-journal-callout--danger">
  <strong>Failure:</strong> Increase the encounter's escalation by 1.
</div>
```

## Checks

```html
<div class="mm-journal-check">
  <span class="mm-journal-check__label">Agility Check</span>
  <strong class="mm-journal-check__value">TN 14</strong>
  <span class="mm-journal-check__details">
    Success disables the device. Failure inflicts 10 Focus damage.
  </span>
</div>
```

## Responsive Cards

The grid automatically changes its column count to fit the Journal window.

```html
<div class="mm-journal-grid">
  <section class="mm-journal-card">
    <div class="mm-journal-card__title">Protect Civilians</div>
    <p>Move three civilian groups to the marked evacuation zone.</p>
  </section>
  <section class="mm-journal-card">
    <div class="mm-journal-card__title">Disable the Device</div>
    <p>Complete two successful Logic checks before round 4.</p>
  </section>
</div>
```

## Statistic Summary

```html
<div class="mm-journal-stat-block">
  <div>
    <span class="mm-journal-stat-block__label">Rank</span>
    <strong class="mm-journal-stat-block__value">4</strong>
  </div>
  <div>
    <span class="mm-journal-stat-block__label">Health</span>
    <strong class="mm-journal-stat-block__value">90</strong>
  </div>
  <div>
    <span class="mm-journal-stat-block__label">Focus</span>
    <strong class="mm-journal-stat-block__value">60</strong>
  </div>
  <div>
    <span class="mm-journal-stat-block__label">Damage Reduction</span>
    <strong class="mm-journal-stat-block__value">2</strong>
  </div>
</div>
```

## Authoring Guidance

- Use semantic headings in order: `h1`, then `h2`, then `h3`.
- Use Foundry secret sections for content that players must not see.
- Prefer standard tables for genuinely tabular information.
- Keep read-aloud boxes short enough to scan during play.
- Use `mm-journal-grid` instead of fixed-width columns.
- Do not use Foundry application classes such as `journal-entry-page`; those are owned by Foundry and may change between releases.
