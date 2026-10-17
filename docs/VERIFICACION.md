# Verificación de V29

## Tablas y previsualización

Estándar pasa a 60 %; el ajuste automático intenta 60/55/50 %. Los tamaños fijos anteriores se conservan y prevalecen sobre el modo general. Se corrige la diferencia entre valores de opción «0.60»/«0.50» y números recuperados «0.6»/«0.5», que dejaba el selector vacío sin cambiar los trazos.

La selección de celdas admite toques, fila, columna, tabla completa y rango con Mayús + clic. Alineación, posición vertical, tamaño, color y grosor actúan sobre la selección; se mantienen edición parcial de palabras, borrador y deshacer. Los valores distintos se muestran como Mixto. Las flechas se llaman Mover tabla arriba/abajo y explican su efecto sobre el orden del documento.

Los botones de la tabla se posicionan dentro de la intersección entre página y ventana de previsualización, también al desplazarla. La vista solicita resolución 1× o 2× con 220 ms de pausa tras el zoom, descarta resultados obsoletos y conserva la página ya dibujada al aumentar calidad. Máximo 1350 × 2160, 11,2 MiB por bitmap de tinta; esto no es la memoria total de Android/WebView. El renderizado nativo sigue en el trabajador único, admite cancelación y vuelve a 1× si falta memoria. Solo se conserva un archivo de tinta HD por instantánea. La cuadrícula se redibuja únicamente al cambiar su estado o resolución. Las miniaturas de exportación siguen a 675 × 1080.

