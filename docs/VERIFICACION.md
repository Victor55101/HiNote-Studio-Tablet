# Verificación de V22

Comprobaciones realizadas en el entorno de desarrollo el 26 de septiembre de 2026:

- 11 pruebas del motor aprobadas en Python 3.12.14. Incluyen paginación, cancelación, exportación, límites y una regresión nueva que verifica las ocho variantes de `•`, `*`, `<`, `+`, `=`, `%`, `#` y `@`, además de la altura independiente de `_` frente a `-`.
- 15 pruebas del editor aprobadas en Chromium 140 con Playwright 1.55.0 dentro de GitHub Actions.
- Inspección visual de las ocho variantes reconstruidas y de una composición con `_-Hola`, lista de viñetas y lista de asteriscos.
- Logo SVG validado y renderizado con transparencia. Se generaron iconos Android de 8 bits para cinco densidades y un icono adaptativo.
- Recursos de calibración reconstruidos de forma reproducible por `.github/scripts/prepare_assets.py`; la página 8 queda sin trazos huérfanos.

## Carga reproducible del motor

Comando: `python tools/benchmark_engine.py --paragraphs 100`

| Medida | Resultado |
| --- | ---: |
| Texto de entrada | 90100 caracteres |
| Páginas generadas | 87 |
| Duración | 17,12 s |
| Pico de memoria RSS del proceso Python | 61,3 MiB |
| Archivos temporales de composición | 189,6 MiB |
| Resumen enviado al editor | 436 bytes |

La medición se realizó en Linux con Python 3.12.14 y el banco corregido de calibración. Es memoria del proceso Python, no memoria total Android/WebView ni una estimación del rendimiento en la Huawei. La imagen visible se solicita aparte del resumen. El directorio temporal del ensayo se elimina automáticamente.

## APK

`assembleDebug` se completó en GitHub Actions con JDK 17, Gradle 8.13, Android SDK 35 y Chaquopy 17.0/Python 3.11. El APK contiene exclusivamente `glyphs_v22.json`, el logo SVG y los iconos para las cinco densidades Android. Paquete `com.hinote.studio`, versión `2.2-tablet` (código 22), arquitectura arm64-v8a, Android API 24 mínimo y objetivo 35.

El APK de referencia generado midió 21965195 bytes y su SHA-256 fue `e3e0f13245f075827365dc8d32cf56e1c6515ba57cea0ef10cc3ed10bf5a0426`. Una recompilación de depuración puede producir otra firma y, por tanto, otro hash.

## Pendiente en el dispositivo

Instalar el APK, comprobar el logo, `_-Hola`, los tres tipos de lista y los símbolos corregidos, y después importar el `.hinote` en Huawei Notes. El procedimiento completo está en `PRUEBA_TABLET.md`.
