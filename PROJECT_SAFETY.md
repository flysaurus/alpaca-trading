# Project Safety Protocol

## Active Project

File: `~/.openclaw/workspace/.active_project`

This file controls which project I will modify/deploy. I read it before every edit.

### Switching Projects

```bash
# Set active project to Kilimanjaro Dashboard
echo 'kilimanjaro-dashboard' > ~/.openclaw/workspace/.active_project

# Set active project to Alpaca Trading
echo 'alpaca-trading' > ~/.openclaw/workspace/.active_project
```

I will **ask for confirmation** before switching unless explicitly told.

## Pre-Deploy Check

Run before any Vercel deploy:

```bash
~/.openclaw/workspace/bin/check-project.sh && npx vercel --prod
```

This blocks deploys from the wrong folder.

## Separate Git Repos (Strongest Protection)

### Current State (Shared Repo)
- Both projects share `github.com:flysaurus/kilimanjaro-dashboard.git`
- Risk: cross-contamination, accidental pushes

### Target State (Separate Repos)
```
github.com:flysaurus/kilimanjaro-dashboard.git   ← health dashboard only
github.com:flysaurus/alpaca-trading.git           ← trading app only
```

### Your Manual Step (I Cannot Do This)

1. Go to https://github.com/new
2. Create repo: `alpaca-trading` (public or private)
3. Run these commands:

```bash
cd ~/.openclaw/workspace/alpaca-trading

# Remove link to shared repo
git remote remove origin

# Add new repo
git remote add origin git@github.com:flysaurus/alpaca-trading.git

# Push
git push -u origin master

# Verify
git remote -v
# Should show: origin  git@github.com:flysaurus/alpaca-trading.git
```

4. In Vercel: create **new project** from `alpaca-trading` repo
   - This gives it a separate deploy pipeline
   - Kilimanjaro dashboard won't be affected

## Commit Before Our Sessions

Run before we start working:

```bash
cd ~/.openclaw/workspace/kilimanjaro-dashboard
git add -A && git commit -m "pre-session checkpoint" || true

cd ~/.openclaw/workspace/alpaca-trading  
git add -A && git commit -m "pre-session checkpoint" || true
```

This gives you `git revert` or `git reset --hard` if something goes wrong.

## My Checklist (Internal)

Before any tool call, I will:
1. Read `.active_project`
2. Verify `pwd` matches
3. Announce target: "**Working on [project]**"
4. Confirm before switching projects
