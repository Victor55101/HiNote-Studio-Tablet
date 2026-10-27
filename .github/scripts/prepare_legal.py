"""Generate the same offline/public policy and fail closed for store submissions."""
from __future__ import annotations

import argparse
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[2]
ASSETS=ROOT/'HiNote_Studio_Tablet_Android/app/src/main/assets/legal'
PUBLISHER=ROOT/'distribution/publisher.json'

def pending_fields(config):
    missing=[]
    for key in ('publisher_name','postal_address','privacy_email','policy_url','terms_url','terms_version'):
        if not isinstance(config.get(key),str) or not config[key].strip():missing.append(key)
    email=config.get('privacy_email','')
    if email and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):missing.append('valid_privacy_email')
    url=urlparse(config.get('policy_url',''))
    if config.get('policy_url') and (url.scheme!='https' or not url.hostname or url.username or url.password):missing.append('https_policy_url')
    terms_url=urlparse(config.get('terms_url',''))
    if config.get('terms_url') and (terms_url.scheme!='https' or not terms_url.hostname or terms_url.username or terms_url.password):missing.append('https_terms_url')
    if config.get('email_verified') is not True:missing.append('email_verified')
    if config.get('policy_url_verified') is not True:missing.append('policy_url_verified')
    if config.get('terms_url_verified') is not True:missing.append('terms_url_verified')
    return missing

def page(title,body):
    return '''<!doctype html><html lang="es-MX" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-src 'none'">
<title>'''+html.escape(title)+''' · HiNote Studio</title><style>
:root{color-scheme:light;--bg:#f4f5f3;--ink:#20272e;--muted:#5a6872;--line:#cbd3d6;--accent:#126681;--warn:#fff0c6}
[data-theme=dark]{color-scheme:dark;--bg:#161b20;--ink:#dde4e9;--muted:#a6b4bf;--line:#3e4b55;--accent:#a8cdd8;--warn:#493e27}
*{box-sizing:border-box}body{margin:auto;padding:24px;max-width:850px;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,sans-serif}
h1{font-size:29px;line-height:1.25}h2{font-size:20px;margin-top:30px;color:var(--accent)}h3{font-size:17px}a{color:var(--accent)}
small,.muted{color:var(--muted)}.notice{padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--warn)}
li{margin:8px 0}dl{border-left:3px solid var(--accent);padding-left:16px}dt{font-weight:650}dd{margin:0 0 12px;overflow-wrap:anywhere}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 ui-monospace,monospace}details{border-top:1px solid var(--line);padding:16px 0}summary{cursor:pointer;font-weight:650}
</style></head><body>'''+body+'''</body></html>'''

