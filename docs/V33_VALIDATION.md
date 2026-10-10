# V33 — reconstrucción de V32 y cinco correcciones

## Resultado local

- Python 3.12: **84 pruebas aprobadas** (composición, binarios nativos, archivos .hinote, calibración, tablas, imágenes y combinación).
- Chromium 140 / Playwright 1.55: **69 pruebas aprobadas** con gestos reales; el puente Android se simula explícitamente.
- Android / Robolectric: **25 pruebas aprobadas**, incluidas tinta nativa de vista previa, marcadores rellenos, carpetas, combinación, cancelación y conservación de archivos previos.
- Gradle 8.13, JDK 17, SDK 35, Chaquopy Python 3.11: `testDebugUnitTest assembleDebug` completado.
- APK: paquete `com.hinote.studio`, versionCode `33`, versionName `3.3-tablet`, Android mínimo 24, arm64-v8a.
- Firma verificada con `apksigner`; metadatos comprobados con `aapt2`.
- Todos los recursos empaquetados coinciden con los archivos del proyecto. Los tres recursos generados coinciden con la receta de `.github/scripts/prepare_assets.py`.
- Los 12 módulos Python empaquetados coinciden con la compilación de sus fuentes reconstruidas, normalizando únicamente la ruta interna del archivo.

APK entregado: `HiNote-Studio-Tablet-V33.apk`, 22 352 454 bytes.

SHA-256 del APK: `3081e8e7f10594eef2604e5422907e7c758eac7393fa103b786b06b4d02ebe9e`.

Certificado SHA-256: `8e00c735c4fca7931fd0d3d740ce96e9aaed5a4e284cf13054e8d0207884a98e`.

La clave privada se respalda fuera del repositorio. La firma anterior de V32 no se recuperó, por lo que este APK no puede instalarse como actualización directa de V32. Antes de desinstalarla hay que conservar notas, borrador y perfiles. Los APK de Actions usan su propia clave de depuración salvo que se configure/restaure expresamente la clave respaldada de V33.

## Tinta exportada

La ruta anterior creaba geometría copiando metadatos y cabeceras de un gesto calibrado y sustituyendo sus coordenadas. La nueva ruta emite líneas nativas de dos puntos, con metadatos limpios y grosor uniforme. Los puntos consecutivos coinciden en sus extremos; las curvas conservan todas las muestras de interpolación. También se aplica a contornos calibrados que se estiran para encerrar una fórmula: se conserva su geometría, sin reutilizar la dinámica del gesto original.

Las pruebas leen el binario exportado y verifican tipo de herramienta, estados, presión, metadatos, identificadores únicos y continuidad. Las curvas punteadas conservan la longitud de cada guion y los huecos. El resultado sigue siendo tinta editable; la curva contiene segmentos independientes.

**Pendiente en dispositivo:** confirmar la apariencia al importar y ampliar en la versión de Huawei Notes del usuario. Las pruebas de Canvas y del formato binario no ejecutan el renderizador propietario de Huawei. Las seis capturas del usuario guiaron esta corrección, pero no se dispone aquí de su tablet.

## Interfaz

Las pruebas cubren la desaparición exclusiva de la ayuda de fórmula, su reaparición al editar, conservación de errores, bloques mixtos en ambos órdenes con deshacer, coordenadas decimales con atracción cercana y sin ella, navegación por caracteres, zoom sin puntos accidentales y arrastre sin desplazar la página. Los márgenes de gráfica se comprueban en la geometría del motor y se comparten con el editor.

La base recuperada se conserva por separado en el commit `0a24ec28bfd5ac2ed5fca84a1f7c89659730ab64`. No se afirma haber recuperado los commits locales originales ni la clave privada perdida.
