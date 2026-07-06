# GeoSolarTool

GeoSolarTool es una plataforma web estática para análisis geoespacial y prefactibilidad fotovoltaica, diseñada para estimar áreas útiles, consumo energético preliminar, dimensionamiento FV y exportación de reportes técnicos desde una sola interfaz.

El proyecto está pensado para ser **replicable, extensible y open source**, de modo que cualquier equipo pueda reutilizar la base tecnológica, adaptar el diseño visual y evolucionar el motor de cálculo según sus necesidades.

## Objetivo del proyecto

GeoSolarTool busca acelerar la etapa de prospección solar mediante una experiencia visual centrada en mapa, áreas, ingeniería y exportación documental.

La plataforma permite:

- Delimitar superficies manualmente o por rectángulo.
- Analizar áreas aprovechables y obstrucciones.
- Estimar consumo por tipo de inmueble.
- Calcular capacidad fotovoltaica preliminar.
- Visualizar escenarios técnicos comparativos.
- Exportar reportes en PDF.
- Integrar módulos avanzados de ingeniería y teledetección.

## Principios de diseño

El proyecto se construyó con una lógica clara de producto:

- Interfaz de tres columnas con mapa central.
- Navegación por módulos con flujo simple.
- UI formal, sobria y moderna.
- Prioridad a la legibilidad técnica.
- Estado visual coherente entre análisis, mapa y exportación.
- Compatibilidad con despliegue como HTML estático.

## Por qué es replicable

GeoSolarTool fue planteado para que su arquitectura pueda reutilizarse en otros proyectos similares sin rehacer la base desde cero.

### Elementos replicables

- **Layout base**: header, panel lateral, mapa central y panel de resultados.
- **Motor geoespacial**: dibujo, medición, edición y overlays.
- **Motor FV**: reglas de cálculo parametrizables para paneles, inversores y baterías.
- **Sistema visual**: diseño corporativo limpio, adaptable a otros sectores técnicos.
- **Exportación**: generación de PDF con métricas, mapas y resúmenes.
- **Escalabilidad funcional**: incorporación de módulos por pestañas o secciones.

### Qué facilita su reutilización

- Código organizado por responsabilidades funcionales.
- Dependencias frontend simples.
- Posibilidad de correr como app estática.
- Uso de capas visuales independientes.
- Cálculos parametrizados en lugar de fórmulas rígidas.
- Estructura apta para forks, plantillas y variantes por industria.

## Casos de uso

GeoSolarTool puede servir como base para:

- Consultoría solar residencial.
- Prospección comercial para comercios y edificios.
- Prefactibilidad técnica para desarrolladores FV.
- Herramientas internas de ventas y ingeniería.
- Soluciones geoespaciales B2B para energías renovables.
- Productos derivados para techos industriales, agroindustria o infraestructura pública.

## Tecnologías sugeridas

La versión generada está orientada a frontend estático moderno. El stack recomendado para una evolución mantenible es:

- HTML5 semántico.
- CSS moderno.
- JavaScript o TypeScript.
- React para interfaz declarativa.
- Leaflet para mapa interactivo.
- Leaflet-Geoman para dibujo y edición.
- Librerías de exportación PDF del lado del cliente.

## Arquitectura recomendada

Para una versión open source mantenible, conviene separar el sistema en estos dominios:

```text
src/
  app/
  components/
  features/
    map/
    property/
    engineering/
    layout/
    export/
  services/
  utils/
  styles/
  assets/
```

### Responsabilidad por módulo

| Módulo | Responsabilidad |
|---|---|
| App shell | Montaje general de la interfaz y navegación. |
| Map workspace | Capa geoespacial, dibujo, selección y overlays. |
| Property module | Tipo de inmueble, consumo y parámetros base. |
| Engineering module | Cálculos FV, escenarios y validaciones. |
| Layout module | Inserción y organización de paneles y estructuras. |
| Export module | PDF, impresión y resumen técnico. |

## Funcionalidades principales

### 1. Análisis geoespacial

- Delimitación de áreas aprovechables.
- Exclusión de obstrucciones.
- Medición de área y perímetro.
- Soporte para capas satelitales y overlays.
- Microáreas detectadas como capa técnica adicional.

### 2. Ingeniería fotovoltaica

- Potencia del módulo.
- Dimensiones físicas del panel.
- HSP y PR configurables.
- Densidad de instalación y espaciado.
- Potencial en kWp.
- Estimación de generación anual.
- Recomendación preliminar de inversor y batería.

