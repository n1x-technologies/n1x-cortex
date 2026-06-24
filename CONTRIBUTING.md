# Contribuir a N1X Cortex

N1X Cortex es open-source (MIT) y usa su propia metodología también para colaborar. Toda aportación —de mantenedores o de la comunidad— entra por **pull request**, y `main` siempre queda desplegable.

> [!NOTE]
> ¿Solo quieres **usar** la metodología en tu propio proyecto (no mejorar este repo)? No necesitas esta guía: copia [`templates/colaboracion/`](templates/colaboracion/GUIA.md) a tu repo y sigue su `GUIA.md`. Este CONTRIBUTING es únicamente para mejorar **Cortex en sí**.

## Dos formas de contribuir

### 1. Comunidad / externos (sin acceso de escritura) → fork → PR

```bash
gh repo fork n1x-technologies/n1x-cortex --clone
cd n1x-cortex
bash templates/colaboracion/setup.sh          # configura tu identidad (una vez)
git switch -c feat/tu-cambio
# ...trabajas...
git add -A && git commit
git push -u origin feat/tu-cambio
gh pr create --repo n1x-technologies/n1x-cortex --fill
```

Un mantenedor revisa, sugiere cambios y mergea. ¡Gracias!

### 2. Mantenedores / equipo (con acceso de escritura) → rama → PR

```bash
git switch main && git pull
bash templates/colaboracion/setup.sh          # una vez por clon
git switch -c feat/tu-cambio
# ...trabajas...
git add -A && git commit
git push -u origin feat/tu-cambio
gh pr create --fill
# otro mantenedor revisa y aprueba
gh pr merge --squash --delete-branch
```

## Mantenedores

| Persona | GitHub |
|---|---|
| Sebastian Dominguez | `wagnersebastiandc` |
| Santiago Anticona | `otakusimao` |

**El equipo puede crecer.** A un nuevo mantenedor se le da acceso al repo (org `n1x-technologies`); al clonar corre `setup.sh` —que detecta su cuenta automáticamente— y ya sigue el flujo de arriba. Nada está atado a una persona en concreto.

## Configura tu identidad (una vez en tu clon)

**Vía rápida (recomendada):** `bash templates/colaboracion/setup.sh` — detecta tu cuenta con `gh` y configura tu identidad con tu email **noreply** de GitHub (para que tus commits se te atribuyan) + `commit.template` + un hook que bloquea push directo a `main`. Idempotente.

Manual:
```bash
git config user.name  "Tu Nombre"
git config user.email "TU_ID+TU_USUARIO@users.noreply.github.com"   # GitHub → Settings → Emails
git config commit.template .gitmessage
```

## Estándares

- **Ramas:** `feat|fix|chore|docs|refactor/descripcion-kebab`, de vida corta.
- **Commits:** Conventional Commits — `tipo(ámbito): resumen en imperativo`.
- **README al día en cada push** (convención N1X Cortex): si el cambio toca estructura/decisiones, actualiza el README en el mismo PR.
- **El markdown es la fuente de verdad;** el PDF es salida derivada (ver `PROCESO-Actualizacion-N1X-Cortex.md`).
- **🔒 Confidencialidad:** este repo es genérico y público. Nunca incluyas datos reales de ningún cliente/proyecto (ver `CLAUDE.md`).

## Revisión y co-autoría

Los mantenedores revisan los PRs. Cuando puedas mejorar el código de alguien, usa **"Add a suggestion"** en GitHub: si lo aceptan con **"Commit suggestion"**, GitHub te añade como co-autor automáticamente.

Marca `Co-authored-by:` **solo** cuando el cambio se hizo realmente entre dos personas (pairing, código compartido, o sugerencia aceptada en review) — no por pertenecer al mismo equipo. La mayoría de commits van con un solo autor.
