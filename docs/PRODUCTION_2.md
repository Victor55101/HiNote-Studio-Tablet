# Producción 2: Acerca de y documentos completos

Base funcional: V54.4 y la primera candidata de producción. Código 66,
`5.4.6-production2`, paquete `com.hinote.studio.v54maintenance`. El nombre del
lanzador sigue siendo **HiNote Studio**. Se conserva el certificado de
mantenimiento; actualiza V54.4 y producción 1 sin desinstalar.

## Presentación

- El logo es un botón accesible que abre **Acerca de HiNote Studio**.
- Se muestra la versión instalada, leída de `BuildConfig.VERSION_NAME`.
- Privacidad, licencias, contacto y datos locales se consultan desde esa ventana.
- El acceso de privacidad deja de ocupar espacio en Archivo.
- Atrás del sistema y el botón **Volver** recorren los apartados hasta cerrar la
  ventana. Al volver a un documento se recupera su posición de lectura.
- La bienvenida inicial resume el trabajo local y ofrece los enlaces completos.
  **Continuar** la cierra; el cierre con Atrás también se recuerda. El dato se
  conserva localmente como bienvenida vista, sin registrar consentimiento general.
- El borrado queda en **Datos locales** y mantiene la confirmación nativa.

## Corrección del visor vacío

La primera candidata utilizaba un WebView con restricciones de carga que no se
verificaron en el componente real de la tablet. Se sustituye el visor por
`TextView`, `ScrollView` y navegación nativa. No existe WebView ni puente de
JavaScript dentro de los documentos. Los enlaces internos cambian de apartado;
solo el correo confirmado y la URL HTTPS del aviso permiten abrir otra app por
una acción explícita. Los errores de lectura producen un mensaje visible.

## Identidad, contacto y publicación del aviso

El titular autorizó el nombre completo y el domicilio incluidos en
`distribution/publisher.json`, y confirmó que controla
`soporte.hinotestudio@gmail.com`. No se utiliza el correo propuesto inicialmente.
No se incorpora la fecha de nacimiento ni el correo personal de recuperación.

El repositorio es público. El aviso se ofrece como Markdown legible en:

https://github.com/Victor55101/HiNote-Studio-Tablet/blob/production-v54-4/docs/PRIVACY.md

`prepare_legal.py` genera de la misma fuente el Markdown público, el HTML local y
los documentos JSON de la interfaz nativa. Las licencias originales se conservan
íntegras. El botón de contacto abre el redactor de correo; no envía mensajes.

El aviso distingue los archivos locales del tratamiento voluntario de soporte.
Explica guardado, exportación, retención, borrado, derechos y canales de contacto.
Conserva la advertencia sobre el PDF original completo en cuadernos exportados.
La información completa no equivale a una certificación jurídica ni a aprobación
de AppGallery. No se presenta una solicitud a una tienda desde este flujo.

## Validación

Pruebas de navegador: logo por toque y teclado, selección y formato conservados,
ausencia de apertura de teclado al tocarlo y cancelación de arrastre. Se ejecuta
también la batería completa de regresiones del editor.

Pruebas nativas: contenido real del aviso, textos originales de licencias,
navegación, recreación de actividad, bienvenida y persistencia, intent de correo
al contacto correcto y cancelación de borrado sin perder el borrador.

La CI añade un emulador Android 35. Ejecuta la interfaz nativa en tema claro y
oscuro y guarda capturas. Comprueba el primer inicio del editor y la apertura
desde el logo, con el mismo borrador y selección al regresar. El ABI x86_64 se
utiliza únicamente en ese trabajo aislado; la distribución sigue siendo arm64.

El APK final se vuelve a inspeccionar tras compilar y tras firmar. La clave
privada se conserva fuera del repositorio y de los artefactos de CI. La prueba
final de actualización e importación en Huawei Notes corresponde a la tablet.

```bash
python3 .github/scripts/prepare_assets.py
python3 .github/scripts/prepare_legal.py --require-ready
python3 -m unittest discover -s tests -p 'test_*.py' -v
node tests/editor.spec.cjs
```
