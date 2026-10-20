# Contexto del proyecto — Xperience Properties Admin (dashboard central de medios)

## Propósito
Único lugar desde donde se reemplazan los videos y fotos de todos los sitios de Xperience Properties. Los sitios públicos (Santa María Torre 6, Torre Hélice, …) ya no tienen login ni panel admin propio: solo leen su media desde Supabase.

Lo usan personas no técnicas para cambiar contenido, así que la UI prioriza arrastrar y soltar, confirmaciones claras y cero configuración.

## Stack
- React 19 + TypeScript + Vite (plantilla `react-ts`), ESLint
- `@supabase/supabase-js` (auth + Postgres + Storage). Sin router, sin Zustand: estado local con hooks.
- CSS plano, un `.css` por componente junto a su `.tsx` (misma convención que los sitios; nombres case-sensitive por Vercel/Linux).
- `verbatimModuleSyntax` activo: los tipos se importan con `import type`.
- Gestor de paquetes: pnpm
- Repo: `github.com/xperiencegroup/xp-properties-admin` (carpeta local `~/Desktop/xp-props-admin`)
- Deploy: Vercel, dominio `https://admin.xperience.properties` (CNAME en el proveedor externo de `xperience.properties`).
- `index.html` con `noindex, nofollow`.

## Variables de entorno (`.env` local y Vercel)
```
VITE_SUPABASE_URL=https://bzcajnppqwgrybghwool.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
Misma instancia Supabase que los sitios. `.env` está en `.gitignore`. Nunca usar la secret key en esta app.

## Identidad visual
La misma de los sitios: fondo negro, texto blanco, acento `#FBCB22`, esquinas rectas, paneles translúcidos con blur, borde amarillo de 3px (izquierdo en carpetas, superior en modales y toasts). Variables en `src/index.css`: `--color-negro`, `--color-blanco`, `--color-amarillo`, `--color-panel`, `--color-borde`, `--font-sans` (Plus Jakarta Sans), `--font-mono` (Space Mono). Clase utilitaria `.mono`. Flechas de colapso `▾` / `▸`.

## Estructura
```
src/
  main.tsx               → monta <App/> en StrictMode
  index.css              → variables, reset, scrollbars
  App.tsx / App.css      → LoginScreen + header con selector de proyectos + ProjectPanel
  lib/
    supabaseClient.ts    → cliente con las dos variables VITE_
    auth.ts              → useSession(), login(username, password), logout(), EMAIL_DOMAIN
    projects.ts          → tipo Project, loadMyProjects(userId)
  panel/
    ProjectPanel.tsx/.css   → carga la media del proyecto, carpetas, modal y toast
    MediaFolder.tsx/.css    → carpeta colapsable, zona de drop
    MediaCard.tsx/.css      → miniatura, drop directo, clic para elegir archivo, etiqueta editable (grupos)
    ConfirmReplace.tsx/.css → modal de confirmación con vista previa actual ▸ nueva
    mediaAdmin.ts           → tipos, armado de carpetas, coincidencia de archivos, replaceMedia, updateLabel
```

## Login
- Usuario corto (`alejandro`); `auth.ts` agrega `@xperience.group`. Si se escribe un `@`, se usa tal cual.
- Cuentas creadas a mano en Supabase → Authentication → Users (sin signup).
- Error genérico "Usuario o contraseña incorrectos." Un 400 en `/auth/v1/token` casi siempre es contraseña o email mal formado (por ejemplo, escribir el dominio completo cuando ya se agrega solo).

## Registro de proyectos: `xp_properties_master`
```sql
create table public.xp_properties_master (
  id            text primary key,     -- 't6', 'thelice'
  nombre        text not null,        -- lo que se ve en el selector
  assets_table  text not null,
  groups_table  text not null,
  admins_table  text not null,
  bucket        text not null,
  sort_order    integer not null default 0,
  activo        boolean not null default true,
  created_at    timestamptz default now()
);
-- RLS on; única policy: select para authenticated. Se edita solo desde el dashboard de Supabase.
```
Filas actuales:

