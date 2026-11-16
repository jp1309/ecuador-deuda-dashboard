# Metodología, cobertura y viabilidad

## Qué se puede medir

La actualización es técnicamente viable: ambas páginas de BVQ publican enlaces HTTPS directos a Excel, accesibles sin autenticación. Se verificaron descargas reales y su lectura. No se necesita automatizar el navegador. Los enlaces se descubren cada vez por el nombre del archivo, para detectar cambios en la web en lugar de publicar datos silenciosamente desactualizados.

| Fuente | Contenido | Tratamiento |
|---|---|---|
| `bonos.xls` | Hojas 2025 y 2026, fecha de negociación, decreto, precio, rendimiento, interés, TIR/TEA, nominal original, nominal, efectivo, plazo por vencer, emisión, vencimiento, procedencia y mercado | Primario y secundario separados; nominal actual como base de agregación |
| `cetes.xls` | Hojas 2025 y 2026 con CETES y Notas del Tesoro, emisor, condiciones y mercado | Identificar la denominación original mediante el título y agrupar CETES / Notas del Tesoro para las series históricas |
| `negociaciones-sector-publico.xlsx` | Colocaciones directas de bonos, CETES/Notas; además reporto y certificado de inversión BanEcuador | Mostrar directas separadamente; excluir las otras dos clases de los indicadores |
| `montos-negociados-mensuales.xls` | Participación por entidad pública y región del mes publicado | Contexto institucional independiente |
| `montos-negociados-acumulados.xls` | Participación por entidad pública y región del período acumulado | Contexto independiente, no sumar con el mes |

Los históricos contienen códigos de procedencia Q y G, presentados como Quito y Guayaquil. El detalle no tiene comprador ni contraparte ni un identificador único de transacción. El archivo de bonos tampoco contiene una columna de emisor: no se inventa ese dato. Se preserva la denominación original de emisor en los otros archivos.

## Hallazgos de la carga inicial (15 de noviembre de 2026)

- Bonos: 16.585 registros, del 6 de enero de 2025 al 13 de noviembre de 2026.
- CETES/Notas bursátiles: 2.081 registros, con la misma cobertura temporal. En 2026 hay 72 registros bajo la denominación CETES y 1.064 bajo Notas; ambos integran la serie continua CETES / Notas del Tesoro.
- Colocaciones directas: 1.342 registros elegibles, del 12 de febrero de 2021 al 28 de octubre de 2026. Bonos directos comienzan el 11 de diciembre de 2023; el histórico 2021 corresponde a CETES.
- Reportes institucionales: octubre de 2026 y enero–octubre de 2026. Se conciliaron los totales nacionales con la suma de las entidades y Quito más Guayaquil.
- Total de filas elegibles en la base: 20.008. **Este conteo suma registros de fuentes, no operaciones únicas ni financiamiento consolidado.**
- 19 grupos coinciden entre fuentes en fecha, instrumento, nominal redondeado a centavos y vencimiento (45 filas involucradas). Son candidatos a conciliación, no prueba de duplicación.
- 2.549 filas pertenecen a grupos idénticos dentro de su fuente. Pueden representar operaciones distintas: no se eliminan sin un identificador confiable.
- Hay 10 fechas de emisión posteriores a la negociación, 12 vencimientos anteriores y 198 diferencias entre efectivo y nominal × precio con tolerancia de USD 1 o una millonésima del nominal. Son alertas de revisión; no se recalculan los importes originales.
- Una fecha de emisión tiene el texto `1+` (CETES directos, fila 217). Se deja nula y se conserva la anomalía en la alerta. También se normalizan fechas textuales españolas y un nominal textual de formato español.
- Se excluyen del dashboard de títulos tres registros: un reporto de USD 500 millones y dos certificados de inversión de BanEcuador por USD 15 millones y USD 10 millones. Permanecen en los originales y en el informe de calidad.

## Definiciones

