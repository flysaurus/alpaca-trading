#!/bin/bash
# Pre-deploy safety check: ensures we're deploying the right project

ACTIVE_FILE="/root/.openclaw/workspace/.active_project"
EXPECTED=$(cat "$ACTIVE_FILE" 2>/dev/null | tr -d '[:space:]')

if [ -z "$EXPECTED" ]; then
    echo "❌ ERROR: No active project set. Run: echo 'project-name' > /root/.openclaw/workspace/.active_project"
    exit 1
fi

# Get current directory name
CWD=$(basename "$PWD")

if [ "$CWD" != "$EXPECTED" ]; then
    echo "❌ DEPLOY BLOCKED"
    echo "   Active project: $EXPECTED"
    echo "   Current folder: $CWD"
    echo ""
    echo "   To switch: echo '$CWD' > /root/.openclaw/workspace/.active_project"
    echo "   Or deploy from the correct folder."
    exit 1
fi

echo "✅ Project check passed: $EXPECTED"
exit 0
