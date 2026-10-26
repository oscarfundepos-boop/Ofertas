# Especificación de Seguridad de Firestore - Comparador de Propuestas BN

## 1. Invariantes de Datos y Control de Acceso (RBAC)

1. **Jerarquía y Roles**:
   - `admin`: Administrador de la plataforma (usuario inicial bootstrapped `oscar.fundepos@gmail.com`). Acceso total de lectura y administración sobre usuarios, registros y auditoría.
   - `asesor`: Usuario final autenticado. Solo puede crear y leer sus propias comparaciones de pólizas. No puede modificar su propio rol a `admin` ni alterar registros de otros usuarios.
   - `anónimo / sin autenticar`: Acceso denegado a todas las colecciones.

2. **Invariantes de Colecciones**:
   - `/admins/{adminId}`: Solo administradores existentes pueden leer o escribir. Se comprueba mediante `exists(/databases/$(database)/documents/admins/$(request.auth.uid))` o verificación del correo administrador configurado.
   - `/users/{userId}`: El propio usuario puede leer su perfil. Solo el usuario puede crear su perfil inicial con rol `asesor` (nunca autodesignarse `admin`). Solo los `admin` pueden cambiar roles o suspender usuarios.
   - `/comparisons/{comparisonId}`: Un asesor solo puede crear y leer documentos donde `resource.data.userId == request.auth.uid`. Los administradores pueden auditar y leer todas las comparaciones.
   - `/audit_logs/{logId}`: Todo usuario autenticado puede crear un registro de auditoría con su propio UID; solo los administradores pueden leer los registros de auditoría.

## 2. Dirty Dozen Payloads (Casos de Ataque a Bloquear)

1. **Payload 1 (Autoelevación de Privilegios)**: Usuario normal intenta crear su perfil en `/users/{uid}` con `"role": "admin"`. Debe ser denegado.
2. **Payload 2 (Suplantación de Identidad en Creación)**: Usuario A intenta crear una comparación con `"userId": "usuario_B"`. Debe ser denegado.
3. **Payload 3 (Lectura Masiva no Autorizada)**: Usuario no autenticado intenta hacer query `list` en `/comparisons`. Debe ser denegado.
4. **Payload 4 (Espionaje entre Asesores)**: Asesor A intenta leer una cotización de cliente en `/comparisons/{id}` perteneciente a Asesor B. Debe ser denegado.
5. **Payload 5 (Modificación de Historial)**: Asesor intenta alterar la prima o recomendación de una comparación ya guardada. Las comparaciones deben ser de solo lectura o protegidas contra manipulación.
6. **Payload 6 (Sobrescritura de Administradores)**: Usuario normal intenta agregar su UID a la colección `/admins`. Debe ser denegado.
7. **Payload 7 (Campos Fantasma / Ghost Fields)**: Usuario intenta enviar campos no permitidos en el perfil de usuario (ej. `"isSuperAdmin": true`).
8. **Payload 8 (Inyección de IDs masivos)**: Intento de crear documentos con IDs de más de 128 caracteres o caracteres especiales no conformes a regex.
9. **Payload 9 (Denegación de Billetera por Payload Gigante)**: Intento de guardar strings arbitrarios sin límite de tamaño en campos de texto.
10. **Payload 10 (Modificación de Invariante de Creación)**: Intento de cambiar el `createdAt` o el `userId` en una actualización.
11. **Payload 11 (Borrado no Autorizado)**: Asesor intenta eliminar registros de auditoría en `/audit_logs`. Debe ser denegado a todos.
12. **Payload 12 (Usuario Suspendido)**: Usuario con estado `suspended` intentando registrar nuevas comparaciones. Debe ser validado y bloqueado.
