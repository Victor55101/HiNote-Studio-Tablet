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
    for key in ('publisher_name','postal_address','privacy_email','policy_url'):
        if not isinstance(config.get(key),str) or not config[key].strip():missing.append(key)
    email=config.get('privacy_email','')
    if email and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):missing.append('valid_privacy_email')
    url=urlparse(config.get('policy_url',''))
    if config.get('policy_url') and (url.scheme!='https' or not url.hostname or url.username or url.password):missing.append('https_policy_url')
    if config.get('email_verified') is not True:missing.append('email_verified')
    if config.get('policy_url_verified') is not True:missing.append('policy_url_verified')
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
    banner='' if ready else '<p class="notice" role="status"><strong>Aviso para revisión.</strong> Esta versión está destinada a pruebas. Falta completar los datos del responsable y habilitar los canales de contacto y consulta antes de su publicación.</p>'
    contact=esc('privacy_email')
    if config.get('email_verified') is True and config.get('privacy_email'):
        contact='<a href="mailto:'+html.escape(config['privacy_email'],quote=True)+'">'+contact+'</a>'
    body='''<h1>Política de privacidad de HiNote Studio</h1>
<p class="muted">Versión del aviso: '''+esc('policy_version')+''' · Aplicación Android · México</p>'''+banner+'''
<p>HiNote Studio convierte texto en trazos de escritura personal mediante calibraciones y crea archivos compatibles con Huawei Notes. Este aviso describe el funcionamiento de la aplicación y el tratamiento de información asociado a su uso.</p>
<h2>1. Responsable y contacto</h2><dl>
<dt>Responsable · desarrollador independiente</dt><dd>'''+esc('publisher_name')+'''</dd>
<dt>Domicilio de contacto</dt><dd>'''+esc('postal_address')+'''</dd>
<dt>Privacidad y derechos sobre tus datos</dt><dd>'''+contact+'''</dd></dl>
<h2>2. Lo esencial</h2><ul>
<li>El contenido de tus notas y tus calibraciones se procesa en tu dispositivo. La aplicación no dispone de permiso de Internet ni incorpora un servicio propio para recibir ese contenido.</li>
<li>No se requiere crear una cuenta. Esta versión no incorpora anuncios, analítica de uso, identificadores publicitarios ni un servicio de informes automáticos de errores.</li>
<li>Tú eliges los archivos que importas, la carpeta donde guardas y cuándo exportas un cuaderno a Huawei Notes.</li>
<li>La aplicación no vende tus datos ni envía tus notas al desarrollador en segundo plano.</li></ul>
<h2>3. Información que utiliza la aplicación</h2>
<p>Para las funciones que solicites, la aplicación puede almacenar localmente el título y texto de la nota, sus estilos, listas, tablas, fórmulas y gráficas; muestras de escritura y nombres de perfiles; imágenes y documentos PDF importados; cuadernos .hinote seleccionados; y ajustes como tema, modo de teclado, vista, carpeta de guardado y si se mostró la bienvenida. El contenido puede incluir datos personales si tú los introduces en las notas o archivos. Estos datos locales no se envían al responsable por utilizar la app.</p>
<p>Las calibraciones se utilizan para componer los trazos que solicites. Esta versión no realiza identificación biométrica de personas ni autenticación mediante escritura. Usa muestras propias o para las que tengas autorización.</p>
<h2>4. Para qué se utiliza</h2>
<p>La información se utiliza para editar y recuperar tu trabajo, mostrar la previsualización, aplicar tu escritura, distribuir contenido por páginas, gestionar archivos y crear los cuadernos que decidas guardar o abrir en Huawei Notes. No se utiliza para publicidad, entrenar modelos remotos o elaborar perfiles comerciales.</p>
<h2>5. Archivos, carpetas y portapapeles</h2>
<p>La app utiliza los selectores de archivos de Android. No solicita acceso general al almacenamiento, contactos, ubicación, cámara ni micrófono. Cuando seleccionas una carpeta para guardado, puede conservar la autorización otorgada por Android para guardar allí entre sesiones. Puedes quitar esa selección mediante «Archivo → Preguntar cada vez» o revocar el acceso desde los ajustes del sistema.</p>
<p>Al pegar, se lee el contenido compatible del portapapeles para conservar el texto y sus estilos. No se realiza vigilancia continua del portapapeles. El teclado que elijas puede procesar lo que escribes conforme a sus propios ajustes y política; HiNote Studio no controla ese tratamiento.</p>
<h2>6. Exportación y otras aplicaciones</h2>
<p>Al guardar, se crea un archivo en el destino que selecciones. Al usar «Exportar a Notes», se entrega a Huawei Notes acceso temporal de lectura a una copia del cuaderno. Huawei Notes administra después su propia copia, sus ajustes y, en su caso, su sincronización.</p>
<p><strong>PDF:</strong> los cuadernos que contienen páginas PDF pueden adjuntar el archivo PDF original completo, aunque hayas eliminado algunas de sus páginas visibles de la nota. Revisa el contenido del PDF original antes de compartir el cuaderno.</p>
<p>Si eliges una carpeta de un proveedor en la nube, el guardado o la sincronización de esa carpeta se rige por ese proveedor. Exportar un archivo no da acceso al desarrollador a su contenido.</p>
<h2>7. Conservación, respaldos y eliminación</h2>
<p>El borrador, los perfiles y los recursos importados se conservan localmente para recuperar tu trabajo hasta que los elimines o borres los datos de la aplicación. Algunos recursos internos pueden permanecer después de quitar un elemento del documento. Para eliminar todo el almacenamiento propio de HiNote Studio toca el logo y entra en «Acerca de → Datos locales → Borrar datos locales», o utiliza los controles de almacenamiento de Android.</p>
<p>Los temporales de composición se limpian al finalizar sesiones y mediante limpieza posterior. Las copias de exportación compartidas pueden permanecer en caché: al preparar nuevas exportaciones, la app elimina las que superan siete días. El sistema puede eliminarlas antes. No se promete un borrado automático a una hora exacta.</p>
<p>Esta versión configura exclusiones para el respaldo automático en nube y la transferencia automática de datos de la app entre dispositivos. Su aplicación depende del sistema y del fabricante. Los respaldos que exportes manualmente son archivos independientes bajo tu control.</p>
<p>La eliminación de datos locales no elimina los archivos que guardaste fuera de la app ni las notas importadas en Huawei Notes. Antes de borrar o desinstalar, guarda tu trabajo y respalda los perfiles que quieras conservar.</p>
<h2>8. Seguridad</h2>
<p>Se utiliza el almacenamiento privado de la aplicación y el aislamiento que ofrece Android. El editor bloquea la navegación a sitios externos y este aviso se presenta con controles nativos, sin ejecutar JavaScript. La versión de distribución desactiva la depuración. No se añade una contraseña ni cifrado propio a los archivos .hinote o .hnprofile exportados: protege el dispositivo y comparte esos archivos solo con destinatarios de confianza.</p>
<h2>9. Solicitudes y comunicaciones voluntarias</h2>
<p>Puedes acceder al contenido en la app, corregir tus notas, exportar tus perfiles y eliminar los datos locales mediante los controles indicados. Si solicitas soporte y envías voluntariamente un mensaje, se tratarán los datos de contacto y la información que incluyas para atender tu solicitud. No envíes notas completas, identificaciones o calibraciones si no son necesarias.</p>
<p>El correo de soporte se administra mediante Gmail, un servicio de Google con sus propias condiciones y política de privacidad. Los mensajes se utilizan para atender y dar seguimiento a la consulta, sin finalidades publicitarias. Se conservan durante su atención y, después, únicamente mientras resulten necesarios para el seguimiento o para cumplir obligaciones legales y atender posibles responsabilidades. Las solicitudes de eliminación se revisan según esas obligaciones. La app no obtiene acceso a tu cuenta de correo.</p>
<p>Para solicitudes de acceso, rectificación, cancelación, oposición o revocación del consentimiento respecto de información que efectivamente obre en poder del responsable, utiliza el contacto indicado en el apartado 1, describe la solicitud y proporciona solo los datos necesarios para tramitarla. El desarrollador no puede recuperar a distancia las notas almacenadas únicamente en tu dispositivo.</p>
<p>La solicitud debe identificar a la persona titular, un medio para responder, los datos relacionados y el derecho o petición que se desea ejercer. Se podrá solicitar la información proporcional necesaria para acreditar la identidad o representación y localizar los datos; no se requiere enviar una identificación de forma preventiva para pedir soporte. Las solicitudes ARCO se atienden dentro de los plazos legales: hasta veinte días hábiles para comunicar la determinación y, si resulta procedente, hasta quince días hábiles adicionales para hacerla efectiva, con las ampliaciones que permita la ley. La revocación o limitación se puede solicitar por el mismo correo y se informará de las consecuencias o impedimentos legales aplicables.</p>
<h2>10. Cambios y alcance</h2>
<p>La versión del aviso aparece al inicio. El texto completo permanece accesible tocando el logo de la app y entrando en «Acerca de → Privacidad». Los cambios se informarán dentro de la aplicación y en la página pública del aviso. La bienvenida es informativa; el botón Continuar no es una autorización general para tratamientos nuevos. Un futuro servicio en línea, publicidad o tratamiento adicional deberá informarse antes de activarse y contar con la base jurídica que corresponda.</p>
<p>El aviso público se ofrece en un repositorio público de GitHub. Si decides abrir su versión web, se utilizará tu navegador y será aplicable también la política del proveedor de ese sitio. Consultar la versión local no necesita conexión.</p>
<p>HiNote Studio es un proyecto independiente. Huawei y Huawei Notes son denominaciones de sus respectivos titulares. Este aviso se refiere a HiNote Studio; consulta las condiciones de las otras aplicaciones y proveedores que decidas utilizar.</p>
<p><a href="licenses.html">Consultar componentes y licencias</a></p>'''
    return page('Política de privacidad',body)

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
    notice={'schema':1,'policy_version':config['policy_version'],
        'contact_email':config.get('privacy_email','') if config.get('email_verified') else '',
        'policy_url':config.get('policy_url',''),'policy_url_verified':config.get('policy_url_verified') is True,
        'welcome_summary':'HiNote Studio convierte texto en trazos con tu escritura. Tus notas, calibraciones y archivos se guardan y procesan en este dispositivo. Esta versión no requiere una cuenta de HiNote ni envía ese contenido al desarrollador. Tú eliges qué importar, guardar o exportar a Huawei Notes.',
        'privacy_html':body}
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
            url=self.links.pop().replace('licenses.html','../distribution/THIRD_PARTY.md');self.parts.append(']('+url+')')
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
    (ASSETS/'licenses.html').write_text(licenses())
    notice,components=native_documents(config)
    (ASSETS/'notice.json').write_text(json.dumps(notice,ensure_ascii=False,indent=2)+'\n')
    (ASSETS/'licenses.json').write_text(json.dumps(components,ensure_ascii=False,indent=2)+'\n')
    public=ROOT/'docs/privacy';public.mkdir(parents=True,exist_ok=True)
    (public/'index.html').write_text(text)
    (public/'licenses.html').write_text(licenses().replace('href="privacy.html"','href="index.html"'))
    markdown=PolicyMarkdown();markdown.feed(notice['privacy_html'])
    (ROOT/'docs/PRIVACY.md').write_text(markdown.result())
    report={'ready_for_store':not missing,'policy_version':config['policy_version'],'missing_fields':missing}
    (ROOT/'distribution/publication-status.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))
    if args.require_ready and missing:raise SystemExit('Store submission blocked: publisher/contact/policy URL information is incomplete.')

if __name__=='__main__':main()
