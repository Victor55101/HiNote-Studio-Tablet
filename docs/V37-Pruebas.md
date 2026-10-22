# HiNote Studio V37 Pruebas

Actualiza V36 Pruebas y conserva la base V35. Paquete `com.hinote.studio.probe35`, versionCode 37, nombre `HiNote Studio Pruebas V37`. El APK entregado se firma con la misma clave de V35/V36 Pruebas.

## Motivo de la corrección

En la tablet de prueba, V36 completó los gestos de tres rayas pero Notes no dibujó tinta. El usuario confirmó que sí puede escribir con su dedo en esa hoja. El temporal se importó correctamente; el lazo y el toque automatizado de Copiar no lograron el resultado esperado.

Se encontró un fallo concreto: el selector enviaba la confirmación en `ACTION_DOWN`, antes de que el usuario soltara el dedo. Al confirmar Copiar podía iniciar el gesto sintético mientras el toque físico seguía activo. V37 confirma en `ACTION_UP`, descarta cancelaciones y liberaciones fuera del botón, retira los controles y espera 500 ms antes del toque.

Para investigar el dibujo sin tinta se retiran todos los controles flotantes antes de enviar los gestos. Esto elimina una posible interferencia; todavía debe verificarse en la tablet. Durante el envío se puede detener saliendo de Notes o con la acción Detener de la notificación, cuando el sistema permite notificaciones. Al terminar reaparece el panel y permite registrar «Sí veo tinta» o «No apareció tinta». El informe distingue esta observación del resultado que comunica Android.

La búsqueda de Copiar revisa también las ventanas emergentes de Notes, elimina coincidencias duplicadas y requiere un único botón con el nombre exacto. No adivina coordenadas. El botón «Ya seleccioné con el lazo» permite usar una selección que el usuario hizo manualmente sin tener que enviar antes otro gesto de lazo.

## Comprobación breve

1. Instala V37 sobre V36 Pruebas. En Guardado → Pruebas Huawei Notes pulsa Actualizar estado; si el servicio está desconectado, actívalo en Accesibilidad → Servicios instalados → HiNote · Pruebas de trazos.
2. Prueba 1: pulsa Probar tres rayas, abre la hoja vacía de Notes, selecciona el lápiz y marca una zona. Pulsa Dibujar y suelta el dedo. El panel se oculta durante el envío. Cuando vuelva, pulsa Sí veo tinta o No apareció tinta. Si hay tinta, comprueba con el lazo que puedas mover una raya por separado.
3. Prueba 2: abre el temporal ya importado y usa Continuar con el lazo desde HiNote. Activa tú la herramienta de lazo de Notes y selecciona las rayas. En el panel pulsa Ya seleccioné con el lazo. Puedes probar Copiar o Ubicar Copiar; en este último señala el botón visible de Notes, confirma abajo y suelta el dedo. Espera antes de tocar la pantalla. Después abre el cuaderno destino y comprueba qué pega Notes.
4. En HiNote elige los resultados de ambos modos, añade las observaciones y guarda el informe JSON. El servicio no puede verificar por sí solo que haya tinta o que el portapapeles interno de Notes haya cambiado.

El servicio no activa automáticamente la herramienta de lazo ni cambia el lápiz de Notes. La prueba 2 sigue pasando por un cuaderno temporal; no implementa un protocolo privado de copiado entre apps.

## Verificación

Se añade una regresión Android que mantiene la selección abierta mientras el dedo está presionado, comprueba que cancelar o soltar fuera del botón no confirma, y solo completa la confirmación al soltar dentro. Se ejecutan además las pruebas de Android de ambas variantes, del motor de exportación y de la interfaz. El éxito de estas pruebas no sustituye la comprobación física con Huawei Notes.
