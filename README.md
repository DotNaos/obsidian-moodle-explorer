# Obsidian Explorer Plugin

Obsidian desktop plugin for browsing Moodle course files and downloading them into the current vault.

This repository is intentionally standalone so it can be shared and installed through tools like BRAT without depending on the `moodle-cli` source tree layout.

## What it does

- shows semesters, courses, sections, and files in a side panel
- downloads files through the installed `moodle` command
- opens files directly when they are already present in the vault
- refreshes Moodle login from inside Obsidian

## Development

Install dependencies:

```sh
npm install
```

Build the plugin:

```sh
npm run build
```

This writes `main.js` into this plugin folder. `manifest.json` and `styles.css` stay here as source files and are used directly by Obsidian.

## Use from a local vault

Symlink your vault plugin directory to this folder:

```sh
ln -s /Users/oli/projects/moodle/obsidian-moodle-explorer /path/to/vault/.obsidian/plugins/school-download-panel
```

Then reload Obsidian.

## BRAT direction

The goal of this standalone repo is simple BRAT installation from GitHub later on.
For that, keep `manifest.json`, `main.js`, and `styles.css` at the repo root.

## Verify against a vault

```sh
npm run verify -- /absolute/path/to/vault
```
