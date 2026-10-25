# Primera compilación de producción basada en V54.4

Documento histórico de la primera candidata. La versión actual, con el contacto
confirmado y el visor nativo, se describe en [PRODUCTION_2.md](PRODUCTION_2.md).

Base aceptada: commit remoto `90481eb9a043107ffbe363b6704427e66159fd66` de
`v54-maintenance`. No incorpora las pruebas descartadas V55–V60.

## Identidad y actualización

- Nombre visible: **HiNote Studio**, sin versión en el lanzador.
- Paquete `com.hinote.studio.v54maintenance`, igual que V54.2–V54.4.
- Código 65; versión `5.4.5-production1`.
- Variante `productionRelease`, no `reviewDebug`.
- Firma privada de mantenimiento retenida fuera del repositorio. Certificado
  público esperado, SHA-256:
  `544fb3ba1fc0b599dbe70c70db294621433559f4b4664585ead097a51ede0cfa`.

La actualización conserva borrador, perfiles y recursos. Se sustituye la
plantilla de formato integrada y se retira el antiguo JPG del papel del almacén
interno. Borrar datos locales siempre exige confirmación del usuario.

## Cambios

Política y licencias sin conexión en **Archivo → Privacidad y datos**. Visor sin
JavaScript ni puente nativo; red bloqueada. Control para borrar el almacenamiento
propio mediante Android, con confirmación. Sin permisos de Internet, acceso
general al almacenamiento, contactos, ubicación, cámara o micrófono ni servicios
de accesibilidad en la distribución. Depuración desactivada en release.
Navegación del editor restringida y CSP endurecida. Respaldos y transferencia
automática de datos excluidos para Android antiguo y moderno. Cuadrícula propia
y plantilla sin imágenes de la nota fuente. Verificación del APK final.

Los modos de teclado, edición, tamaño y zoom siguen la base V54.4.
El runtime de Android se actualiza a Chaquopy 17.1.0 con Python 3.11.17 y
OpenSSL 3.5.9; incluye sus avisos y dependencias. No cambia la lógica de edición.

## Datos pendientes para publicar

`distribution/publisher.json` requiere nombre legal o razón social, domicilio de
contacto, correo confirmado y URL pública HTTPS del aviso. El usuario propuso
`hinotestudio@gmail.com`; no se considera creado, disponible u operativo hasta
confirmarlo. `proposed_privacy_email` no se publica como contacto.

El APK se puede compilar y probar en modo producción. Mientras falten datos,
el aviso se identifica como versión para revisión y el control de tienda falla.
No se publica automáticamente en AppGallery ni se habilita alojamiento web.

```bash
python3 .github/scripts/prepare_assets.py
python3 .github/scripts/prepare_legal.py
python3 .github/scripts/prepare_legal.py --require-ready
```

El último comando debe fallar hasta completar los datos reales y confirmar que
el correo y la URL funcionan. La página preparada está en `docs/privacy/index.html`.

## Compilación y firma

Desde `HiNote_Studio_Tablet_Android`:

```bash
gradle --no-daemon testProductionReleaseUnitTest assembleProductionRelease
```

CI entrega un **unsigned candidate**. La clave privada no se coloca en GitHub,
los recursos ni los artefactos de CI. Tras la firma privada se verifica:

```bash
python3 .github/scripts/verify_production_apk.py RUTA_AL_APK_FIRMADO \
  --apksigner RUTA_A_APKSIGNER_JAR \
  --expected-certificate 544fb3ba1fc0b599dbe70c70db294621433559f4b4664585ead097a51ede0cfa
```

## Verificación en la tablet

Actualizar sobre V54.4 sin desinstalar y comprobar borrador, estilos, perfiles e
imágenes. Revisar teclado físico/virtual, pegado, tablas, fórmulas y selección de
objetos. Abrir privacidad y volver sin perder la posición de edición. Exportar
texto, tabla, gráfica, imagen y PDF; importarlos en Huawei Notes y comprobar
trazos y paginación. Probar el borrado solo con datos desechables respaldados.

## Límites conservados y documentados

Los PDF se adjuntan completos aunque se hayan eliminado páginas visibles de la
nota; el aviso lo explica. Los archivos exportados no tienen cifrado propio.
Eliminar datos de HiNote no borra cuadernos importados en Notes ni archivos
guardados fuera de la app. El respeto de exclusiones de respaldo depende del
sistema/fabricante. La marca, interoperabilidad y los requisitos comerciales o
fiscales de una futura venta conservan su revisión correspondiente.