def privacy(config):
    esc=lambda key:html.escape(config.get(key,'').strip()) or 'Pendiente de completar antes de publicar'
    ready=not pending_fields(config)
    banner='' if ready else '<p class="notice" role="status"><strong>Aviso para revisión.</strong> Falta completar los datos del responsable y habilitar los canales de contacto y consulta antes de publicar este aviso.</p>'
    contact=esc('privacy_email')
    if config.get('email_verified') is True and config.get('privacy_email'):
        contact='<a href="mailto:'+html.escape(config['privacy_email'],quote=True)+'">'+contact+'</a>'
    body='''<h1>Política de privacidad de HiNote Studio</h1>
<p class="muted">Versión del aviso: '''+esc('policy_version')+''' · Aplicación Android · México</p>'''+banner+'''
<p>HiNote Studio convierte texto en trazos de escritura personal mediante calibraciones y crea archivos compatibles con Huawei Notes. Este aviso describe el funcionamiento de la aplicación y el tratamiento de información asociado a su uso.</p>
<h2>1. Lo esencial</h2><ul>
<li>El contenido de tus notas y tus calibraciones se procesa en tu dispositivo. La aplicación no dispone de permiso de Internet ni incorpora un servicio propio para recibir ese contenido.</li>
<li>HiNote Studio no requiere una cuenta ni incorpora anuncios, analítica de uso, identificadores publicitarios o informes automáticos de errores.</li>
<li>Tú eliges los archivos que importas, la carpeta donde guardas y cuándo exportas un cuaderno a Huawei Notes.</li>
<li>La aplicación no vende tus datos ni envía tus notas al desarrollador en segundo plano.</li></ul>
<h2>2. Información que utiliza la aplicación</h2>
<p>Para las funciones que solicites, la aplicación puede almacenar localmente el título y texto de la nota, sus estilos, listas, tablas, fórmulas y gráficas; muestras de escritura y nombres de perfiles; imágenes y documentos PDF importados; cuadernos .hinote seleccionados; y ajustes como tema, modo de teclado, vista, carpeta de guardado y si se mostró la bienvenida. El contenido puede incluir datos personales si tú los introduces en las notas o archivos. Estos datos locales no se envían al responsable por utilizar la app.</p>
<p>Las calibraciones se utilizan para componer los trazos que solicites. HiNote Studio no identifica personas ni autentica su identidad mediante la escritura. Usa muestras propias o para las que tengas autorización.</p>
<h2>3. Para qué se utiliza</h2>
<p>La información se utiliza para editar y recuperar tu trabajo, mostrar la previsualización, aplicar tu escritura, distribuir contenido por páginas, gestionar archivos y crear los cuadernos que decidas guardar o abrir en Huawei Notes. No se utiliza para publicidad, entrenar modelos remotos o elaborar perfiles comerciales.</p>
<h2>4. Archivos, carpetas y portapapeles</h2>
<p>La app utiliza los selectores de archivos de Android. No solicita acceso general al almacenamiento, contactos, ubicación, cámara ni micrófono. Cuando seleccionas una carpeta para guardado, puede conservar la autorización otorgada por Android para guardar allí entre sesiones. Puedes quitar esa selección mediante «Archivo → Preguntar cada vez» o revocar el acceso desde los ajustes del sistema.</p>
<p>Al pegar, se lee el contenido compatible del portapapeles para conservar el texto y sus estilos. No se realiza vigilancia continua del portapapeles. El teclado que elijas puede procesar lo que escribes conforme a sus propios ajustes y política; HiNote Studio no controla ese tratamiento.</p>
<h2>5. Exportación y otras aplicaciones</h2>
<p>Al guardar, se crea un archivo en el destino que selecciones. Al usar «Exportar a Notes», se entrega a Huawei Notes acceso temporal de lectura a una copia del cuaderno. Huawei Notes administra después su propia copia, sus ajustes y, en su caso, su sincronización.</p>
<p><strong>PDF:</strong> los cuadernos que contienen páginas PDF pueden adjuntar el archivo PDF original completo, aunque hayas eliminado algunas de sus páginas visibles de la nota. Revisa el contenido del PDF original antes de compartir el cuaderno.</p>
<p>Si eliges una carpeta de un proveedor en la nube, el guardado o la sincronización de esa carpeta se rige por ese proveedor. Exportar un archivo no da acceso al desarrollador a su contenido.</p>
<h2>6. Conservación, respaldos y eliminación</h2>
<p>El borrador, los perfiles y los recursos importados se conservan localmente para recuperar tu trabajo hasta que los elimines o borres los datos de la aplicación. Algunos recursos internos pueden permanecer después de quitar un elemento del documento. Para eliminar todo el almacenamiento propio de HiNote Studio toca el logo y entra en «Acerca de → Datos locales → Borrar datos locales», o utiliza los controles de almacenamiento de Android.</p>
<p>Los temporales de composición se limpian al finalizar sesiones y mediante limpieza posterior. Las copias de exportación compartidas pueden permanecer en caché: al preparar nuevas exportaciones, la app elimina las que superan siete días. El sistema puede eliminarlas antes. No se promete un borrado automático a una hora exacta.</p>
<p>HiNote Studio configura exclusiones para el respaldo automático en nube y la transferencia automática de sus datos entre dispositivos. Su aplicación depende del sistema y del fabricante. Los respaldos que exportes manualmente son archivos independientes bajo tu control.</p>
<p>La eliminación de datos locales no elimina los archivos que guardaste fuera de la app ni las notas importadas en Huawei Notes. Antes de borrar o desinstalar, guarda tu trabajo y respalda los perfiles que quieras conservar.</p>
<h2>7. Seguridad</h2>
<p>HiNote Studio utiliza el almacenamiento privado y las protecciones que ofrece Android. El aviso de privacidad también se puede consultar sin conexión. Los archivos .hinote y .hnprofile que exportas no incluyen una contraseña ni cifrado propio: protege el dispositivo y comparte esos archivos solo con destinatarios de confianza.</p>
<h2>8. Soporte y derechos sobre tus datos</h2>
<p>Si escribes al correo de soporte, el responsable recibe tu dirección de correo y la información que decidas incluir, como tu nombre, la descripción del problema o archivos adjuntos. Estos datos se utilizan para atender y dar seguimiento a tu consulta, sin finalidades publicitarias. Comparte solo la información necesaria; no envíes notas completas, identificaciones o calibraciones si no hacen falta.</p>
<p>El correo se administra mediante Gmail, un servicio de Google con sus propias condiciones y política de privacidad. La app no obtiene acceso a tu cuenta de correo. Los mensajes se conservan durante la atención y el seguimiento de la consulta. Cualquier conservación posterior debe responder a una obligación legal o a la atención de responsabilidades que resulte aplicable al caso.</p>
<p>Puedes solicitar al responsable el ejercicio de los derechos ARCO respecto de los datos personales que tenga en su poder:</p>
<ul><li><strong>Acceso:</strong> conocer qué datos personales tiene y obtener acceso a ellos.</li>
<li><strong>Rectificación:</strong> corregir datos incorrectos o incompletos.</li>
<li><strong>Cancelación:</strong> solicitar su cancelación y eliminación cuando corresponda; puede ser necesario conservarlos bloqueados durante el plazo legal aplicable antes de suprimirlos.</li>
<li><strong>Oposición:</strong> oponerte a determinados usos de tus datos en los supuestos previstos por la ley.</li></ul>
<p>Envía tu solicitud al contacto del apartado 10. Indica tu nombre, un medio para responder, los datos relacionados y lo que solicitas. Solo se pedirá la información proporcional necesaria para comprobar la identidad o representación y localizar los datos. No hace falta enviar una identificación para realizar una consulta técnica de soporte.</p>
<p><strong>Plazo para responder:</strong> hasta veinte días hábiles desde la recepción de la solicitud ARCO para comunicar la decisión y sus motivos. <strong>Plazo para realizar la acción:</strong> si la solicitud procede, hasta quince días hábiles después de comunicar la respuesta para proporcionar acceso, corregir o llevar a cabo la medida correspondiente. Son plazos máximos; la solicitud puede atenderse antes.</p>
<p>Cuando las circunstancias del caso lo justifiquen, cada plazo podrá ampliarse una sola vez por otro periodo igual, conforme al artículo 31 de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares. Se informará al solicitante del motivo de la ampliación y del nuevo plazo.</p>
<p>También puedes solicitar por el mismo correo la revocación del consentimiento o la limitación del uso o divulgación de tus datos. Si alguna obligación legal impide eliminar de inmediato cierta información o atender íntegramente la petición, se explicará el motivo y el alcance de la respuesta.</p>
<p>Las notas y calibraciones que permanecen únicamente en tu dispositivo se gestionan desde la app: puedes editarlas, exportar perfiles y borrar los datos locales. El desarrollador no puede recuperar ni eliminar a distancia ese contenido.</p>
<h2>9. Cambios y alcance</h2>
<p>La versión del aviso aparece al inicio. El texto completo permanece accesible tocando el logo de la app y entrando en «Acerca de → Privacidad». Los cambios se informarán dentro de la aplicación y en la página pública del aviso. La bienvenida es informativa; el botón Continuar no es una autorización general para tratamientos nuevos. Un futuro servicio en línea, publicidad o tratamiento adicional deberá informarse antes de activarse y contar con la base jurídica que corresponda.</p>
<p>El aviso web se aloja en GitHub Pages, un servicio de GitHub. Al abrirlo, tu navegador se conecta directamente a ese alojamiento y comunica los datos técnicos necesarios para servir la página, como la dirección IP, conforme a la política de privacidad del proveedor. Consultar el aviso dentro de la app no necesita conexión.</p>
<p>HiNote Studio es un proyecto independiente. Huawei y Huawei Notes son denominaciones de sus respectivos titulares. Este aviso se refiere a HiNote Studio; consulta las condiciones de las otras aplicaciones y proveedores que decidas utilizar.</p>
<h2>10. Responsable y contacto</h2><dl>
<dt>Responsable · desarrollador independiente</dt><dd>'''+esc('publisher_name')+'''</dd>
<dt>Domicilio de contacto</dt><dd>'''+esc('postal_address')+'''</dd>
<dt>Soporte, privacidad y derechos sobre tus datos</dt><dd>'''+contact+'''</dd></dl>
<p><a href="terms.html">Consultar condiciones de uso</a> · <a href="licenses.html">Consultar componentes y licencias</a></p>'''
    return page('Política de privacidad',body)

