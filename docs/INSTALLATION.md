# Installation and Updates

This guide installs the maintained Marvel Multiverse fork and its optional encounter suite on Foundry VTT 14.

## Components

Install only the system for normal Marvel Multiverse play. Add the modules in this order when you want encounter orchestration:

1. `marvel-multiverse` system
2. `marvel-encounter-framework` module
3. `marvel-character-library` module for packs that spawn library Actors
4. `marvel-encounter-packs` module

Sequencer, JB2A, PSFX, and FXMaster are optional visual providers.

## Install from Package Manifests

In Foundry Setup, open **Add-on Modules**, select **Install Module**, and install these manifests in order:

```text
https://raw.githubusercontent.com/DeadEzrah/marvel-encounter-framework/main/module.json
https://raw.githubusercontent.com/DeadEzrah/marvel-character-library/main/module.json
https://raw.githubusercontent.com/DeadEzrah/marvel-encounter-packs/main/module.json
```

The framework and character library must be available before Foundry can enable the encounter packs.

## Find the Foundry User Data Folder

Open Foundry Setup, select **Configure**, and inspect **User Data Path**.

The default Windows path is:

```text
%LOCALAPPDATA%\FoundryVTT\Data
```

Systems belong in `Data\systems`. Modules belong in `Data\modules`.

## Install the System from Git

Close Foundry before replacing or updating system files.

```powershell
$data = Join-Path $env:LOCALAPPDATA "FoundryVTT\Data"
git clone https://github.com/DeadEzrah/marvel-multiverse.git `
  (Join-Path $data "systems\marvel-multiverse")
Set-Location (Join-Path $data "systems\marvel-multiverse")
npm install
npm run build
```

The destination folder must be named `marvel-multiverse`, and `system.json` must be directly inside that folder.

## Install the Encounter Framework

```powershell
$data = Join-Path $env:LOCALAPPDATA "FoundryVTT\Data"
git clone https://github.com/DeadEzrah/marvel-encounter-framework.git `
  (Join-Path $data "modules\marvel-encounter-framework")
```

The framework is optional. Enable **Marvel Encounter Framework** under **Manage Modules** after creating or opening a Marvel Multiverse world.

## Install Encounter Packs

```powershell
$data = Join-Path $env:LOCALAPPDATA "FoundryVTT\Data"
git clone https://github.com/DeadEzrah/marvel-encounter-packs.git `
  (Join-Path $data "modules\marvel-encounter-packs")
```

Some packs reference Actor UUIDs from **Marvel Character Library**. Install and build the library before enabling actor-spawning packs:

```powershell
$data = Join-Path $env:LOCALAPPDATA "FoundryVTT\Data"
git clone https://github.com/DeadEzrah/marvel-character-library.git `
  (Join-Path $data "modules\marvel-character-library")
Set-Location (Join-Path $data "modules\marvel-character-library")
npm install
npm run build
```

The public library is limited to original, generic, or redistribution-approved Actors. A private/local character vault may be used for personal campaign conversions, but it is not part of the public installation and public encounter packs must not depend on it.

Enable the modules in this order:

1. Marvel Encounter Framework
2. Marvel Character Library
3. Marvel Encounter Packs

## Optional Visual Modules

The encounter and rules engines continue to work when visual modules are absent.

- **Sequencer** provides effect playback.
- **JB2A** provides animation assets.
- **PSFX** provides optional sound assets.
- **FXMaster** provides scene-wide particles and filters.
- **FXMaster+** is automatically preferred when installed, with FXMaster core fallbacks otherwise.

FXMaster is recommended, not required.

## Update a Git Installation

Close Foundry, then update each cloned component:

```powershell
Set-Location "$env:LOCALAPPDATA\FoundryVTT\Data\systems\marvel-multiverse"
git pull --ff-only
npm install
npm run build

Set-Location "$env:LOCALAPPDATA\FoundryVTT\Data\modules\marvel-encounter-framework"
git pull --ff-only

Set-Location "$env:LOCALAPPDATA\FoundryVTT\Data\modules\marvel-character-library"
git pull --ff-only
npm install
npm run build

Set-Location "$env:LOCALAPPDATA\FoundryVTT\Data\modules\marvel-encounter-packs"
git pull --ff-only
```

Restart Foundry after updating. If Foundry offers to back up and migrate the world after a system version change, create the backup before continuing.

## First-Run Check

1. Start Foundry and verify that **Marvel Multiverse** appears under **Game Systems**.
2. Create or launch a world using the Marvel Multiverse system.
3. Open **Manage Modules** and enable the installed companion modules.
4. Refresh the world.
5. Click the burst icon beside **Settings** to open the Marvel Encounter Framework dashboard.
6. Activate **City Intersection Crisis**.
7. Advance Building Integrity to 4/6 and confirm the Critical Damage phase.
8. Reset the encounter and confirm optional FXMaster effects are removed.

## Troubleshooting

### Foundry cannot find the package

Confirm the package manifest is not nested one directory too deep:

```text
Data\systems\marvel-multiverse\system.json
Data\modules\marvel-encounter-framework\module.json
```

### The manifest installer reports a download error

Verify that the manifest URL uses `raw.githubusercontent.com/DeadEzrah` and that the version's GitHub release is published. If a newly updated branch manifest temporarily precedes its matching release archive, use the Git installation steps above until publishing completes.

### Encounter actors do not spawn

Install and enable Marvel Character Library. Packs that do not require library Actors can still run without it.

### Visual effects do not play

Confirm the relevant visual module is enabled in the world. Visual failures do not block encounter rules, clocks, phases, damage, or conditions.
