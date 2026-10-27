# HiNote Studio 1.0.0

Base funcional V54.4. Nombre público `1.0.0`, código interno 67 y paquete
`com.hinote.studio.v54maintenance`. La firma de mantenimiento se conserva para
actualizar las instalaciones anteriores sin desinstalar.

## Original completa

El respaldo ampliado confirmado conserva exactamente los 105 caracteres de la
biblioteca anterior y añade `! ¡ & $ °`, con ocho variantes de cada uno. Se
incorpora únicamente esa ampliación de trazos y desplazamientos al recurso
protegido; el archivo de respaldo, su nombre y sus identificadores privados no
se añaden al repositorio. Original mantiene su identidad protegida y reúne
110 caracteres básicos completos. Las calibraciones del usuario se conservan.

La CI pública compila con el banco histórico de 105 caracteres. Antes de la
firma final, `package_original.py` utiliza el respaldo privado para incorporar
los cinco caracteres al APK local y ejecuta `zipalign` con páginas de 16 KB.
El verificador de la entrega firmada exige los 110 caracteres y la revisión
`v25`; una candidata sin esa ampliación no supera la verificación final.

El inicio actualiza el recurso integrado aunque exista la copia antigua en el
almacenamiento de la app. La revisión del banco pasa a `v25`, conservando el
nombre de archivo interno por compatibilidad con el motor.

## Selección e importación

La etiqueta «activa» se calcula a partir de la escritura aplicada al documento
cada vez que cambia. Consultar otro perfil no lo activa automáticamente.

La confirmación de importación conserva su aspecto y sus acciones Guardar
perfil / Descartar, pero se muestra en una franja superior fuera del panel que
desplaza los caracteres. No mueve el foco ni abre el teclado o una ventana
adicional. Guardar un perfil no cambia automáticamente la letra del documento.

## Privacidad y página web

La redacción describe a HiNote Studio directamente, explica ARCO y distingue
el plazo para responder del plazo para realizar la acción. «Responsable y
contacto» ocupa el apartado 10; las referencias internas siguen ese orden.
El aviso de la app y el público parten del mismo contenido.

El acceso web abre una página independiente con privacidad, contacto y
licencias, sin enlaces al repositorio del código de la app:

https://hinote-studio-privacidad.fond-clock-3967.chatgpt.site

La página es pública. La visibilidad del repositorio de desarrollo no cambia.
Las licencias originales, incluido SQLite suministrado por Python/Chaquopy,
se conservan.

## Entrega

La CI entrega una candidata **sin firmar**, identificada como no instalable para
evitar confundirla con la descarga final. El APK entregado al usuario se firma
localmente con v1/v2/v3 y se verifica después de firmarlo. La clave privada se
mantiene fuera del repositorio y de CI.