**Colocación primaria bursátil:** suma nominal de filas cuyo tipo de mercado es PRIMARIO. No equivale a emisión autorizada ni a ingreso fiscal neto. El mercado secundario es circulación de títulos ya emitidos.

**Colocación directa:** categoría declarada en la fuente de sector público. El archivo identifica emisor y vendedor, pero no comprador: no permite atribuir una operación a IESS, BIESS, ISSFA u otra institución ni construir una matriz de transacciones entre instituciones.

**Nominal y efectivo:** se preservan por separado. En bonos directos existen precio limpio y sucio. El efectivo publicado puede corresponder al precio limpio; no se reemplaza por nominal × precio sucio ni se interpreta automáticamente como flujo de caja total con interés corrido.

**Rendimiento ponderado:** `sum(rendimiento_pct × nominal) / sum(nominal)` para registros con rendimiento disponible de la selección. Los históricos expresan tasas y precios en puntos porcentuales; las colocaciones directas en fracción (0,07 → 7%). TIR/TEA y cupón se preservan como campos distintos. No se homologan bases 360/365 ni se interpreta la media entre diferentes instrumentos como costo efectivo comparable.

**Plazo:** se conserva el plazo por vencer o plazo publicado. No se deduce una duración financiera ni se altera el tipo de instrumento por su plazo residual. Sin calendario de amortización, pagos, recompra y saldo inicial no puede construirse un saldo vivo ni un calendario confiable del servicio de deuda sumando negociaciones.

**Participación institucional:** incluye un universo más amplio que CETES y bonos, no permite identificar compradores de los registros transaccionales. El valor ajustado se presenta tal como lo reporta BVQ, sin tratarlo como financiamiento efectivo.

## Alcance económico y fiscal

El nombre del repositorio usa «deuda» como descripción económica del proyecto. La clasificación fiscal requiere distinguir títulos de deuda y obligaciones de tesorería. El [Informe de Gestión de Notas del Tesoro, octubre de 2026](https://www.economicoproductivo.gob.ec/wp-content/uploads/downloads/2026/10/7.-ANEXO-GESTION-NOTAS-DEL-TESORO.pdf) describe Notas de hasta 359 días para necesidades de caja y su tratamiento separado del endeudamiento público en el marco citado. También documenta la reducción de CETES y transición a Notas. No se asimilan automáticamente a deuda pública en sentido legal o al indicador deuda/PIB.

Para un total oficial de financiamiento y saldo se necesita conciliar con estadísticas del ente rector de finanzas públicas y sus boletines de deuda y tesorería. Para atribuir tenedores se necesita una fuente adicional con esa identificación. Esta primera versión ofrece seguimiento de la evidencia publicada por BVQ.

## Controles y actualización

1. Descarga de cinco fuentes con límites de tamaño, reintentos, TLS y validación de firma Excel; un HTML de error no se acepta como XLS.
2. Lectura por hoja, detección de encabezado y columna de mercado por nombre. Esto es necesario porque `bonos.xls` cambia el orden de las columnas de mercado/procedencia entre 2025 y 2026.
3. Validación de categorías, fechas, importes, unidades y conciliación de los agregados institucionales.
4. Identificador técnico de contenido con contador de ocurrencias: conserva filas idénticas y permite repetir la carga sin multiplicarlas. No es un identificador oficial de transacción.
5. Reemplazo de la fotografía completa; comparación con carga previa para detectar regresiones. Las revisiones históricas quedan en Git. Se conservan hojas de años retirados de los históricos con una marca de archivo en el informe de calidad.
6. Publicación sólo tras validación y pruebas. Una falla conserva la última publicación. Las alertas de origen se muestran y no impiden sumar las filas de su propio canal; ningún canal se suma automáticamente con otro.

La fecha de consulta y la última fecha de operación son conceptos diferentes. No se declara «sin colocaciones» sólo porque no apareció un archivo nuevo. No se inventa una frecuencia garantizada de publicación para BVQ.
