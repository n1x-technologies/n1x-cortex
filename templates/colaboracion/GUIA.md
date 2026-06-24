# Guía de colaboración — estándar N1X Cortex

Cómo trabaja un equipo sobre un repo que usa N1X Cortex: ramas, pull requests, revisión y co-autoría. La plantilla rellenable de `CONTRIBUTING` está en [`PLANTILLA-CONTRIBUTING.md`](PLANTILLA-CONTRIBUTING.md); el template de mensaje de commit en [`plantilla.gitmessage`](plantilla.gitmessage); el de pull request en [`PLANTILLA-PR.md`](PLANTILLA-PR.md).

> [!IMPORTANT]
> Esto es una **plantilla genérica**. No trae a ninguna persona ni proyecto: se adopta copiándola a tu repo y rellenando los huecos `{{...}}`. Sirve para cualquier equipo, cualquier proyecto.

## Principios

1. **`main` siempre desplegable.** Nadie commitea directo a `main`. Cada cambio entra por una rama corta y un pull request.
2. **Una tarea = una rama = un PR.** Ramas de vida corta (horas/días, no semanas). PRs pequeños se revisan rápido y se mergean rápido.
3. **El otro revisa.** Todo PR lo revisa alguien más del equipo antes de mergear. En equipos de 2, se revisan mutuamente.
4. **La autoría sigue al trabajo real.** El autor de un commit es quien lo escribe. La co-autoría se marca **solo cuando el cambio se hizo entre varias personas** (ver abajo) — nunca por el solo hecho de estar en el mismo equipo.
5. **Ciclo vivo (Cortex).** Todo aprendizaje del cambio vuelve al grafo de conocimiento y el README se actualiza en el mismo push.

## El flujo, paso a paso

```bash
git switch main && git pull              # parte de main al día
git switch -c feat/lo-que-haces          # rama corta y descriptiva

# ...trabajas...
git add -A
git commit                               # se abre el editor con plantilla.gitmessage

git push -u origin feat/lo-que-haces
gh pr create --fill                      # abre el PR
# otra persona del equipo revisa y aprueba
gh pr merge --squash --delete-branch     # entra a main, borra la rama
git switch main && git pull
```

## Nombres de rama

`tipo/descripcion-corta-en-kebab`. Tipos: `feat`, `fix`, `chore`, `docs`, `refactor`.
Ejemplos: `feat/login-microsoft`, `fix/timeout-reintentos`, `docs/guia-onboarding`.

## Mensajes de commit (Conventional Commits)

`tipo(ámbito): resumen en imperativo`. Ejemplos:
- `feat(portal): botón sincronizar fuentes`
- `fix(ingest): procedencia en todos los perfiles`

El cuerpo (opcional) explica el *por qué*. La plantilla `plantilla.gitmessage` ya trae la estructura y una línea de co-autoría lista para activar.

## Co-autoría — cuándo y cómo

La co-autoría es **por commit**, no por organización. Marca `Co-authored-by:` **solo** cuando la otra persona aportó a *ese* cambio concreto:

- ✅ Programaron en pareja.
- ✅ El otro escribió parte de ese código.
- ✅ Diseñaron/depuraron juntos esa solución específica.
- ❌ Lo hiciste tú solo (aunque sean del mismo equipo/empresa).

**La vía más natural sin sentarse juntos: las sugerencias en la revisión.** Cuando alguien revisa un PR y usa *"Add a suggestion"* proponiendo el cambio exacto, y el autor hace *"Commit suggestion"*, GitHub añade **automáticamente** al revisor como `Co-authored-by:`. Es colaboración real (mejoró tu código) sin trabajo extra.

Formato (va al final del **mensaje del commit**, no en el código; una línea en blanco antes):

```
Co-authored-by: Nombre Apellido <ID+usuario@users.noreply.github.com>
```

> El email `noreply` de cada persona se obtiene en GitHub → Settings → Emails (formato `ID+usuario@users.noreply.github.com`). Usar el `noreply` garantiza que el commit se atribuya a la cuenta correcta sin exponer correos personales.

## Identidad de git (clave para que el trabajo cuente)

Cada quien debe configurar su identidad con un email **enlazado y verificado** en su cuenta de GitHub (idealmente el `noreply`), o sus commits quedan huérfanos (no aparecen en su perfil):

```bash
git config user.name  "Nombre Apellido"
git config user.email "ID+usuario@users.noreply.github.com"
git config commit.template .gitmessage
```

## Cómo adoptar esta política en tu repo

1. Copia `PLANTILLA-CONTRIBUTING.md` a la raíz de tu repo como `CONTRIBUTING.md` y rellena los `{{...}}`.
2. Copia `plantilla.gitmessage` como `.gitmessage` y rellena las líneas de co-autoría de tu equipo (déjalas comentadas).
3. Copia `PLANTILLA-PR.md` a `.github/pull_request_template.md`.
4. Cada miembro configura su identidad de git (arriba) y `commit.template`.
5. (Recomendado) En GitHub → Settings → Branches, protege `main` para exigir PR + 1 aprobación.
