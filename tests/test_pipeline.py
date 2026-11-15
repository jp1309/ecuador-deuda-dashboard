import importlib.util
from pathlib import Path
import unittest
from collections import Counter
from copy import deepcopy

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('pipeline',ROOT/'scripts/update_data.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)

class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=p.build(ROOT/'data/raw')
        cls.rows=[dict(zip(cls.data['columns'],r)) for r in cls.data['rows']]

    def test_locale_and_dates(self):
        self.assertEqual(p.number('\xa025.036.597,22'),25036597.22)
        self.assertEqual(p.iso('17-sep.-2026'),'2026-09-17')
        self.assertEqual(p.iso(46339),'2026-11-13')
        self.assertEqual(p.number(0),0)
        self.assertIsNone(p.number(None))
        with self.assertRaises(ValueError):p.number('25,000.00')

    def test_all_transaction_rows_preserved(self):
        # Independent counts from workbook date column; exclusions are explicit.
        for filename in ('bonos.xls','cetes.xls'):
            expected=sum(sum(r[1] not in ('',None) for r in rows[p.header(rows)[0]+1:]) for _,rows,_ in p.read_book(ROOT/'data/raw'/filename))
            self.assertEqual(expected,sum(r['source']==filename for r in self.rows))
        self.assertEqual(len({r['id'] for r in self.rows}),len(self.rows))
        self.assertTrue(any('Fila idéntica en fuente; conservada' in r['flags'] for r in self.rows))

    def test_market_columns_can_move(self):
        for filename in ('bonos.xls','cetes.xls'):
            for sheet,rows,_ in p.read_book(ROOT/'data/raw'/filename):
                h,cols=p.header(rows);idx=cols['TIPO DE MERCADO' if filename=='bonos.xls' else 'TIPO MERCADO']
                raw=[r for r in rows[h+1:] if r[1] not in ('',None)]
                selected=[r for r in self.rows if r['source']==filename and r['sheet']==sheet]
                expected=sum(r[cols['VALOR NOMINAL (USD)']] for r in raw if r[idx]=='PRIMARIO')
                actual=sum(r['nominal'] for r in selected if r['channel']=='Primario bursátil')
                self.assertAlmostEqual(expected,actual,places=2)

    def test_direct_percent_units_and_exclusions(self):
        rows=[r for r in self.rows if r['channel']=='Colocación directa']
        first=next(r for r in rows if r['sheet']=='Reporte bolsas hist bonos' and r['row']==12)
        self.assertAlmostEqual(first['yield_pct'],6.1653)
        self.assertAlmostEqual(first['price_pct'],99.98841234353876)
        self.assertTrue(all(r['instrument'] in ('BONOS','CETES','NOTAS') for r in rows))
        self.assertEqual({e['reason'] for e in self.data['quality']['excluded']},{'Reporto','Certificado de inversión BanEcuador'})

    def test_same_inputs_do_not_duplicate_daily_rows(self):
        second=p.build(ROOT/'data/raw',previous=self.data)
        self.assertEqual(self.data['rows'],second['rows'])
        self.assertEqual(self.data['quality'],second['quality'])

    def test_regression_is_rejected(self):
        prior=deepcopy(self.data);idx=prior['columns'].index('date');prior['rows'][-1][idx]='2099-01-01'
        with self.assertRaises(ValueError):p.build(ROOT/'data/raw',previous=prior)

    def test_missing_date_not_invented(self):
        row=next(r for r in self.rows if r['source'].endswith('xlsx') and r['sheet']=='Reporte bolsas hist cetes-notas' and r['row']==217)
        self.assertIsNone(row['issued'])
        self.assertTrue(any('inválida' in f for f in row['flags']))

    def test_institution_totals_reconcile(self):
        for report in self.data['institutions']:
            self.assertAlmostEqual(sum(e['effective'] for e in report['entries']),report['total'],places=2)

if __name__=='__main__': unittest.main()
