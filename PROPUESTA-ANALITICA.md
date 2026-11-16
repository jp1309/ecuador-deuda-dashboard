# Propuesta analítica 02

[Abrir propuesta interactiva](https://jp1309.github.io/ecuador-deuda-dashboard/analisis/).

## Evaluación de la primera versión

La primera versión permitía comprobar los archivos y separar canales, pero dedicaba demasiado espacio a registros individuales. La serie mensual quedaba subordinada a tarjetas de montos acumulados. Faltaban referencias temporales, estructura por plazo y evidencia de cómo cambian las tasas. Un promedio de rendimientos mezclaba plazos distintos y no explicaba si la variación era de tasas o de composición.

La segunda versión organiza la información alrededor de preguntas económicas. Usa la misma base validada y la misma actualización diaria, con una URL independiente para revisar la propuesta.

## Arquitectura visual

| Pregunta | Visualización | Decisión metodológica |
|---|---|---|
| ¿Cuánto se coloca o negocia y cómo cambia? | Serie mensual completa con selector de zoom, nominal/efectivo y acumulados anuales superpuestos | Mes final parcial identificado; los acumulados se comparan hasta el mismo mes y día |
| ¿Qué tasa se observa para cada plazo? | Dispersión de operaciones y curva descriptiva por tramos | Plazo residual, una medida de tasa, un instrumento y un canal a la vez |
| ¿Dónde subieron o bajaron las tasas? | Cambio de tasa por tramo en puntos básicos | Ventanas consecutivas de 30, 90 o 180 días; ≥ 3 registros en cada ventana |
| ¿Es un cambio persistente? | Historia mensual de tasas por plazo y mapa de calor mes × plazo | No unir meses ausentes; ≥ 3 registros por celda, sin imputar tasas |
| ¿Se está alargando o acortando la estructura? | Distribución mensual del nominal por tramo residual y plazo ponderado | Perfil de las operaciones, no calendario de amortización ni saldo vivo |
| ¿Qué emisiones concentran la actividad? | Ranking del nominal por texto de decreto | No se fusionan automáticamente variantes de un decreto ni se infieren tenedores |
| ¿Qué entidades destacan en los reportes públicos? | Barras por entidad con Quito/Guayaquil y participación de las tres mayores | Universo separado, corte propio, no sumar con colocaciones |

La navegación lateral ordena el análisis; los filtros comunes sincronizan el instrumento, canal, fecha y medida de tasa. El detalle de transacciones sale del espacio principal. La descarga entrega agregados mensuales de la selección; la vista anterior conserva el acceso a registros para auditoría.

## Buenas prácticas contrastadas con fuentes primarias

La [metodología de curvas del BCE europeo](https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/euro_area_yield_curves/shared/pdf/technical_notes.pdf) distingue la relación rendimiento/plazo residual observada de las curvas cero cupón, par y forward estimadas. Su cálculo emplea selección de títulos y convenciones de flujos. Por ello esta propuesta no estima una curva cero cupón ni aplica un ajuste Nelson–Siegel–Svensson con datos insuficientes. Usa una curva **descriptiva de operaciones**, con muestras y concentraciones visibles.

La [guía FMI/Banco Mundial sobre desarrollo de mercados de bonos](https://www.elibrary.imf.org/view/journals/064/2021/001/article-A001-en.xml) trata la estructura por vencimientos y la actividad secundaria como dimensiones importantes del mercado. Aquí se muestra volumen y número de días con registros, pero no se construye un ratio de rotación porque falta un saldo en circulación compatible. Tampoco se infiere liquidez únicamente del conteo de filas.

El diseño separa cantidades de tasas en gráficos distintos, mantiene colores consistentes, utiliza el mismo corte en comparaciones anuales y conserva vacíos cuando falta evidencia. Las leyendas permiten aislar tramos y los tooltips exponen cifras, muestra y procedencia. Los tooltips y las escalas se recalculan para cada selección; los colores del mapa no deben compararse entre instrumentos sin leer sus escalas.

## Cálculos y reglas

### Universo y fecha de corte

El corte inicial se toma de la fuente: bonos históricos, CETES/Notas históricos o colocaciones directas. **No se desplaza al último registro del instrumento seleccionado.** Por ejemplo, al 13 de noviembre de 2026, los CETES primarios no tienen operaciones recientes; su última operación es del 5 de febrero. Eso se muestra como ausencia de observaciones recientes y se ofrece un botón explícito para explorar esa fecha.

Se conserva CETES separado de Notas del Tesoro. La historia de cada selección comienza en su primer registro, que no prueba cobertura previa. Los canales no se suman por posibles coincidencias. El filtro de bonos «Contienen JUB» sólo evalúa el texto del decreto; no adjudica características legales o contractuales a esos títulos.

### Períodos comparables

Una ventana de N días incluye `corte − N + 1` a `corte`. La anterior incluye los N días inmediatamente anteriores, sin solapamiento. Son días calendario, no ruedas bursátiles. La fecha fuente puede ser anterior a la fecha de consulta.

Los indicadores anuales suman del 1 de enero al corte. La variación interanual compara con el mismo día del año anterior y, si el año base comienza con cobertura parcial, ajusta también el inicio del año actual al mismo mes y día. El tooltip de la tarjeta muestra las ventanas exactas. Si no hay base positiva no se calcula variación.

El acumulado de cada año se detiene en el mismo mes y día del corte elegido. Los años que empiezan tarde deben leerse con la advertencia de inicio parcial que aparece en el gráfico. No se extiende el último valor a meses futuros.

### Tasas, plazos y curvas

- Históricos: se permite elegir TIR/TEA publicada o rendimiento publicado. La colocación directa no contiene TEA, por lo que se usa rendimiento y se deshabilita TEA. No se rellenan campos de tasa con otra definición.
- Media ponderada: `Σ(tasa × nominal) / Σ(nominal)` sobre registros válidos. El plazo medio usa la misma ponderación.
- Exclusiones analíticas: tasa no finita, plazo no positivo, vencimiento anterior a negociación o emisión posterior a negociación. Esas filas permanecen en las sumas de volumen. Una fecha de emisión ausente no se inventa.
- No se elimina una tasa sólo por su magnitud. Las anomalías de precio permanecen como alertas de origen. No se asegura homogeneidad contractual de todos los bonos.
- Tramos de bonos: hasta 1 año, 1–3, 3–5, 5–7, 7–10 y más de 10 años. Los límites usan 365 días por año para agrupar/mostrar, sin recalcular las bases financieras publicadas.
- Tramos de CETES/Notas: hasta 90, 91–180, 181–270, 271–365 y más de 365 días. Un dato fuera del plazo usual queda visible en su tramo, sin cambiar de instrumento.
- En la curva, cada punto agregado se ubica en su **plazo medio observado**, no en un vencimiento teórico inventado. Se conecta sólo si el tramo y su vecino tienen ≥ 3 registros. Las operaciones individuales permanecen visibles y su tamaño se relaciona con nominal mediante raíz cuadrada, con tamaño mínimo de legibilidad.
- Los tramos de una o dos observaciones aparecen como puntos aislados. El cambio en puntos básicos y las series mensuales por tramo requieren ≥ 3 observaciones por grupo. El umbral controla la visualización, no establece significancia estadística.
- Cada tramo muestra nominal, registros, días con actividad y porcentaje del registro mayor. Una curva respaldada por muchas filas idénticas no se interpreta automáticamente como una muestra independiente.
- Las tarjetas de tasa y plazo reciente muestran medias disponibles incluso con muestra pequeña, acompañadas del conteo; las curvas aplican el umbral anterior.
- `cambio_pb = (tasa_actual_pct − tasa_anterior_pct) × 100`. No se califica la subida o bajada como beneficio o pérdida para un inversionista.

### Estructura e instituciones

La distribución por plazo usa nominal de los registros válidos para tasas/plazos. No equivale a flujo de amortización, duración financiera ni saldo de deuda. El ranking por decreto conserva el texto original para no fusionar emisiones sin prueba. Las operaciones directas pueden carecer de decreto o procedencia; el dashboard lo indica.

Los reportes institucionales muestran monto efectivo y región, con fecha propia y aviso de independencia de los filtros superiores. La concentración es sobre el total de ese reporte, no sobre colocaciones de CETES/bonos. No se infieren contrapartes.

## Información adicional necesaria para ampliar el análisis

- Flujos contractuales, cupones, amortizaciones, opciones y convenciones financieras por emisión para estimar una curva spot/par/forward y medidas de duración consistentes.
- Identificadores de operación y de emisión para conciliar fuentes y variantes de decreto.
- Tenedores o compradores identificados para redes de financiamiento y concentración por institución inversora.
- Saldos, redenciones y canjes para medir deuda viva, financiamiento neto, rotación y vencimientos fiscales.

La propuesta conserva la actualización diaria y los originales. Apache ECharts 5.6.0 se sirve desde el repositorio, con su licencia incluida. La lógica de agregación tiene pruebas independientes en Node, añadidas a GitHub Actions junto a las pruebas de importación en Python.
