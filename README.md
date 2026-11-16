# Observatorio de títulos públicos del Ecuador

Dashboard de **colocación primaria bursátil, colocación directa y negociación secundaria** de bonos del Estado, CETES y Notas del Tesoro, a partir de cinco archivos oficiales de la Bolsa de Valores de Quito.

**Dashboard:** https://jp1309.github.io/ecuador-deuda-dashboard/

**Propuesta analítica 02:** https://jp1309.github.io/ecuador-deuda-dashboard/analisis/

La nueva propuesta prioriza series históricas, comparación interanual al mismo corte, curvas observadas por plazo, cambios de tasas en puntos básicos, mapas de calor y composición de vencimientos. [Criterios de diseño y metodología analítica](PROPUESTA-ANALITICA.md).

Los canales se muestran por separado. No se publica un total consolidado de financiamiento ni un saldo de deuda: las fuentes tienen distinta cobertura y posibles coincidencias. [Metodología y hallazgos](METODOLOGIA.md).

## Uso

- Seleccionar un canal, instrumento, fechas y procedencia.
- Consultar nominal, efectivo, rendimiento ponderado, evolución mensual y detalle.
- Descargar el CSV de las filas filtradas (búsqueda y alertas filtran la tabla y el CSV; los indicadores conservan los filtros generales).
- Revisar la fecha de consulta, el corte individual de cada fuente y las alertas por registro.
- Consultar participación por institución en una vista independiente, mensual o acumulada.

## Ejecutar localmente

Requiere Python 3.12. El dashboard es HTML/CSS/JavaScript estático, sin compilación ni claves privadas.

```sh
python -m venv .venv
# Activar .venv según el sistema operativo
pip install -r requirements.txt
python -m unittest discover -s tests -v
python scripts/update_data.py
python -m http.server 8765 --directory docs
```

Abrir http://localhost:8765. Para reproducir sin red:

```sh
python scripts/update_data.py --offline data/raw
```

## Actualización diaria

GitHub Actions consulta las páginas oficiales y descubre los enlaces a los cinco Excel a las **18:23, hora de Ecuador continental (23:23 UTC)**. También permite ejecución manual en Actions → Actualizar datos y publicar dashboard → Run workflow.

Cada ejecución descarga, valida formatos y esquemas, normaliza unidades, prueba cálculos, registra los originales y publica GitHub Pages. Si una fuente falla, el job falla y conserva la última versión publicada. Consultar diariamente no garantiza que BVQ actualice diariamente los archivos. El dashboard muestra la antigüedad de la consulta y el corte de cada fuente.

Los originales actuales se guardan en `data/raw`; los cambios quedan en el historial de Git. La base normalizada está en `docs/data/dashboard.json`, con nombres de columnas y filas compactas, y el informe de calidad en `data/quality.json`. No se añaden nuevamente todos los registros en cada descarga: se reconstruye la fotografía vigente. Las hojas anuales retiradas por la fuente se conservan desde la fotografía anterior; una caída de más del 5% de filas o retroceso de fechas detiene la publicación para revisión.

Configurar Settings → Pages → Source → **GitHub Actions**. El workflow necesita `contents: write`, `pages: write` e `id-token: write`, y permiso para ejecutar Actions. Las ejecuciones programadas corren en la rama predeterminada; GitHub puede retrasarlas y deshabilitarlas tras 60 días sin actividad en repositorios públicos. [Documentación oficial](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Fuentes

- [Cotizaciones históricas BVQ](https://www.bolsadequito.com/index.php/estadisticas/boletines-2/cotizaciones-historicas): bonos y CETES/Notas.
- [Sector público BVQ](https://www.bolsadequito.com/index.php/estadisticas/boletines-2/sector-publico): colocaciones directas y montos negociados por institución.

Proyecto independiente, sin afiliación con BVQ. Los datos originales pertenecen a sus respectivos titulares; su disponibilidad pública no constituye una licencia de reutilización ilimitada. Se preservan fuente, URL y huella SHA-256 por archivo.
