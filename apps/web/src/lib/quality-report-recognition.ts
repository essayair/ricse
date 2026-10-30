export interface QualityIndicatorReference { code: string; name: string }
export interface RecognizedQualityReport {
  reportNo?: string; institutionName?: string; samplingGroupNo?: string; sampleNo?: string;
  sampledAt?: string; testedAt?: string; samplerName?: string; samplingMethod?: string;
  measured: Array<{ code: string; name: string; value: string }>;
}

function field(lines: string[], labels: string[]): string | undefined {
  for (const line of lines) {
    for (const label of labels) {
      if (!line.startsWith(label)) continue;
      const value = line.slice(label.length).replace(/^[\s：:=]+/, '').split(/[；;\t]/)[0].trim();
      if (value) return value;
    }
  }
  return undefined;
}

function dateTime(value?: string): string | undefined {
  if (!value) return undefined;
  const match = /(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\s*(\d{1,2})[:：时](\d{2})(?:[:：分](\d{2}))?/.exec(value);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const padded = (part: string) => part.padStart(2, '0');
  return year + '-' + padded(month) + '-' + padded(day) + 'T' + padded(hour) + ':' + minute + (second ? ':' + second : '');
}

function aliases(indicator: QualityIndicatorReference): string[] {
  const raw = [indicator.name, indicator.code];
  const label = raw.join(' ');
  if (/CaF[₂2]|氟化钙|品位/i.test(label)) raw.push('CaF2', 'CaF₂', '氟化钙', '氟化钙含量', '品位');
  if (/水分|MOISTURE|H2O|H₂O/i.test(label)) raw.push('水分', '含水率', 'H2O', 'H₂O');
  if (/SiO[₂2]|二氧化硅/i.test(label)) raw.push('SiO2', 'SiO₂', '二氧化硅');
  if (/CaCO[₃3]|碳酸钙/i.test(label)) raw.push('CaCO3', 'CaCO₃', '碳酸钙');
  if (/总硫|TOTAL_SULFUR/i.test(label)) raw.push('总硫');
  return [...new Set(raw.filter(Boolean))].sort((a, b) => b.length - a.length);
}

function measuredValue(lines: string[], indicator: QualityIndicatorReference): string | undefined {
  for (const line of lines) {
    const alias = aliases(indicator).find(name => {
      const at = line.toLowerCase().indexOf(name.toLowerCase());
      return at >= 0 && (at === 0 || /[\s：:，,；;（(]/.test(line[at - 1]));
    });
    if (!alias) continue;
    const after = line.slice(line.toLowerCase().indexOf(alias.toLowerCase()) + alias.length);
    const measured = /(?:实测(?:值|结果|含量)?|检测(?:值|结果)?|结果)\s*[：:=]?\s*(-?\d+(?:\.\d+)?)/.exec(after);
    if (measured) return measured[1];
    const numbers = [...after.matchAll(/-?\d+(?:\.\d+)?/g)];
    if (!numbers.length || (numbers.length === 1 && /[≥≤<>]/.test(after))) continue;
    return numbers[numbers.length - 1][0];
  }
  return undefined;
}

/** 只解析复制来的文字；无法确定的字段留给人工核对。 */
export function recognizeQualityReportText(text: string, indicators: QualityIndicatorReference[]): RecognizedQualityReport {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return {
    reportNo: field(lines, ['报告编号', '报告号', '化验单号', '检测报告号']),
    institutionName: field(lines, ['检测机构', '化验机构', '出具机构', '检验单位']),
    samplingGroupNo: field(lines, ['混样编号', '混合样编号']),
    sampleNo: field(lines, ['样品编号', '样品号']),
    sampledAt: dateTime(field(lines, ['取样时间', '采样时间'])),
    testedAt: dateTime(field(lines, ['检测时间', '化验时间', '检验时间', '报告时间'])),
    samplerName: field(lines, ['取样人', '采样人']),
    samplingMethod: field(lines, ['取样方法', '采样方法']),
    measured: indicators.flatMap(item => {
      const value = measuredValue(lines, item);
      return value === undefined ? [] : [{ code: item.code, name: item.name, value }];
    }),
  };
}