def terms(config):
    esc=lambda key:html.escape(config.get(key,'').strip()) or 'Pendiente de completar antes de publicar'
    contact=esc('privacy_email')
    if config.get('email_verified') is True and config.get('privacy_email'):
        contact='<a href="mailto:'+html.escape(config['privacy_email'],quote=True)+'">'+contact+'</a>'
    body='''<h1>Condiciones de uso de HiNote Studio</h1>
<p class="muted">Acuerdo de licencia para la persona usuaria · Actualizado el '''+esc('terms_version')+'''</p>
<p>Estas condiciones explican el permiso para utilizar HiNote Studio y las responsabilidades relacionadas con su uso. Puedes consultarlas sin conexión desde «Acerca de → Condiciones de uso». La política de privacidad y las licencias de componentes se presentan por separado.</p>
<h2>1. La aplicación y su responsable</h2>
<p>HiNote Studio convierte texto en trazos de escritura personal mediante calibraciones, permite editar notas y crea archivos .hinote compatibles con Huawei Notes. El desarrollador responsable es '''+esc('publisher_name')+'''. Su información de contacto figura al final de este acuerdo.</p>
<h2>2. Permiso de uso</h2>
<p>El desarrollador te concede una licencia no exclusiva para instalar y utilizar la aplicación en dispositivos que controles, con fines personales, académicos o profesionales lícitos. El permiso abarca crear, guardar, respaldar y exportar tus notas y calibraciones. No se transfiere la propiedad intelectual de la aplicación.</p>
<p>HiNote Studio no reclama la propiedad de tus notas, textos, documentos ni muestras de escritura. Conservas los derechos que te correspondan sobre tu contenido y puedes utilizar los archivos que generes fuera de la aplicación.</p>
<h2>3. Acceso gratuito y ofertas de pago</h2>
<p>La aplicación no incluye cobros, suscripciones ni compras integradas. Las funciones ofrecidas gratuitamente se mantienen gratuitas para quienes las recibieron: no se exige un pago posterior para seguir utilizando ese acceso.</p>
<p>Cualquier edición alternativa o complemento de pago se identificará por separado y explicará sus funciones, precio y condiciones antes de la compra. Una descarga gratuita, el botón Continuar de la bienvenida o una actualización no autorizan cargos. No se incorporan una fecha de caducidad ni un bloqueo remoto del acceso gratuito.</p>
<h2>4. Uso permitido y derechos de terceros</h2>
<p>Utiliza contenido y muestras de escritura propios o para los que tengas autorización. No utilices la aplicación para suplantar identidades, falsificar firmas o documentos ni vulnerar derechos de otras personas. La escritura generada no acredita la identidad ni la autoría de una persona.</p>
<p>No presentes la aplicación como propia ni redistribuyas sus elementos protegidos sin autorización, salvo lo permitido por la ley o por las licencias aplicables. Los componentes de terceros conservan sus propios permisos y condiciones, que prevalecen para esos componentes. Este acuerdo no restringe los derechos que esas licencias te otorguen.</p>
<h2>5. Compatibilidad y relación con Huawei</h2>
<p>La compatibilidad depende de la tablet, el sistema y la edición de Huawei Notes instalada. Comprueba la importación y el aspecto de un archivo de prueba antes de confiar en un flujo de trabajo. Una actualización de otra aplicación o del sistema puede modificar la compatibilidad.</p>
<p>HiNote Studio es un proyecto independiente. Huawei y Huawei Notes pertenecen a sus respectivos titulares; su mención indica interoperabilidad y no implica patrocinio, afiliación ni aprobación por Huawei. La aplicación no sustituye a Huawei Notes.</p>
<h2>6. Guardado, respaldos y privacidad</h2>
<p>Las notas y calibraciones se procesan localmente. Guarda tu trabajo y respalda los perfiles que quieras conservar antes de borrar los datos, desinstalar o cambiar de dispositivo. El desarrollador no puede recuperar a distancia el contenido almacenado únicamente en tu tablet. Los archivos exportados no incluyen cifrado ni contraseña propios.</p>
<p>Consulta la <a href="privacy.html">política de privacidad</a> para conocer el uso de archivos, las copias temporales, los PDF adjuntos y los datos que puedas enviar voluntariamente al solicitar soporte.</p>
<h2>7. Soporte y mantenimiento</h2>
<p>Puedes comunicar problemas al correo de contacto indicando la versión instalada, el dispositivo y una descripción del fallo. Comparte solo la información necesaria. Se podrán ofrecer correcciones y mejoras, sin prometer una duración de soporte, una compatibilidad permanente o funciones futuras concretas.</p>
<p>La aplicación es una herramienta de edición: revisa el contenido y la exportación antes de entregarlos o compartirlos. Nada de lo indicado aquí excluye las garantías, las responsabilidades del proveedor ni los derechos de la persona consumidora que sean obligatorios según la legislación aplicable.</p>
<h2>8. Compras y reembolsos</h2>
<p>La descarga gratuita no genera un importe que reembolsar. Si se ofrecen productos de pago, antes de adquirirlos se informarán el canal de compra, el precio y el procedimiento de soporte y reembolso aplicable. Los derechos legales de la persona consumidora se respetan en todos los casos; estas condiciones no establecen una exclusión general de reembolsos.</p>
<h2>9. Cambios en estas condiciones</h2>
<p>La fecha del acuerdo aparece al inicio. Los cambios se comunicarán en la aplicación y en la página pública. No convierten retroactivamente el acceso gratuito en una obligación de pago. Los servicios opcionales o compras futuras requerirán la información y la aceptación que correspondan antes de activarse.</p>
<h2>10. Responsable y contacto</h2><dl>
<dt>Desarrollador responsable</dt><dd>'''+esc('publisher_name')+'''</dd>
<dt>Domicilio de contacto</dt><dd>'''+esc('postal_address')+'''</dd>
<dt>Soporte y consultas sobre estas condiciones</dt><dd>'''+contact+'''</dd></dl>
<p>Se respetan las disposiciones obligatorias aplicables en México y los derechos imperativos que correspondan en el lugar de residencia de la persona usuaria.</p>
<p><a href="privacy.html">Consultar privacidad</a> · <a href="licenses.html">Consultar componentes y licencias</a></p>'''
    return page('Condiciones de uso',body)

