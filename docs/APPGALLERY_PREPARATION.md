# Preparación de HiNote Studio para AppGallery

La entrega 1.0.1 añade el acuerdo de licencia de la aplicación y utiliza
GitHub Pages directamente. Preparar los documentos y el APK no equivale a
la aprobación de Huawei ni habilita cobros.

## Datos para la ficha Android

| Campo | Valor |
| --- | --- |
| Nombre | HiNote Studio |
| Plataforma | Android; dispositivo objetivo: tablet |
| Paquete de actualización | `com.hinote.studio.v54maintenance` |
| Versión | 1.0.1; código 68 |
| Privacidad | https://victor55101.github.io/HiNote-Studio-Tablet/ |
| Acuerdo de licencia | https://victor55101.github.io/HiNote-Studio-Tablet/terms.html |
| Soporte | soporte.hinotestudio@gmail.com |

Seleccionar Android en AppGallery Connect. El APK actual no es un paquete
nativo de HarmonyOS. Conservar el paquete y el certificado de mantenimiento
para actualizar las instalaciones existentes.

El acuerdo se consulta en la bienvenida y en «Acerca de → Condiciones de uso».
La copia para adjuntar a Huawei está en [TERMS.md](TERMS.md); contiene el mismo
texto que la aplicación y la página pública. Los avisos de componentes siguen
separados y sus permisos no se sustituyen por la licencia de HiNote Studio.

## Decisión pendiente sobre la cláusula 3.12

Fuente: acuerdo de servicio de Huawei AppGallery Connect facilitado por el
titular, actualizado el 7 de septiembre de 2026, apartado 3.12.

La cláusula exige mantener gratuitos los productos que se ofrecieron
gratuitamente y relacionar los cargos adicionales con una edición alternativa
o complementaria. Cambiar de nombre, número de versión, paquete o redactar
otra licencia no elimina esa obligación.

La app mantiene su acceso gratuito, sin caducidad, bloqueo remoto, compras
integradas ni cobros posteriores. El acceso ya entregado a probadores se
respeta. No se ha decidido ni publicado una edición comercial.

Antes de un lanzamiento de pago:

1. Conservar la ficha de AppGallery como borrador y consultar por escrito a
   Huawei cómo aplica 3.12 a la prueba gratuita fuera de la tienda y a una
   prueba cerrada. No dar por hecho que llamarla «beta» crea una excepción.
2. Si Huawei exige separar la oferta, definir una edición gratuita que
   permanezca gratuita y una edición alternativa o complemento de pago con
   funciones y condiciones claramente diferenciadas. La separación debe
   aprobarse conforme a las reglas de Huawei; otro paquete por sí solo no basta.
3. Informar antes de cualquier compra qué se recibe, precio, soporte y
   procedimiento de reembolso. No imponer un pago para recuperar notas o
   funciones previamente entregadas gratis.
4. Completar Merchant Services y los acuerdos comerciales que Huawei exige
   para productos de pago en la cláusula 3.14, además de la información fiscal
   y bancaria aplicable. La cuenta de desarrollador por sí sola no los sustituye.

Consulta propuesta para soporte de Huawei, pendiente de envío:

> Soy desarrollador individual de HiNote Studio, una aplicación Android para
> tablets. Antes de publicarla en AppGallery he distribuido gratuitamente un
> APK a probadores fuera de la tienda y deseo conservar su acceso sin cargos
> retroactivos. ¿Cómo aplica la cláusula 3.12 a esta distribución y a las pruebas
> cerradas? ¿Es admisible un primer lanzamiento de pago en AppGallery manteniendo
> los derechos de esos probadores, o debe conservarse un producto gratuito y
> ofrecer una edición alternativa o complemento de pago? En ese segundo caso,
> ¿qué diferenciación y procedimiento exige Huawei para aprobar la oferta?

La redacción de las condiciones expresa el compromiso de respetar el acceso
gratuito; no constituye una autorización de Huawei para monetizar.

## Comprobaciones finales antes del envío

- Validar el APK final firmado: mismo certificado de mantenimiento, paquete,
  código 68, versión 1.0.1, documentos incluidos, Original con 110 caracteres y
  ocho variantes, y enlaces directos a GitHub Pages.
- Instalar como actualización sobre 1.0.0 en la tablet, sin desinstalar. Comprobar
  borrador, perfiles, bienvenida/Acerca de, temas y regreso al editor.
- Probar crear/guardar una nota, importar una calibración, usar un PDF y
  exportar/abrir `.hinote` en Huawei Notes. Indicar las versiones realmente probadas
  en la ficha; no prometer compatibilidad con todas las tablets.
- Adjuntar capturas reales, icono, descripción, categoría, clasificación de
  contenido, URL de privacidad y copia del acuerdo. Describir que no hay cuenta,
  anuncios ni compras integradas. Declarar los datos conforme al comportamiento
  real de la aplicación y al soporte voluntario, sin afirmar que la tienda no
  procesa datos de descargas o compras.
- Resolver el modelo gratuito/comercial antes de publicar. El envío a revisión,
  los acuerdos comerciales y cualquier compra requieren una decisión posterior
  del titular. Este cambio no los ejecuta.

`distribution/publication-status.json` informa si los documentos tienen sus
datos completos; mantiene `ready_for_store: false` hasta las comprobaciones
finales. No certifica cumplimiento jurídico ni sustituye la revisión de Huawei.
