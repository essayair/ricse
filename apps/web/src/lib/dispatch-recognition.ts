const PLATE = /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9挂学警港澳]{5,6}/gi;

/** 一辆车的多行字段视为一条；每车一行的文本仍生成多条。 */
export function splitDispatchLines(text: string) {
  if ((text.match(PLATE) || []).length === 1) return [text.trim()];
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 100);
}

export function dispatchField(text: string, labels: string[]) {
  return new RegExp(`(?:${labels.join('|')})[：:\\s]*([^，,；;\\n]+)`, 'i').exec(text)?.[1]?.trim() || '';
}

export function dispatchDate(text: string, labels: string[]) {
  const match = new RegExp(`(?:${labels.join('|')})[：:\\s]*(20\\d{2})[-/.年](\\d{1,2})[-/.月](\\d{1,2})日?(?:[ T\\s]+)(\\d{1,2})[:：](\\d{2})`, 'i').exec(text);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}T${match[4].padStart(2, '0')}:${match[5]}` : '';
}