def licenses():
    body='''<h1>Componentes y licencias</h1><p>HiNote Studio utiliza los siguientes componentes. Las licencias originales se conservan en este apartado. La cuadrícula de exportación se genera mediante líneas y medidas funcionales; no se empaqueta la fotografía del papel ni la cubierta de la nota de origen.</p><p>El formato .hinote se utiliza para interoperabilidad con Huawei Notes. La aplicación no incluye el APK de Huawei Notes ni se presenta como una aplicación oficial de Huawei.</p>'''
    for path in sorted((ROOT/'distribution/third_party').glob('*.txt')):
        body+='<details><summary>'+html.escape(path.stem.replace('_',' '))+'</summary><pre>'+html.escape(path.read_text())+'</pre></details>'
    body+='<p><a href="privacy.html">Volver a la política de privacidad</a></p>'
    return page('Componentes y licencias',body)

LICENSE_LABELS={
    'Bzip2_License':('bzip2 1.0.8','Licencia bzip2'),
    'CPython_3_11_17_Additional_Notices':('Avisos adicionales de Python','Avisos originales de componentes documentados por Python'),
    'CPython_PSF':('Python 3.11.17','Python Software Foundation e historial'),
    'Certifi_Mozilla_Public_License_2':('Certifi','Mozilla Public License 2.0'),
    'Chaquopy_MIT':('Chaquopy 17.1.0','MIT'),
    'Libffi_MIT':('libffi 3.4.4','MIT'),
    'Manrope_OFL_1_1':('Manrope','SIL Open Font License 1.1'),
    'Mozilla_Public_License_2_Full':('Texto completo MPL 2.0','Mozilla Public License 2.0'),
    'OpenSSL_Apache_2':('OpenSSL 3.5.9','Apache License 2.0'),
    'Pyelftools_Public_Domain_BSD':('pyelftools 0.26','Dominio público y BSD'),
    'SQLite_Public_Domain':('SQLite 3.53.4','Dominio público'),
    'Setuptools_MIT':('Setuptools 68.2.2','MIT'),
    'XZ_Liblzma_Copyright':('XZ / liblzma 5.4.6','Avisos y licencias originales'),
}

