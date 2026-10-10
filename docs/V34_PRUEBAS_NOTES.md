# HiNote Studio V34 Pruebas: Huawei Notes

Esta APK contiene las mismas correcciones 1–4 de V34. Se instala como **HiNote Studio Pruebas** (`com.hinote.studio.probe`), junto a la app normal, con borrador y ajustes independientes. Sus pruebas están en **Guardado → Pruebas Huawei Notes**. La transferencia editable mediante el portapapeles del lazo sigue sin estar confirmada.

## Resultado manual de partida

En la MatePad, Chrome conservó `PRUEBA-A` después de copiar tres rayas con el lazo de Notes. Después de copiar `PRUEBA-B` fuera de Notes, Notes siguió pegando las rayas. Es compatible con un almacenamiento interno de la selección; no demuestra que no exista otra interfaz pública.

## Pruebas en la tablet

1. **Portapapeles del lazo.** Pulsa Preparar PRUEBA-A, ve a Notes, dibuja tres rayas de colores, selecciónalas con el lazo y pulsa Copiar. Regresa a Pruebas y pulsa Examinar copiado. El informe compara el descriptor público con el control y registra tipos MIME, cantidad de elementos, URI y formatos accesibles. Copiar PRUEBA-B permite repetir la segunda parte de tu prueba: comprobar si Notes aún pega sus rayas.
2. **Compartir desde Notes.** En el menú del lazo pulsa Compartir y busca HiNote Studio Pruebas. Al regresar pulsa Examinar lo compartido. Si Notes comparte PNG/JPEG, hay transferencia de imagen; eso no acredita transferencia de sus trazos editables. Si comparte otro formato con permiso de lectura, el informe muestra MIME, firma y hash para investigarlo. Si la app no aparece, registra ese resultado en Observaciones.
3. **PNG de control.** Crea tu contenido en esta app de prueba, selecciona una página en la previsualización y abre el laboratorio. Pulsa Copiar página PNG (control). En Notes mantén pulsada una zona vacía y prueba Pegar. Un PNG se transfiere como imagen.
4. **Archivo nativo mediante portapapeles.** Pulsa Probar página .hinote en portapapeles y repite el pegado en Notes. Se ofrece una URI pública de un .hinote válido con una sola página: no se inventa un protocolo privado del lazo. Notes puede ignorarlo, seguir pegando su selección interna, mostrar una imagen o aceptarlo; registra lo que ocurre.
5. **Compartir una página.** Compartir página .hinote utiliza la hoja Compartir de Android. Si Notes abre otro cuaderno, ha aceptado la importación del archivo; aún no es pegado directo en tu cuaderno actual.
6. **Comprobar editabilidad.** Cuando aparezca contenido nuevo en Notes, usa el lazo y comprueba si puedes seleccionar o modificar un trazo individual. Un bloque de imagen o abrir otro cuaderno no prueba compatibilidad con el pegado nativo del lazo.
7. Selecciona los resultados, escribe las observaciones y pulsa **Guardar informe .json**. Envía ese archivo con capturas del contenido pegado y de los formatos que Notes ofrece al compartir.

La página de salida se compone de nuevo con los cambios actuales, la calibración y las imágenes de esa página. El .hinote conserva el binario de tinta nativo y los objetos de imagen. Solo se exporta la página elegida, sin las demás páginas del apunte.

## Alcance del diagnóstico

- Las lecturas del portapapeles ocurren por solicitud del usuario con la app visible; no hay vigilancia en segundo plano.
- Se registra el tamaño y un hash de texto, HTML y URI. El contenido de texto no se vuelca al informe, salvo los controles PRUEBA-A y PRUEBA-B. Los extras de Intents se describen por sus claves y no se ejecutan.
- Solo se intenta leer URI `content:` con permisos que Android ya concede; hasta 16 elementos y 2 MiB por flujo. Se registra un error si el flujo supera el límite o falta permiso. No se solicitan permisos privilegiados ni se leen los archivos internos de Notes.
- Los componentes exportados visibles de `com.huawei.hinote` se enumeran junto con sus permisos. Tener un componente exportado no demuestra un contrato de tinta accesible.
- La app recibe `ACTION_SEND`/`ACTION_SEND_MULTIPLE` únicamente en la variante de pruebas. Su proveedor solo expone las páginas generadas para estas pruebas, mediante permisos temporales de lectura. Las rutas y los modos de escritura se rechazan.
- Los informes quedan entre sesiones en el almacenamiento de la app y se exportan al destino elegido. Las páginas temporales pueden caducar; repite la copia para obtener otra URI.

## Referencias públicas consultadas

- [Android: Copy and paste](https://developer.android.com/develop/ui/views/touch-and-input/copy-paste): texto, URI y MIME del portapapeles del sistema.
- [Android: Sharing files](https://developer.android.com/training/secure-file-sharing): URI `content:` y permisos temporales de lectura.
- [Huawei PencilEngine](https://developer.huawei.com/consumer/cn/hms/huawei-pencilengine/): disponer de un motor de tinta no demuestra que Notes publique su protocolo de copiado del lazo.

La APK no declara una integración con PencilEngine ni el pegado del lazo como función terminada. Sirve para identificar qué rutas públicas acepta la versión instalada de Notes y obtener evidencia de la siguiente implementación.
