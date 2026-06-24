# Contribuir a {{NOMBRE_PROYECTO}}

Gracias por aportar. Este proyecto sigue el **estándar de colaboración N1X Cortex**. Resumen: `main` siempre desplegable, todo entra por rama → pull request → revisión.

> Reemplaza todos los `{{...}}` al adoptar esta plantilla. Guía completa del estándar: `templates/colaboracion/GUIA.md` en el repo de N1X Cortex.

## Equipo

| Persona | Usuario GitHub | Email noreply (para co-autoría) |
|---|---|---|
| {{NOMBRE_1}} | `{{USUARIO_1}}` | `{{ID_1}}+{{USUARIO_1}}@users.noreply.github.com` |
| {{NOMBRE_2}} | `{{USUARIO_2}}` | `{{ID_2}}+{{USUARIO_2}}@users.noreply.github.com` |

## Configura tu identidad (una vez por máquina/repo)

Usa tu email **noreply** de GitHub para que tus commits se atribuyan a tu cuenta:

```bash
git config user.name  "{{TU_NOMBRE}}"
git config user.email "{{TU_ID}}+{{TU_USUARIO}}@users.noreply.github.com"
git config commit.template .gitmessage
```

## Flujo de trabajo

```bash
git switch main && git pull
git switch -c feat/lo-que-haces          # tipo/descripcion-kebab

# ...trabajas...
git add -A
git commit                               # editor con plantilla de commit

git push -u origin feat/lo-que-haces
gh pr create --fill
# otra persona revisa y aprueba
gh pr merge --squash --delete-branch
git switch main && git pull
```

- **Ramas:** `feat|fix|chore|docs|refactor/descripcion-kebab`, de vida corta.
- **Commits:** Conventional Commits — `tipo(ámbito): resumen en imperativo`.
- **PRs:** pequeños y enfocados. Usa la plantilla de PR. Pídele revisión a la otra persona.

## Revisión

Todo PR lo revisa alguien más antes de mergear. Para revisar:

```bash
gh pr list
gh pr checkout {{N}}        # prueba la rama (opcional)
gh pr review {{N}} --approve
```

Cuando algo se puede mejorar, usa **"Add a suggestion"** en GitHub (propones el cambio exacto). Si el autor lo acepta con **"Commit suggestion"**, GitHub te añade como co-autor automáticamente.

## Co-autoría

Marca `Co-authored-by:` **solo** cuando el cambio se hizo realmente entre varias personas (pairing, código compartido, sugerencia aceptada en review). No por estar en el mismo equipo. Va al final del **mensaje del commit**:

```
Co-authored-by: {{NOMBRE_2}} <{{ID_2}}+{{USUARIO_2}}@users.noreply.github.com>
```