def native_documents(config):
    policy=privacy(config)
    body=policy.split('<body>',1)[1].rsplit('</body>',1)[0]
    notice={'schema':2,'policy_version':config['policy_version'],
        'contact_email':config.get('privacy_email','') if config.get('email_verified') else '',
        'policy_url':config.get('policy_url',''),'policy_url_verified':config.get('policy_url_verified') is True,
        'welcome_summary':'HiNote Studio convierte texto en trazos con tu escritura. Tus notas, calibraciones y archivos se guardan y procesan en este dispositivo. La app no requiere una cuenta ni envía ese contenido al desarrollador. Tú eliges qué importar, guardar o exportar a Huawei Notes.',
        'privacy_html':body,
        'terms_version':config.get('terms_version',''),
        'terms_url':config.get('terms_url',''),'terms_url_verified':config.get('terms_url_verified') is True,
        'terms_html':terms(config).split('<body>',1)[1].rsplit('</body>',1)[0]}
    components=[]
    for path in sorted((ROOT/'distribution/third_party').glob('*.txt')):
        name,license=LICENSE_LABELS[path.stem]
        components.append({'id':path.stem,'name':name,'license':license,'text':path.read_text()})
    return notice,{'components':components}

class PolicyMarkdown(HTMLParser):
    """A public, readable policy rendered by GitHub from the same legal text."""
    def __init__(self):super().__init__(convert_charrefs=True);self.parts=[];self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag in ('h1','h2','h3'):self.parts.append('\n\n'+'#'*int(tag[1])+' ')
        elif tag in ('p','dl','dd'):self.parts.append('\n\n')
        elif tag=='li':self.parts.append('\n- ')
        elif tag in ('strong','b','dt'):self.parts.append('**')
        elif tag=='br':self.parts.append('  \n')
        elif tag=='a':self.links.append(dict(attrs).get('href',''));self.parts.append('[')
    def handle_endtag(self,tag):
        if tag in ('h1','h2','h3','p','dl','dd'):self.parts.append('\n\n')
        elif tag in ('strong','b'):self.parts.append('**')
        elif tag=='dt':self.parts.append('**\n\n')
        elif tag=='a':
            url=self.links.pop()
            url={'licenses.html':'../distribution/THIRD_PARTY.md','terms.html':'TERMS.md','privacy.html':'PRIVACY.md'}.get(url,url)
            self.parts.append(']('+url+')')
    def handle_data(self,data):
        value=data.replace('\\','\\\\').replace('<','&lt;').replace('>','&gt;')
        for char in ('[',']','*','_','`'):value=value.replace(char,'\\'+char)
        self.parts.append(value)
    def result(self):return re.sub(r'\n{3,}','\n\n',''.join(self.parts)).strip()+'\n'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--require-ready',action='store_true');args=parser.parse_args()
    config=json.loads(PUBLISHER.read_text());missing=pending_fields(config)
    ASSETS.mkdir(parents=True,exist_ok=True)
    text=privacy(config)
    (ASSETS/'privacy.html').write_text(text)
    (ASSETS/'terms.html').write_text(terms(config))
    (ASSETS/'licenses.html').write_text(licenses())
    notice,components=native_documents(config)
    (ASSETS/'notice.json').write_text(json.dumps(notice,ensure_ascii=False,indent=2)+'\n')
    (ASSETS/'licenses.json').write_text(json.dumps(components,ensure_ascii=False,indent=2)+'\n')
    public=ROOT/'docs/privacy';public.mkdir(parents=True,exist_ok=True)
    (public/'index.html').write_text(text)
    (public/'licenses.html').write_text(licenses().replace('href="privacy.html"','href="index.html"'))
    (public/'terms.html').write_text(terms(config).replace('href="privacy.html"','href="index.html"'))
    markdown=PolicyMarkdown();markdown.feed(notice['privacy_html'])
    (ROOT/'docs/PRIVACY.md').write_text(markdown.result())
    agreement=PolicyMarkdown();agreement.feed(notice['terms_html'])
    (ROOT/'docs/TERMS.md').write_text(agreement.result())
    report={'legal_information_complete':not missing,'ready_for_store':False,
        'policy_version':config['policy_version'],'terms_version':config.get('terms_version',''),
        'missing_fields':missing,'pending_checks':['signed_final_apk','physical_device_validation','appgallery_review']}
    (ROOT/'distribution/publication-status.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))
    if args.require_ready and missing:raise SystemExit('Store submission blocked: publisher/contact/policy URL information is incomplete.')

if __name__=='__main__':main()
