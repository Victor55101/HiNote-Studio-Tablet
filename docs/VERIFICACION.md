# Verificación de V26

Corrección del 28 de septiembre de 2026, basada en la plantilla completada y reexportada desde Huawei Notes que aportó el usuario. El usuario confirmó que el ajuste de grosor V25 funciona en su tablet.

## Reproducción y corrección

La nota real contiene una página, cinco caracteres (`! ¡ & $ °`), ocho variantes de cada uno, 68 trazos y 2131 puntos. Todos los trazos son de Rotulador (herramienta 12). Huawei guardó 66 como tipo 0 y dos como segmentos nativos de tipo 2: `!`, variante 5, e `¡`, variante 4. El código visual y la geometría de la plantilla pasaron la validación. Se reprodujo el error V25 al exigir exclusivamente tipo 0 al importar notas, pese a que los respaldos y el banco Original ya admitían tipo 2.

V26 comparte la validación de tipos 0/2 entre importación y respaldos, conservando los campos nativos de los segmentos. No convierte los trazos ni modifica su presión. Los tipos y herramientas desconocidos siguen rechazándose con mensajes distintos, indicando la página y el trazo. Se mantienen las comprobaciones de celdas, páginas, tamaños y límites.

Con el archivo real se comprobó:

- Completar Original crea **Original ampliada**, con **110 encontrados**, **0 faltantes** y ocho variantes para cada signo añadido. El banco Original permanece idéntico.
- Conservación de los 68 trazos y 2131 puntos de las 40 muestras: metadatos, tipos de punto, presión y datos auxiliares; las coordenadas solo se trasladan para el origen del glifo y la línea base.
- Guardar, respaldar y reimportar conserva el banco completo. Componer y exportar los ocho juegos de signos conserva los dos segmentos de tipo 2 y genera un `.hinote` estructuralmente válido.

La nota personal se analizó localmente. Las nuevas pruebas de regresión del repositorio usan coordenadas sintéticas con la misma combinación de trazos, incluidos los segmentos con ambos extremos en estado 4. Cubren completar Original, respaldo, composición/exportación y rechazo de tipos, herramientas o cruces de celda no admitidos.

## Pruebas y APK V26

