# Verificación de V23

Comprobaciones realizadas en el entorno de desarrollo el 26 de septiembre de 2026:

- 16 pruebas del motor/exportación aprobadas en Python 3.11.16 dentro de GitHub Actions y en Python 3.12.14 local. Incluyen imágenes nativas, páginas sin trazos, referencias y hashes, conservación del binario manuscrito, límites, cancelación y separación de `_` respecto de `-`.
- 22 pruebas del editor aprobadas en Chromium con Playwright 1.55.0. Incluyen importar, mover sin recomponer texto, recortar, girar, ordenar, duplicar, deshacer/rehacer, persistir imágenes, migrar el borrador anterior y congelar los datos durante la exportación. Los gestos de dos dedos se ejecutan mediante eventos táctiles de Chromium; el selector y el puente Android están simulados.
- 8 pruebas Android aprobadas con Robolectric SDK 28 y gráficos nativos: PNG transparente, WebP con alfa, orientación EXIF de JPG, lectura por contenido, reducción antes de decodificar, recorte sin modificar el original, rechazo de datos inválidos y renderizado de escritura encima de imágenes.
- Inspección visual de la captura del editor de imágenes generado por las pruebas. La exportación se basa en las 13 páginas y 15 elementos de imagen de las muestras de Huawei Notes proporcionadas: posición, tamaño, ángulo, orden entre imágenes y recortes materializados.
- La calibración V23 se reconstruye de forma reproducible con `.github/scripts/prepare_assets.py`. El guion bajo queda 4 unidades lógicas más abajo que en V22; se mantienen las correcciones de listas y símbolos y el logo del usuario.

Ejecución completa aprobada: [GitHub Actions 36256605076](https://github.com/Victor55101/HiNote-Studio-Tablet/actions/runs/36256605076), fuente `4281993d7fda9e3cca80f9719950d9bb4c764432` en `v23-images-touch`. Los tres grupos suman 46 pruebas aprobadas.

## Carga reproducible del motor

Comando: `python tools/benchmark_engine.py --characters 90100`

| Medida | Resultado |
| --- | ---: |
| Texto de entrada | 90100 caracteres |
| Páginas generadas | 85 |
| Duración | 10,35 s |
| Pico de memoria RSS del proceso Python | 61,3 MiB |
| Archivos temporales de composición | 189,8 MiB |
| Resumen enviado al editor | 860 bytes |

La medición se realizó en Linux con Python 3.12.14 y el banco corregido de calibración. Es memoria del proceso Python, no memoria total Android/WebView ni una estimación del rendimiento en la Huawei. La imagen visible se solicita aparte del resumen. El directorio temporal del ensayo se elimina automáticamente.

## APK

`testDebugUnitTest assembleDebug` se completó en GitHub Actions con JDK 17, Gradle 8.13, Android SDK 35 y Chaquopy 17.0/Python 3.11. El APK contiene exclusivamente `glyphs_v23.json`, el editor de imágenes, el logo SVG y los iconos Android. Se comprobó la integridad ZIP y que los archivos HTML/JS/CSS empaquetados coinciden con la fuente probada. Paquete `com.hinote.studio`, versión `2.3-tablet` (código 23), arquitectura arm64-v8a, Android API 24 mínimo y objetivo 35.

El APK entregado mide 21974748 bytes y su SHA-256 es `5758610085b953e936f9bd85cfb05503eb98e045d34ce504e119b3bbc97554ed`. Una recompilación de depuración puede producir otra firma y, por tanto, otro hash. Si Android rechaza la actualización por firma incompatible, guarda antes el texto y exporta tus notas: desinstalar elimina el borrador y sus imágenes privadas.

## Pendiente en el dispositivo

Validar en MatePad Pro 2025, HarmonyOS 4.3.0 y Huawei Notes 12.4.3.380 la importación real del `.hinote`, edición nativa de imágenes, capas, tacto, recorte, giro, transparencia, persistencia y consumo total de memoria. Las pruebas en Linux/Chromium/Robolectric no sustituyen esta comprobación física. El procedimiento está en `PRUEBA_TABLET.md`.