### 3. Layout de paneles

- Inserción de paneles sobre el mapa.
- Arrastre y rotación.
- Distribución por filas o matrices.
- Reglas de separación y cobertura.
- Exportación del layout al reporte final.

### 4. Exportación

- PDF técnico-comercial.
- Resumen ejecutivo.
- Captura del mapa y del layout.
- Gráficos de ingeniería.
- Tabla de equipos sugeridos.

## Motor de cálculo

GeoSolarTool está diseñado para trabajar con fórmulas simples, transparentes y configurables.

Eso permite que un fork o adaptación open source pueda cambiar parámetros como:

- Potencia por panel.
- Dimensiones reales del módulo.
- PR del sistema.
- HSP promedio.
- Espaciado entre paneles.
- Relación DC/AC.
- Factores de ocupación y pérdida.

## Replicabilidad para open source

Este proyecto puede convertirse en una base open source sólida si se siguen estas recomendaciones:

### 1. Separar UI y lógica

La interfaz debe permanecer desacoplada de las fórmulas. El motor de cálculo debe vivir en archivos independientes para facilitar auditoría y personalización.

### 2. Parametrizar el negocio

Los perfiles de inmueble, factores energéticos y reglas de dimensionamiento deben almacenarse en estructuras editables, no en valores dispersos dentro del UI.

### 3. Mantener componentes reutilizables

Botones, tarjetas, paneles laterales, tooltips y capas del mapa deben ser reutilizables entre módulos.

### 4. Documentar el flujo

Un README claro, ejemplos de configuración y comentarios técnicos mínimos ayudan a que otros equipos adopten la base sin curva de aprendizaje excesiva.

### 5. Diseñar para fork

El repositorio debe poder bifurcarse para casos de uso distintos, por ejemplo:

- Solar residencial.
- Solar comercial.
- Industrial.
- Agrícola.
- Auditoría energética.

## Guía de instalación

### Requisitos

- Navegador moderno.
- Servidor estático o entorno de desarrollo local.
- Conexión a Internet si se usan CDNs externos.

### Ejecución local

Si el proyecto se sirve como HTML estático, basta con abrirlo desde un servidor web local o desplegarlo en un host estático como Vercel, Netlify o GitHub Pages.

### Despliegue recomendado

- Vercel.
- Netlify.
- GitHub Pages.
- Cloudflare Pages.

## Cómo contribuir

Las contribuciones son bienvenidas para ampliar el proyecto como base open source.

### Áreas de aporte

- Mejoras de rendimiento.
- Nuevos perfiles de inmueble.
- Nuevos cálculos FV.
- Herramientas de layout.
- Exportación más robusta.
- Accesibilidad y responsive.
- Internacionalización.
- Pruebas automatizadas.

### Buenas prácticas

- Mantener el diseño vigente.
- Evitar romper la navegación actual.
- Separar cambios visuales de cambios de lógica.
- Documentar parámetros nuevos.
- Validar en desktop y móvil.

## Licencia sugerida

Para una estrategia open source clara, una opción habitual es:

- MIT para máxima adopción.
- Apache 2.0 si se desea mayor claridad sobre patentes y contribuciones empresariales.

La decisión final depende de la estrategia de producto y de la intención de abrir el proyecto a comunidad o a adopción comercial.

## Roadmap sugerido

- Consolidar versión base estable en HTML estático.
- Separar módulos en estructura de proyecto mantenible.
- Migrar a TypeScript.
- Encapsular motor de cálculo.
- Incorporar exportación PDF más robusta.
- Agregar pruebas unitarias.
- Publicar como plantilla open source.
- Crear documentación de contribución y arquitectura.

## Limitaciones conocidas

- La precisión es preliminar, no sustituye levantamiento en sitio.
- La cobertura satelital puede variar por ubicación.
- Algunos módulos dependen de recursos externos si se usan CDNs.
- La teledetección aproximada requiere validación manual.
- Los resultados técnicos deben interpretarse como prefactibilidad.

## Valor para la comunidad

Abrir GeoSolarTool como open source puede aportar una base útil para desarrolladores, integradores solares, consultores, analistas de datos y equipos de ingeniería que buscan una plataforma geoespacial modular para prefactibilidad fotovoltaica.

Su valor no está solo en el mapa o en los cálculos, sino en la posibilidad de replicar un flujo completo de análisis solar técnico con una interfaz clara, escalable y fácilmente adaptada.
