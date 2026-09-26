# Comprobación en la tablet

1. Conserva una copia del texto de la instalación anterior y de tus notas antes de cambiar de APK.
2. Confirma que el nuevo logo aparezca tanto en el lanzador de Android como en el encabezado del editor.
3. Escribe `_-Hola`: `_` debe quedar debajo de `-`, usando dos trazos de calibración distintos. Crea además una lista `• Viñeta`, otra `* Asterisco` y otra `- Guion`; comprueba que se vean respectivamente como círculo, asterisco y guion manuscritos.
4. Escribe una nota corta con `l`, `Y`, tildes, `ñ`, `+`, `=`, `%`, `#`, `@`, `<` y puntuación. Revisa los avisos sobre caracteres sin calibrar.
5. Selecciona texto y aplica tamaños, color y opacidad. Repite un tamaño y comprueba que no se multiplica. Prueba deshacer y rehacer, pegar varias líneas en medio de un párrafo y continuar/terminar listas con Enter.
6. Cierra y abre la app: comprueba el borrador, su formato y el título. Prueba el teclado virtual que utilizas habitualmente y la selección táctil.
7. Genera varias páginas. Revisa primera, intermedia y última; guarda el `.hinote`, impórtalo en Huawei Notes y compara los trazos y el número de páginas. Verifica los trazos editables con el lápiz.
8. Prueba un documento largo aumentando gradualmente su tamaño. Actualiza manualmente; cambia de página y cancela una generación. Cancela también el selector de guardado y una exportación en marcha.
9. Si aparece un fallo, anota modelo de tablet, versión de HarmonyOS/EMUI y Huawei Notes, caracteres/páginas, pasos exactos y mensaje visible. Adjunta un texto de ejemplo sin información privada y, si es posible, el registro de Android Studio/logcat.

La reconstrucción del formato `.hinote` se basa en la plantilla del proyecto. La importación y el consumo total de memoria requieren comprobación en el dispositivo; las pruebas automatizadas cubren estructura, hashes, trazos, cancelación y edición.
