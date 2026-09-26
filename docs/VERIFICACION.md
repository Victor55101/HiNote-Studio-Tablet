# Verificación de V21

Comprobaciones realizadas en el entorno de desarrollo el 24 de septiembre de 2026:

- 10 pruebas del motor aprobadas en Python 3.11.16 y 3.12.14: paginación, equivalencia del modo por páginas, cancelación y limpieza, exportación con los mismos binarios, hashes, fallo de exportación, palabras largas, Unicode, estados e índices de los puntos y límites.
- 15 pruebas del editor aprobadas en Chromium 140 con Playwright 1.55.0: pegado multilínea, posición del cursor, listas, estilos sucesivos, límites de selección, mayúsculas con acentos, deshacer/rehacer, borrador, respuestas obsoletas, bloqueo durante el guardado, entrada de teclado virtual/IME, pegado grande y ajustes de página.
- La prueba del editor utiliza un puente Android simulado. No comprueba por sí sola la comunicación Java/Chaquopy ni el renderizado Canvas nativo.

## Carga reproducible del motor

Comando: `python tools/benchmark_engine.py --paragraphs 100`

| Medida | Resultado |
| --- | ---: |
| Texto de entrada | 90100 caracteres |
| Páginas generadas | 87 |
| Duración | 10,94 s |
| Pico de memoria RSS del proceso Python | 71,2 MiB |
| Archivos temporales de composición | 189,6 MiB |
| Resumen enviado al editor | 436 bytes |

La medición se realizó en Linux con Python 3.12.14 y el banco de calibración del repositorio. Es memoria del proceso Python, no memoria total Android/WebView ni una estimación del rendimiento en la Huawei. La imagen visible se solicita aparte del resumen. El directorio temporal del ensayo se elimina automáticamente.

## APK generado

Compilación `assembleDebug` completada con JDK 17, Gradle 8.13, Android SDK 35 y Chaquopy 17.0/Python 3.11. Paquete `com.hinote.studio`, versión `2.1-tablet` (código 21), arquitectura arm64-v8a, Android API 24 mínimo y objetivo 35. Firma de depuración comprobada con `apksigner verify`. Se comprobó que los recursos del APK coinciden con el editor, HTML y calibración originales de esta entrega.

Archivo: `HiNote_Studio_Tablet_V21_Debug.apk` (21821452 bytes).

SHA-256: `35502815cae4303f0368fb2d7b91517e11384c188e337581916127885edf26de`.

## Pendiente en el dispositivo

Instalar el APK, comprobar entrada táctil/teclado, generación y cancelación de notas extensas, y comparar la primera, intermedia y última página importada en Huawei Notes. El procedimiento está en `PRUEBA_TABLET.md`.

Los límites de trabajo evitan cargas ilimitadas, pero la memoria y el espacio disponibles varían entre dispositivos. La validación binaria comprueba la estructura reconstruida del formato; la compatibilidad con Huawei Notes requiere una importación real.
