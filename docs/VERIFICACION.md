# Verificación de V22

Comprobaciones realizadas en el entorno de desarrollo el 26 de septiembre de 2026:

- 11 pruebas del motor aprobadas en Python 3.12.14. Incluyen paginación, cancelación, exportación, límites y una regresión nueva que verifica las ocho variantes de `•`, `*`, `<`, `+`, `=`, `%`, `#` y `@`, además de la altura independiente de `_` frente a `-`.
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

La compilación y la suite del editor se ejecutan en GitHub Actions antes de integrar V22 en `main`. El APK final y su SHA-256 se anotan aquí después de esa verificación.

## Pendiente en el dispositivo

Instalar el APK, comprobar el logo, `_-Hola`, los tres tipos de lista y los símbolos corregidos, y después importar el `.hinote` en Huawei Notes. El procedimiento completo está en `PRUEBA_TABLET.md`.