| id | nombre | assets / groups / admins | bucket |
|---|---|---|---|
| `t6` | Torre 6 Santa María | `t6_sta_maria_media_assets` / `_media_groups` / `_admins` | `t6_media` |
| `thelice` | Torre Hélice | `torre_helice_media_assets` / `_media_groups` / `_admins` | `torre_helice_media` |

**Agregar un proyecto nuevo** no requiere cambios de código: crear sus tablas, bucket, políticas y admins (mismo patrón que Torre Hélice), e insertar su fila aquí.

## Permisos
- `loadMyProjects()` lee el registro (solo `activo = true`) y, por cada proyecto, hace `select` a su `admins_table` filtrando por `user_id`. Solo se muestran los proyectos donde el usuario aparece.
- La seguridad real la imponen las políticas RLS de cada proyecto, no la UI:
  - `*_admins`: `select` donde `user_id = auth.uid()`.
  - `*_media_assets` / `*_media_groups`: lectura pública; `insert`/`update` solo si el usuario está en `*_admins`.
  - `storage.objects` del bucket del proyecto: `insert`/`update`/`delete` solo admins. Buckets públicos (lectura directa por URL).
- Admins actuales en ambos proyectos: `alejandro@`, `cobos@`, `rubio33@xperience.group`.
- **Dar acceso a alguien**: crear la cuenta en Authentication y `insert into public.<admins_table> (user_id) values ('<uuid>');`.

## Panel de medios
- **Carpetas**: se agrupa por la primera carpeta del `storage_path`. Títulos conocidos en `FOLDER_TITLES` (`mediaAdmin.ts`): portada → Portada, navorbital → Navegación orbital, vtiproyecto → Video tour, fotorenders → Foto renders; otras se muestran con su nombre.
- **Orden**: assets por código de archivo (`3`, `4`, `4R`…); grupos por `sort_order`.
- **Títulos de tarjeta**: assets derivan de la key (`video.masterplan.positions.pos1.trans` → "pos1 transición"); grupos usan su `label` o "Elemento N".
- **Soltar sobre una carpeta** (`matchFile`): 1) nombre igual ignorando el prefijo de timestamp → avisa que se sobrescribirá; 2) mismo código de archivo (`^\d+R?` o `FOTO NN`), solo si hay un único candidato; 3) si no, el usuario elige destino en una lista. Acepta varios archivos a la vez.
- **Soltar sobre una tarjeta** o hacer clic en ella: reemplaza ese archivo exacto.
- **Confirmación**: siempre. Bloquea imagen ↔ video y dos archivos al mismo destino. Subidas secuenciales; si alguna falla, el modal queda abierto con el error y se puede reintentar.
- **`replaceMedia`**: upload a `${carpeta}/${Date.now()}-${nombre}` → `update` de la tabla (`storage_path`, `content_type`, `updated_at`) → borra el archivo anterior ("último gana", sin versionado). Si el `update` falla, borra el recién subido para no dejar huérfanos.
- **Cache-busting**: las URLs públicas llevan `?v=<updated_at>`, igual que en los sitios, así el cambio se ve de inmediato.
- El proyecto activo queda en la URL (`?p=thelice`).
- `window` previene `dragover`/`drop` por defecto para que soltar fuera de una carpeta no abra el archivo en el navegador.

## Troubleshooting ya resuelto
- **Vista previa "Nuevo" rota en DEV**: StrictMode monta dos veces y la limpieza revocaba los `blob:` recién creados. Las URLs de vista previa se crean dentro de un `useEffect` con su propia limpieza.
- **Drop en tarjeta también disparaba el de la carpeta**: la tarjeta marca `nativeEvent.handledByCard` y la carpeta lo ignora (sin `stopPropagation`, para que la carpeta pueda limpiar su estado de resaltado).

## Pendiente
- Limpiar los ~35 archivos huérfanos del bucket `t6_media` (anteriores a la limpieza automática).
- Posibles mejoras: reordenar elementos de grupos (fotos, VTI) arrastrando; filtrar o buscar archivos; historial de quién cambió qué.
