# Contribuir a N1X Cortex

N1X Cortex usa su propia metodología también para colaborar: esta guía es una **instancia del estándar genérico** que vive en [`templates/colaboracion/`](templates/colaboracion/GUIA.md). Resumen: `main` siempre desplegable, todo entra por rama → pull request → revisión.

## Equipo

| Persona | Usuario GitHub | Email noreply (para co-autoría) |
|---|---|---|
| Sebastian Dominguez | `wagnersebastiandc` | `110055664+wagnersebastiandc@users.noreply.github.com` |
| Santiago Anticona | `otakusimao` | `113515100+otakusimao@users.noreply.github.com` |

## Configura tu identidad (una vez en tu clon)

**Vía rápida (recomendada):** `bash templates/colaboracion/setup.sh` — detecta tu cuenta con `gh` y configura identidad noreply + `commit.template` + el hook anti-push-a-main. Idempotente.

O manualmente, usando tu email **noreply** de GitHub para que tus commits se atribuyan a tu cuenta:

```bash
# Sebastian
git config user.name  "Sebastian Dominguez"
git config user.email "110055664+wagnersebastiandc@users.noreply.github.com"

# Santiago
git config user.name  "Santiago Anticona"
git config user.email "113515100+otakusimao@users.noreply.github.com"

# ambos
git config commit.template .gitmessage
```

## Flujo de trabajo

```bash
git switch main && git pull
git switch -c feat/lo-que-haces          # tipo/descripcion-kebab

# ...trabajas...
git add -A
git commit                               # editor con .gitmessage

git push -u origin feat/lo-que-haces
gh pr create --fill
# la otra persona revisa y aprueba
gh pr merge --squash --delete-branch
git switch main && git pull
```

- **Ramas:** `feat|fix|chore|docs|refactor/descripcion-kebab`, de vida corta.
- **Commits:** Conventional Commits — `tipo(ámbito): resumen en imperativo`.
- **README al día en cada push** (convención N1X Cortex): si el cambio toca estructura/decisiones, actualiza el README en el mismo PR.

## Revisión

Se revisan mutuamente. Para revisar un PR:

```bash
gh pr list
gh pr checkout <N>          # prueba la rama (opcional)
gh pr review <N> --approve
```

Cuando puedas mejorar el código del otro, usa **"Add a suggestion"** en GitHub. Si lo acepta con **"Commit suggestion"**, GitHub te añade como co-autor automáticamente — colaboración real sin sentarse juntos.

## Co-autoría

Marca `Co-authored-by:` **solo** cuando el cambio se hizo de verdad entre los dos (pairing, código compartido, o sugerencia aceptada en review). No por ser socios. La mayoría de commits irán con un solo autor, y está bien. El `.gitmessage` ya trae ambas líneas comentadas: descomenta la de la otra persona cuando aplique.
