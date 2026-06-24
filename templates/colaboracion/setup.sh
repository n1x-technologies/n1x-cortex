#!/bin/sh
# Setup de colaboración — estándar N1X Cortex.
# Configura, para QUIEN lo corra, su identidad git (email noreply de su cuenta de
# GitHub), el commit template y el hook que bloquea push directo a main.
# Auto-detecta al usuario con `gh`, así que sirve para cualquier colaborador.
# Idempotente: puedes correrlo las veces que quieras.
set -e

cd "$(git rev-parse --show-toplevel)"

# 1) Identidad desde tu cuenta de GitHub autenticada (gh) -----------------------
if ! command -v gh >/dev/null 2>&1; then
  echo "✋ Falta GitHub CLI (gh). Instálalo y corre 'gh auth login', luego repite."
  exit 1
fi
login=$(gh api user --jq '.login')
uid=$(gh api user --jq '.id')
name=$(gh api user --jq '.name // .login')
email="${uid}+${login}@users.noreply.github.com"

git config user.name "$name"
git config user.email "$email"
git config commit.template .gitmessage
echo "✅ Identidad: $name <$email>"
echo "✅ commit.template = .gitmessage"

# 2) Hook pre-push: bloquea push directo a main --------------------------------
hook=".git/hooks/pre-push"
cat > "$hook" <<'HOOK'
#!/bin/sh
protegida="main"
while read -r local_ref local_sha remote_ref remote_sha; do
  case "$remote_ref" in
    refs/heads/"$protegida")
      echo ""
      echo "  ✋ Push directo a '$protegida' bloqueado (estándar N1X Cortex)."
      echo "     Usa: git switch -c tipo/desc -> commit -> git push -u origin tipo/desc -> gh pr create"
      echo "     Emergencia real: git push --no-verify"
      echo ""
      exit 1
      ;;
  esac
done
exit 0
HOOK
chmod +x "$hook"
echo "✅ Hook pre-push instalado (bloquea push directo a main)"

echo ""
echo "Listo. Flujo: git switch -c feat/algo -> commit -> push -> gh pr create. Ver CONTRIBUTING.md"
