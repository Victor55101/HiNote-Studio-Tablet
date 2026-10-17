# HiNote Studio V36 Pruebas

Base: V35 (`3d43b57356941dbb700a26f2dea8395dc105584d`). Conserva sus correcciones de grosor de gráficas, fórmulas y cinta de opciones. Añade dos experimentos de transferencia de trazos. No se ha validado todavía su recepción como tinta editable en una tablet Huawei; el informe distingue gestos enviados de resultados observados por el usuario.

## Instalación

El APK final usa `com.hinote.studio.probe35`, versionCode 36, `3.6-tablet-pruebas`, y la misma firma conservada que V35 Pruebas. El identificador interno se mantiene para actualizar V35 Pruebas y conservar sus datos. La app se muestra como **HiNote Studio Pruebas V36**. La edición estable sigue en V35 y no registra el servicio de accesibilidad.

Los artefactos automáticos de Actions tienen la firma temporal del runner; el APK entregado se vuelve a firmar con la clave privada conservada fuera del repositorio. No desinstales la edición anterior para instalar el APK firmado entregado.

## Antes de probar

1. Abre **Guardado → Pruebas Huawei Notes → Accesibilidad**.
2. En los ajustes de la tablet activa **HiNote · Pruebas de trazos**. El servicio puede consultar los controles visibles de Notes y enviar gestos; es necesario para ambos modos. Activarlo no inicia ninguna prueba. Después vuelve al panel.
3. Comienza con las tres rayas y una página de prueba en Notes. Solo después prueba una página de tu apunte.
4. El panel flotante permite **Detener / cerrar**. Si tapa los botones de Notes, desplaza horizontalmente sus botones y pulsa **Ocultar 10 s**. Regresa después por sí solo. Al terminar puedes desactivar el servicio en Accesibilidad.

## Modo 1: dibujar mediante accesibilidad

Pulsa **Probar tres rayas**. En Notes abre una página vacía, selecciona un lápiz y permite escribir con el dedo. En el panel flotante pulsa **Marcar zona**, arrastra un rectángulo dentro del papel y confirma abajo con **Usar esta zona**. La previsualización verde no dibuja sobre Notes. Pulsa **Dibujar**: hay una cuenta atrás de dos segundos. Mantén quieta la página hasta que termine.

Prueba después el lazo de Notes: selecciona y mueve solo una raya. Si la hoja se desplaza o no aparece tinta, anótalo; que Android acepte un gesto no demuestra que Notes lo interprete como escritura.

**Dibujar página actual** usa los trazos de la página seleccionada en la previsualización de HiNote, recompuesta con los cambios actuales. Ajusta el contenido a la zona marcada sin deformarlo. La prueba admite hasta 600 trazos y 120 000 puntos; rechaza páginas más grandes o con imágenes sin truncarlas. El lápiz activo de Notes determina color y grosor: este modo no reproduce los colores, la presión ni el ancho original de cada trazo.

## Modo 2: cuaderno temporal y copiado interno

Pulsa **Preparar tres rayas nativas**. Se genera un `.hinote` de una página con tres trazos nativos negro, rojo y azul. **Preparar página actual** conserva el BIN nativo de la página seleccionada. No convierte los trazos en una imagen. Las páginas con imágenes se rechazan para esta prueba.

La app intenta abrir el archivo en Notes mediante una intención pública y un permiso temporal de lectura. Completa la importación y abre su página. Si la apertura directa no funciona, vuelve a HiNote, pulsa **Guardar temporal .hinote**, impórtalo desde Notes y luego pulsa **Continuar con el lazo** en HiNote. El temporal es un cuaderno separado y no se elimina automáticamente.

En Notes activa su herramienta **lazo**. En el panel de HiNote marca un rectángulo que rodee los trazos y pulsa **Trazar lazo**. La app enviará el gesto cerrado e intentará pulsar un único botón accesible con el nombre exacto **Copiar/Copy**. Si Notes no expone ese botón, puedes pulsarlo manualmente o usar **Ubicar Copiar**: toca su centro y confirma abajo para enviar un toque a esa posición. No se adivinan coordenadas del menú ni se usa la acción genérica de copiar texto.

Abre el cuaderno destino y usa **Pegar** en el menú de Notes. Comprueba con su lazo que cada raya pueda moverse por separado. Este modo asiste la selección y el copiado dentro de Notes; no accede a su portapapeles privado ni garantiza que la copia haya ocurrido solo porque un clic fue enviado.

## Informe

Vuelve a HiNote, pulsa **Actualizar estado**, elige el resultado de cada modo y escribe lo que ocurrió. Los selectores y observaciones sobreviven a una recarga. Pulsa **Guardar informe .json** y envíalo junto con las capturas pertinentes.

El informe contiene etapas, número de gestos completados, apertura del temporal, resultado del intento de pulsar Copiar y tus observaciones. No registra el texto del apunte, las coordenadas de sus trazos ni capturas de pantalla. Los diagnósticos de V34–V35 quedan en un apartado plegado para comparar informes anteriores.

## Implementación y comprobaciones

- Servicio registrado solo en la variante Pruebas y protegido por `BIND_ACCESSIBILITY_SERVICE`; se activa manualmente desde Ajustes.
- Solo envía gestos con Notes en primer plano. Detiene la ejecución al salir de Notes, desconectar accesibilidad, cambiar orientación o pulsar Detener. El gesto que ya empezó puede terminar (hasta 600 ms al dibujar, 650 ms para el lazo).
- No arranca al conectar el servicio ni al preparar un archivo: la ejecución del dibujo o del lazo requiere marcar zona y pulsar el botón correspondiente dentro de Notes. Se cierra tras veinte minutos.
- Exportación del temporal mediante el mismo escritor y validador nativo; pruebas comparan el BIN de la página y comprueban los tres trazos, coordenadas y colores de la muestra.
- Pruebas Android para límites de geometría, escala proporcional, identificadores exactos de Copiar, destino y permiso de las intenciones, informe persistente y detención sin trabajo pendiente. Pruebas de interfaz para ambos modos, errores y persistencia de resultados, además de las regresiones de V35.
- No usa root, permisos de firma de Huawei, proveedores privados ni protocolos de lasso inventados.

Referencias públicas de Android: [AccessibilityService](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService), [StrokeDescription](https://developer.android.com/reference/android/accessibilityservice/GestureDescription.StrokeDescription), [AccessibilityNodeInfo](https://developer.android.com/reference/android/view/accessibility/AccessibilityNodeInfo).