La ejecución final [37167138418](https://github.com/Victor55101/HiNote-Studio-Tablet/actions/runs/37167138418), fuente `24c0d34ef410510b1cb901ee2ddbfb306acb6f8a`, aprobó **54 pruebas Python, 44 Chromium/Playwright y 21 Android/Robolectric: 119 en total**, y compiló el APK. Se comprobó selección táctil de celdas separadas, fila/columna/tabla/rango, formatos mixtos, valores 60/50 % visibles tras reabrir, precedencia de tamaño fijo, guardado, deshacer, orden del documento, controles dentro de la vista con zoom/desplazamiento, solicitudes de calidad acotadas y descarte de páginas obsoletas. Inspeccionadas las capturas del editor, selección múltiple y controles de vista. El puente Android está simulado en las pruebas web.

Las pruebas de gráficos Android comprueban transparencia, centro y cobertura del trazo a 1×/2×, límite de memoria por bitmap y limpieza al cancelar. La cobertura admite un cuarto de píxel base de cuantización del antialiasing; no exige que un píxel aislado sea opaco. Se mantienen las pruebas del papel exportado y grosor.

APK `HiNote-Studio-Tablet-V29.apk`: paquete `com.hinote.studio`, versión `2.9-tablet`/código 29, arm64-v8a, **22125555 bytes**. SHA-256: `efa138c3f68dcc6d12c60cf99dc3712ccce73a19b11ba86c4eae450d37ab48e4`. Verificados ZIP, manifiesto, coincidencia de los diez recursos del editor/banco, los diez módulos Python y el puente compilado `requestPageHD`. No incluye perfiles personales ni bancos antiguos.

La firma de depuración V29 (`396552cc…dd95d79`) es distinta de la V28 entregada (`921179a3…a2c6430`). Antes de desinstalar, respaldar calibraciones .hnprofile, exportar las notas y conservar el texto: desinstalar borra borrador, imágenes privadas y perfiles añadidos. Todavía no hay una clave estable de firma configurada.

El usuario mostró su tabla V28 importada en Huawei Notes. La apariencia y el rendimiento de V29 aún deben comprobarse físicamente en la MatePad; la resolución está acotada, pero las pruebas no representan la memoria total de Android/WebView. Procedimiento en `PRUEBA_TABLET.md`.

## Histórico: V28

## Corrección de alineación

Se reprodujo la captura del usuario con el banco Original. V27 insertaba medio cuadro vacío antes del tercer renglón porque comparaba las cajas verticales de dos líneas completas: un descendente y un acento en posiciones horizontales distintas provocaban una falsa colisión. V28 conserva el paso fijo de medio cuadro dentro de las celdas. Los saltos explícitos, incluida una línea vacía, se mantienen.

El segundo fallo se debía a calcular la línea del texto normal sumando un cuadro al borde inferior de la tabla. Cuando ese borde acababa a medio cuadro, el texto siguiente heredaba el mismo desplazamiento. V28 retoma la secuencia normal de líneas, con su margen y separación originales, y reserva espacio adicional para texto grande cuando hace falta. El tamaño de los caracteres no cambia. La transición entre tablas consecutivas y la paginación por filas siguen usando la geometría de tabla.

Se añadieron cuatro regresiones: acentos/descendentes con ajuste automático y saltos explícitos en ambos modos; líneas vacías intencionales; texto y listas tras alturas enteras y medias; y vuelta al margen superior al cambiar de página. Se inspeccionó una comparación vectorial antes/después del ejemplo recibido. La muestra personal no se incluye en el repositorio.

La ejecución [36536133716](https://github.com/Victor55101/HiNote-Studio-Tablet/actions/runs/36536133716), fuente `d0cda4adadef93f12675f86413d34a7b73256d33`, aprobó **53 pruebas Python, 38 Chromium/Playwright y 19 Android/Robolectric: 110 en total**, y compiló el APK V28.

APK `HiNote-Studio-Tablet-V28.apk`: paquete `com.hinote.studio`, versión `2.8-tablet`/código 28, arm64-v8a, **22122651 bytes**. SHA-256: `95992bab07aa59fe41b7b3f63f47cb7e9ae9f59002983ed9ae3016420fc893c1`. Se verificaron integridad ZIP, manifiesto, coincidencia de los diez recursos del editor/banco con la fuente, presencia de los diez módulos Python y del ajuste `table_bottom` en el módulo compilado. No se empaquetan perfiles personales ni bancos antiguos.

El certificado de depuración V28 (`921179a3…a2c6430`) difiere del V27 entregado (`914fdc70…850cabe`), por lo que no se puede instalar encima de aquel APK. Antes de desinstalar, respaldar las calibraciones `.hnprofile`, exportar notas y conservar el texto; desinstalar elimina borrador, imágenes privadas y calibraciones añadidas. Todavía no se configura una clave de firma estable.

La corrección se comprobó mediante composición local e inspección visual; queda confirmar su apariencia con el APK en la MatePad y al importar el `.hinote` en Huawei Notes. Hay que pulsar Actualizar y volver a exportar las notas anteriores para aplicar la nueva distribución. Las instrucciones de comprobación física están en `PRUEBA_TABLET.md`.

## Histórico: V27

## Tablas y muestra nativa

Implementación basada en la tabla que aportó el usuario: tres columnas de 4/5/6 cuadros y filas de 1/2/2/3/2/6 cuadros. La nota contiene 1098 trazos y 35096 puntos; incluye un rectángulo nativo cerrado y siete separadores independientes. El texto conserva los glifos de calibración con escala y grosor proporcionados.

Se reproduce el formato de los segmentos tipo 2 y la extensión del pie que referencia el rectángulo por UUID. Se contrastaron los dos tamaños globales con el binario real: el tamaño del bloque de trazos excluye la extensión de formas. El lector valida ambas longitudes y las referencias, incluyendo varias tablas en una página. La muestra personal solo se analiza localmente; los tests usan contenido sintético y el banco incluido.

Estándar usa 73 %. Compacta intenta 65/60/55/50 % por celda y permite crecer la fila si hace falta. La anchura se calcula a partir de los trazos reales, normalizando su origen, y las líneas se separan medio cuadro. La paginación mantiene cada fila entera, evita encabezados huérfanos y permite repetirlos. Una fila que no cabe en una página genera un error; las celdas enormes dejan de planificarse al superar la altura posible.

El editor incluye entrada por celda, formato parcial, alineación horizontal/vertical, medidas por medios cuadros, controles táctiles, pegado TSV, anclajes entre párrafos, deshacer y borrador con recuperación de edición pendiente. Se separaron los gestos de tabla de los de desplazamiento e imágenes. La cuadrícula de la previsualización con tablas utiliza el paso nativo de 40 px a escala de miniatura.

## Verificación automatizada

La ejecución final [36512156894](https://github.com/Victor55101/HiNote-Studio-Tablet/actions/runs/36512156894), fuente `e12e18dfa9ad20073ceb59840919b56f94766d15`, aprobó **49 pruebas Python, 38 del editor Chromium/Playwright y 19 Android/Robolectric: 106 en total**, y compiló el APK. Se cubren límites de tinta, media cuadrícula, Compacta, presión y variantes, color, filas completas, encabezados, filas demasiado altas, planificación acotada, varias tablas/formas nativas, cancelación, exportación, borrador, formato parcial, pegado y gestos táctiles. Los selectores y el puente Android se simulan en las pruebas web.

La prueba táctil descubrió que, tras arrastrar, Chromium podía emitir el toque completo sin el clic de compatibilidad. El botón de edición reconoce ahora la liberación de un toque corto y conserva la activación por teclado. Esa regresión pasa en la ejecución final.

APK `HiNote-Studio-Tablet-V27.apk`: paquete `com.hinote.studio`, versión `2.7-tablet`/código 27, arm64-v8a, **22122651 bytes**. SHA-256: `ec9dce73c3a0c8724cf9c459c5f12ba9e957b88f3b3626544254222a76318c30`. Verificadas integridad ZIP, versión en el manifiesto binario, coincidencia de los diez recursos HTML/JS/CSS/SVG/JSON con la fuente y presencia de los diez módulos Python, incluido `table_composer`. No se empaquetan perfiles personales ni bancos antiguos.

El certificado de depuración V27 (`914fdc70…850cabe`) es distinto al del APK V26 entregado (`6feb0421…9089f`). No permite actualizar directamente aquella instalación. Antes de desinstalar, respaldar perfiles `.hnprofile`, exportar notas y conservar una copia del texto: desinstalar elimina borrador, imágenes privadas y calibraciones añadidas. Esta compilación todavía no configura una clave de firma estable para futuras actualizaciones.

Ensayo de carga en Linux/Python 3.12: una tabla de **73320 caracteres**, 130 filas y tres columnas produjo **26 páginas** en **31,41 s**, con **111,9 MiB de pico RSS** y un resumen de **4303 bytes**. Sin avisos de glifos. Se mantiene composición por páginas, caché acotada y cancelación. Esta medida no representa la memoria total Android/WebView ni el rendimiento físico de la MatePad.

La edición nativa del rectángulo y la apariencia final de V27 todavía requieren abrir el archivo exportado en la tablet. No hay celdas combinadas. Procedimiento en `PRUEBA_TABLET.md`.

## Histórico: V26

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
