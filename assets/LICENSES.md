# Effect Asset Sources

No PSFX or JB2A media is bundled in this system. The files listed in
`generated-asset-index.json` remain installed-module dependencies.

| Source | Module ID | Distribution | Bundled |
| --- | --- | --- | --- |
| Peri's Sound Effects (PSFX) | `psfx` | Installed dependency; governed by `modules/psfx/PSFX_License_v1.1.pdf` | No |
| JB2A Free Content | `JB2A_DnD5e` | Installed dependency; governed by the module's own license | No |
| JB2A Patreon | `jb2a_patreon` | Supported installed dependency when a valid Patreon package is installed | No |
| Sequencer | `sequencer` | Runtime playback dependency | No |

The generated index contains paths and metadata only. It does not copy media.
External assets have not been downloaded or bundled. Any future external asset
must record its source, license, attribution requirements, and distribution
status here before inclusion.