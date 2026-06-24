#!/bin/sh
# Collaboration setup — N1X Cortex standard.
# For WHOEVER runs it, this configures their git identity (the noreply email of
# their GitHub account), the commit template, and the hook that blocks direct
# pushes to main. It auto-detects the user with `gh`, so it works for any
# collaborator. Idempotent: run it as many times as you want.
set -e

cd "$(git rev-parse --show-toplevel)"

# 1) Identity from your authenticated GitHub account (gh) -----------------------
if ! command -v gh >/dev/null 2>&1; then
  echo "✋ Missing GitHub CLI (gh). Install it, run 'gh auth login', then retry."
  exit 1
fi
login=$(gh api user --jq '.login')
uid=$(gh api user --jq '.id')
name=$(gh api user --jq '.name // .login')
email="${uid}+${login}@users.noreply.github.com"

git config user.name "$name"
git config user.email "$email"
git config commit.template .gitmessage
echo "✅ Identity: $name <$email>"
echo "✅ commit.template = .gitmessage"

# 2) Pre-push hook: blocks direct pushes to main -------------------------------
hook=".git/hooks/pre-push"
cat > "$hook" <<'HOOK'
#!/bin/sh
protected="main"
while read -r local_ref local_sha remote_ref remote_sha; do
  case "$remote_ref" in
    refs/heads/"$protected")
      echo ""
      echo "  ✋ Direct push to '$protected' blocked (N1X Cortex standard)."
      echo "     Use: git switch -c type/desc -> commit -> git push -u origin type/desc -> gh pr create"
      echo "     Real emergency: git push --no-verify"
      echo ""
      exit 1
      ;;
  esac
done
exit 0
HOOK
chmod +x "$hook"
echo "✅ Pre-push hook installed (blocks direct pushes to main)"

echo ""
echo "Done. Flow: git switch -c feat/something -> commit -> push -> gh pr create. See CONTRIBUTING.md"
