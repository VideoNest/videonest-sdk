#!/bin/bash

# Exit if any command fails
set -e

# Check if commit message arg is provided
if [ -z "$1" ]; then
  echo "❌ Commit message required"
  echo "Usage: ./release.sh \"your commit message\""
  exit 1
fi

COMMIT_MSG="$1"

echo "📦 Starting release process..."
echo "💬 Commit message: $COMMIT_MSG"

# 1️⃣ Commit changes
git add .
git commit -m "$COMMIT_MSG"

# 2️⃣ Bump patch version
npm version patch

# 3️⃣ Build package
npm run build

# 4️⃣ Push commits and tags
git push
git push --tags

# 5️⃣ Publish to npm
npm publish

echo "✅ Release complete!"
