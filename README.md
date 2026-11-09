# Euskadi: quién es quién

Web que muestra, con foto y explicación de cada cargo:

- **Gobierno Vasco**: Lehendakari, vicelehendakaris, consejeros, viceconsejeros, direcciones, entes públicos y delegaciones (~255 cargos). Fuente: [Irekia](https://www.irekia.euskadi.eus/es/politicians).
- **Parlamento Vasco**: los 75 parlamentarios, con su grupo, comisiones, formación y profesión. Fuente: [legebiltzarra.eus](https://www.legebiltzarra.eus/portal/es/parlamentarios-y-organos/parlamentarios).
- **Diputaciones Forales**: Diputado/a General, diputados forales y directores de Gipuzkoa ([gipuzkoa.eus](https://www.gipuzkoa.eus/es/diputacion)), Bizkaia ([bizkaia.eus](https://www.bizkaia.eus/es/conoce-la-diputacion) y su portal de transparencia) y Álava ([irekia.araba.eus](https://irekia.araba.eus/departamentos1)), con biografía y funciones de cada dirección. Bizkaia no publica sus directores en la web, así que se toman de la [Guía de Comunicación de euskadi.eus](https://www.euskadi.eus/diputacion-foral-de-bizkaia/r61-vedorok/es/), que puede ir con retraso.
- **Ecosistema (cuádruple hélice)**: SPRI, Innobasque, BRTA, centros tecnológicos, CIC, BERC, BICs, clústeres, Biogipuzkoa, Adinberri, agencias de desarrollo comarcal, universidades, fundaciones… Cuando un cargo del Gobierno dirige una entidad (p. ej. «Director General de SPRI»), se enlaza solo.
- **Temáticas**: longevidad, biociencias, reto demográfico, Industria 4.0 y transporte, con los departamentos, personas y entidades que toman o tomarían parte.
- **Cambios**: registro de altas, bajas y cambios de cargo (dimisiones, nombramientos, elecciones).

## Cómo se actualiza

`scripts/update.mjs` descarga los datos oficiales y genera `public/data.json`. Si detecta diferencias con la actualización anterior, las apunta en `public/cambios.json`.

Si una fuente falla (web caída, cambio de diseño), **se conservan los datos anteriores** y la web muestra un aviso. Así nunca se queda vacía.

En GitHub, el workflow `.github/workflows/actualizar.yml` actualiza los datos **cada noche** (03:17 UTC), los guarda en el repositorio y publica la web. Para forzarlo, pestaña **Actions → Actualizar datos y publicar → Run workflow**. La cabecera de la web muestra la fecha de la última actualización.

En local (`npm run serve`) aparece además el botón **Actualizar datos**, que ejecuta el script y recarga la página al terminar. En la web publicada ese botón no se muestra.

## Uso en local

Necesitas Node.js 22.19 o superior.

```bash
npm run update   # descarga datos (unos 2 minutos)
npm run serve    # abre http://localhost:8080
```

## Publicarla en internet (GitHub Pages, gratis)

1. Crea una cuenta en github.com y un repositorio nuevo (por ejemplo `euskadi-quien-es-quien`).
2. Sube todo el contenido de esta carpeta. Si lo arrastras desde el Finder, pulsa antes `Cmd + Shift + .` para ver la carpeta oculta `.github`, que también hay que subir.
3. En el repositorio, ve a **Settings → Pages → Source** y elige **GitHub Actions**.
4. En **Settings → Actions → General → Workflow permissions**, marca **Read and write permissions**.
5. En la pestaña **Actions**, abre «Actualizar datos y publicar» y pulsa **Run workflow**.

La web quedará en `https://TU-USUARIO.github.io/euskadi-quien-es-quien/`.

## Editar el ecosistema

Las entidades están en `data/ecosistema.json`. Cada una tiene:

| campo | qué es |
|---|---|
| `helice` | `administracion`, `conocimiento`, `empresa` o `sociedad` |
| `tipo`, `territorio` | se usan en los filtros |
| `web` | de aquí se sacan en cada actualización el logo y la descripción oficial |
| `claves` | texto que, si aparece en un cargo de Irekia, vincula a esa persona con la entidad |
| `descripcion` | explicación propia |

Los logos y los responsables se refrescan en cada actualización. El resto de campos son texto editado a mano: si una entidad cambia de nombre o desaparece, hay que modificarla en este archivo.

## Editar las temáticas

La clasificación está en `public/tematicas.json` y es texto editado a mano. Cada temática tiene dos listas, y en ambas `participacion` vale `participa` (toma parte) o `podria` (tomaría parte):

- `departamentos`: `institucion` es `gv`, `gipuzkoa`, `bizkaia` o `araba`. `cargos` son patrones sobre el texto del cargo, no nombres, para que un relevo actualice sola la persona que aparece. `@titular` es quien dirige el departamento.
- `ecosistema`: grupos con los `id` de `data/ecosistema.json` o, con `tipos`, todas las entidades de un tipo.

## Notas técnicas

- Sin dependencias: solo Node.js y HTML/CSS/JS.
- `certs/izenpe-chain.pem` contiene la cadena de certificados de Izenpe, la autoridad de certificación que usan las webs del Gobierno Vasco. Node no la incluye de serie.
- Las fotos se cargan directamente desde las webs oficiales.
