# Family Hub

A private family website for keeping on top of a child's health, nursery and EHC assessment information, and preparing for appointments.

**This repository contains no personal information, and must stay that way.** Every name, date and detail lives in a separate `case-data.json` file that is loaded on each phone or laptop and stays in that browser. Never upload `case-data.json` here: the repository is public. `.gitignore` blocks it, but files added through GitHub's "Add files via upload" bypass that, so check before uploading.

The app takes the child's name, the council and the names for the sleep diary from the data file (`child.shortName`, `child.localAuthority`, `child.carers`, `child.familyEmails`, and `ehcna.team` for the SEN team to write to). All can be changed in the app's Edit mode.

## First-time setup on each device

**iPhone / iPad**
1. Open the site in Safari, tap **Share → Add to Home Screen**.
2. Open it **from the new Home Screen icon** (Safari and the icon keep separate storage).
3. Tap **Load data file** and choose `case-data.json` from Files / iCloud Drive.

**Mac or PC**
1. Open the site and bookmark it.
2. Click **Load data file** and choose `case-data.json`.

## Updating the information

1. Edit `case-data.json` (or ask Claude in your private Claude project to update it).
2. On each device: **Data and backups → Load data file** and choose the new version.

## Your notes

Ticks, questions, notes and appointments you add in the app are saved on that device only. Use **Data and backups → Back up my notes / Restore notes** to copy them between devices.

## Files

All files sit at the top level of the repository (no folders):
`index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `logo.svg`, `favicon.svg`, `icon-192.png`, `icon-512.png`, `README.md`.

Publish with **Settings → Pages → Deploy from a branch → main → /(root)**.