[GitHub Actions 36466459733](https://github.com/Victor55101/HiNote-Studio-Tablet/actions/runs/36466459733), fuente `971de775ec2366e8cbdf4e3b4b588cbf726c4aaf` en `v23-images-touch`: **36 pruebas Python, 30 Chromium/Playwright y 19 Android/Robolectric aprobadas; 85 en total**. Las pruebas Android y la construcción del APK finalizaron correctamente. También se corrigió la altura del botón de importación cuando su texto ocupa dos líneas.

APK `HiNote-Studio-Tablet-V26.apk`: versión `2.6-tablet`/código 26, paquete `com.hinote.studio`, arm64-v8a, **22094970 bytes**. SHA-256: `1ab0ded334ac52582603aa540403431a1da45209031686b584a497bea78ffbbf`. Verificadas integridad ZIP, coincidencia de los recursos con la fuente probada e inclusión del importador corregido. No se incluyen perfiles personales en el APK.

Queda confirmar la importación con el APK V26 en la tablet y abrir allí una nota exportada con los nuevos signos. Se reutiliza exactamente el `.hinote` ya escrito; no hace falta rehacer la plantilla. Procedimiento en `PRUEBA_TABLET.md`. No se repitió la medición histórica de carga V25 porque esta corrección se limita al importador.

## Histórico: V25

Comprobaciones del 28 de septiembre de 2026. Compilación aprobada: [GitHub Actions 36399350735](https://github.com/Victor55101/HiNote-Studio-Tablet/actions/runs/36399350735), fuente `4c323b81471c75cb3f63658181e64fba4f40a647` en `v23-images-touch`.

- **34 pruebas Python aprobadas**. Incluyen todas las regresiones V24 y 14 pruebas de calibración/grosor: ocho variantes, línea base, origen horizontal independiente de la celda incluso al 200 %, protección de Original, perfiles parciales y fallback con normalización Unicode, ampliaciones, respaldo completo de Original (incluidos trazos de tipo 2), duplicación, eliminación recuperable, plantillas de 256 caracteres, cancelación, archivos corruptos, páginas mezcladas/desordenadas, guías movidas y trazos fuera de celda. Se comprueba que niveles 1–10 alteran el ancho nativo sin cambiar geometría ni presión y que los archivos de notas generadas no dependen de cambios posteriores del perfil.
- **30 pruebas Chromium/Playwright aprobadas**. Grosor por selección/listas, deshacer/rehacer, borrador; encontrados/faltantes por perfil, variantes incompletas y disponibilidad en Original; elección persistente, revisión antes de guardar, respuestas obsoletas, plantilla solo de faltantes y cancelación. El puente Android y los selectores están simulados.
- **19 pruebas Android/Robolectric aprobadas**, cero fallos. Las cuatro nuevas prueban identificación Unicode de la guía, recomprimir a JPEG/cambiar resolución, rechazo de código dañado/recorte y aumento de cobertura de tinta con grosores 1–3 sin desplazar el centro. Se mide la cobertura alfa para no confundir el antialiasing subpíxel con un ancho idéntico. Se mantienen las 15 pruebas de imágenes, papel y carpetas.
- Inspección visual de encontrados/faltantes y de la plantilla de ocho celdas: etiquetas, líneas base y código inferior legibles. El lector usa una etiqueta visual con checksum y valida su contenido; no depende de que Huawei conserve metadatos JSON ajenos, ni pretende hacer OCR.

**83 pruebas aprobadas en total.** Las pruebas de ida y vuelta de la importación usan notas sintéticas y guías renderizadas; no sustituyen exportar una plantilla escrita desde Huawei Notes en la tablet. El usuario ya confirmó las correcciones V24 de guion bajo, carpeta y fondo.

## Carga V25 y APK entregado

Comando: `python tools/benchmark_engine.py --characters 90100` (perfil Original, Linux/Python 3.12.14).

| Medida | Resultado |
| --- | ---: |
| Texto | 90100 caracteres |
| Páginas | 85 |
| Tiempo | 10,58 s |
| Pico RSS del proceso Python | 61,4 MiB |
| Archivos temporales | 191,4 MiB |
| Resumen enviado al editor | 906 bytes |

No es memoria total Android/WebView ni una medición de la MatePad. Los perfiles nuevos se procesan con límites de entrada y una caché acotada; falta medirlos en uso real en el dispositivo.

APK `HiNote-Studio-Tablet-V25.apk`: paquete `com.hinote.studio`, versión `2.5-tablet`/código 25, solo arm64-v8a, 22094958 bytes. SHA-256: `24eb6b5cbcb42b687c54710c5ad490892b0850be8235bee40f7881d4e6446417`. Se comprobó la integridad ZIP, la coincidencia de HTML/JS/CSS y banco Original con la fuente probada, y la inclusión de los nuevos módulos Python. Solo se empaqueta `glyphs_v24.json`; las calibraciones personales se guardan aparte y no lo sustituyen.

El valor inicial de grosor es **Calibrado**, no un reemplazo por nivel 2: preserva anchos originales, también los trazos reescalados de la calibración anterior. Al elegir 1–10 se escribe el campo nativo observado en las muestras (`nivel / 3`); la previsualización aproxima el pincel de Huawei. Probar primero una plantilla corta `a_!`, los grosores 1–3 y un respaldo. Procedimiento completo en `PRUEBA_TABLET.md`.

Antes de desinstalar por una posible diferencia de firma de APK de depuración, conservar texto, notas y respaldos `.hnprofile`: desinstalar borra datos privados, imágenes y perfiles.

## Histórico: V24

Comprobaciones realizadas en el entorno de desarrollo el 27 de septiembre de 2026:

- 20 pruebas del motor/exportación aprobadas en Python 3.11 dentro de GitHub Actions. Incluyen imágenes nativas, páginas sin trazos, referencias y hashes, conservación del binario manuscrito, límites, cancelación y separación de `_` respecto de `-`. Las nuevas comprobaciones cubren espacios iniciales, tabulaciones, espacios no separables, tamaños mezclados y sangrías extensas sin pérdida de texto ni desbordamiento.
- 25 pruebas del editor aprobadas en Chromium con Playwright 1.55.0. Cubren el editor e imágenes V23, conservación de espacios tras editar y recuperar el borrador, carpeta recordada, cancelación del selector, guardado directo y recuperación tras errores. Se verifica que las etiquetas de los botones de Guardado quepan completas. Los gestos de dos dedos se ejecutan mediante eventos táctiles de Chromium; el selector y el puente Android están simulados.
- 15 pruebas Android aprobadas con Robolectric SDK 28 y gráficos nativos: las ocho de imágenes V23, una de papel nativo y seis de carpeta de exportación. Se comprueban permisos persistentes, nombres únicos que conservan archivos anteriores, permisos revocados, carpeta no escribible, cancelación y eliminación de la preferencia. Las consultas usan un proveedor de documentos de prueba; no se ha ejecutado el selector del sistema en una tablet real.
- Inspección visual de la captura de Guardado y de la miniatura con papel nativo. La exportación sigue basándose en las 13 páginas y 15 elementos de imagen de las muestras de Huawei Notes proporcionadas: posición, tamaño, ángulo, orden entre imágenes y recortes materializados.
- La calibración V24 y el papel `base3` se reconstruyen de forma reproducible con `.github/scripts/prepare_assets.py`. El guion bajo queda 6,25 unidades lógicas más abajo que en V23 y debajo de la base de `Hola`; se mantienen las correcciones de listas y símbolos y el logo del usuario.
- Las miniaturas exportadas siempre usan el papel del modelo Huawei, independientemente de la cuadrícula opcional del editor. Se verifica su espaciado y color y que no reaparezca el trazo de la plantilla original. Las notas antiguas necesitan volver a exportarse e importarse para sustituir sus miniaturas.

Ejecución completa aprobada: [GitHub Actions 36285973576](https://github.com/Victor55101/HiNote-Studio-Tablet/actions/runs/36285973576), fuente `b963c4e2f1d7016a77767ef76b7d2c8f02def0dc` en `v23-images-touch`. Los tres grupos suman 60 pruebas aprobadas.

## Carga reproducible del motor: medición de V23

Comando: `python tools/benchmark_engine.py --characters 90100`

| Medida | Resultado |
| --- | ---: |
| Texto de entrada | 90100 caracteres |
| Páginas generadas | 85 |
| Duración | 10,35 s |
| Pico de memoria RSS del proceso Python | 61,3 MiB |
| Archivos temporales de composición | 189,8 MiB |
| Resumen enviado al editor | 860 bytes |

Esta medición histórica de V23 se realizó en Linux con Python 3.12.14 y el banco corregido de calibración; no se ha repetido para V24. Es memoria del proceso Python, no memoria total Android/WebView ni una estimación del rendimiento en la Huawei. La imagen visible se solicita aparte del resumen. El directorio temporal del ensayo se elimina automáticamente.

## APK

`testDebugUnitTest assembleDebug` se completó en GitHub Actions con JDK 17, Gradle 8.13, Android SDK 35 y Chaquopy 17.0/Python 3.11. El APK contiene exclusivamente el banco `glyphs_v24.json`, además del papel nativo, el editor de imágenes, el logo SVG y los iconos Android. Se comprobó la integridad ZIP y que los archivos HTML/JS/CSS empaquetados coinciden con la fuente probada. Paquete `com.hinote.studio`, versión `2.4-tablet` (código 24), arquitectura arm64-v8a, Android API 24 mínimo y objetivo 35.

El APK entregado mide 22043315 bytes y su SHA-256 es `3baf3efb29d22073ec0c0e99d9b6d822add9413441c98c23d31bfa64a29059aa`. Una recompilación de depuración puede producir otra firma y, por tanto, otro hash. Si Android rechaza la actualización por firma incompatible, guarda antes el texto y exporta tus notas: desinstalar elimina el borrador y sus imágenes privadas.

## Comprobación en el dispositivo

El usuario confirmó que V23 y la exportación/importación real con imágenes funcionan correctamente en MatePad Pro 2025, HarmonyOS 4.3.0 y Huawei Notes 12.4.3.380.

Posteriormente, el usuario confirmó en esa tablet la corrección completa del guion bajo, la selección de carpeta y el fondo exportado V24. No se ha recibido una medición física de memoria ni una confirmación específica de cada caso de espacios iniciales. Las pruebas en Linux/Chromium/Robolectric no sustituyen esas comprobaciones. El procedimiento está en `PRUEBA_TABLET.md`.
