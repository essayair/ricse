import assert from 'node:assert/strict';
import test from 'node:test';
import { recognizeQualityReportText } from './quality-report-recognition';

test('识别检测报告字段及实测值，不把标准值当实测值', () => {
  const content = [
    '报告编号：JY-2026-01', '检测机构：某质检机构', '样品编号：YP001',
    '取样时间：2026-10-30 09:15:20', '检测时间：2026-10-30 11:30',
    'CaF₂≥97%，实测值97.36%', '水分≤12%，实测8.7%', 'SiO₂≤1.8%',
  ].join('\n');
  const result = recognizeQualityReportText(content, [
    { code: 'CAF2', name: 'CaF₂ 品位' }, { code: 'MOISTURE', name: '水分' }, { code: 'SIO2', name: 'SiO₂' },
  ]);
  assert.equal(result.reportNo, 'JY-2026-01');
  assert.equal(result.institutionName, '某质检机构');
  assert.equal(result.sampledAt, '2026-10-30T09:15:20');
  assert.equal(result.testedAt, '2026-10-30T11:30');
  assert.deepEqual(result.measured.map(item => [item.code, item.value]), [['CAF2', '97.36'], ['MOISTURE', '8.7']]);
});

test('无对应行不猜测指标，普通数值行可以识别', () => {
  const result = recognizeQualityReportText('CaF2：96.8%\n总硫 0.04%\n水分≤12%', [
    { code: 'CAF2', name: 'CaF₂' }, { code: 'TOTAL_SULFUR', name: '总硫' }, { code: 'MOISTURE', name: '水分' },
  ]);
  assert.deepEqual(result.measured.map(item => [item.code, item.value]), [['CAF2', '96.8'], ['TOTAL_SULFUR', '0.04']]);
});
