'use client';

import { useState } from 'react';
import { WandSparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QualityIndicatorReference, RecognizedQualityReport, recognizeQualityReportText } from '@/lib/quality-report-recognition';

export function QualityReportTextRecognition({
  indicators, onApply, linkedSample = false,
}: {
  indicators: QualityIndicatorReference[];
  onApply: (result: RecognizedQualityReport) => void;
  linkedSample?: boolean;
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<RecognizedQualityReport | null>(null);
  const fields = preview ? [
    ['报告编号', preview.reportNo], ['检测机构', preview.institutionName],
    ['混样编号', preview.samplingGroupNo], ['样品编号', preview.sampleNo],
    ['取样时间', preview.sampledAt], ['检测时间', preview.testedAt],
    ['取样人', preview.samplerName], ['取样方法', preview.samplingMethod],
  ].filter((item): item is [string, string] => Boolean(item[1])) : [];
  const recognizedCount = fields.length + (preview?.measured.length || 0);
  return <Card className="space-y-3 p-5">
    <div className="flex items-center gap-2"><WandSparkles className="h-4 w-4 text-primary" /><h2 className="font-semibold">文字信息自动识别</h2></div>
    <p className="text-xs text-muted-foreground">粘贴检测报告中的文字，先预览识别结果，再填入表单。仅匹配当前表单中的检测指标；原始报告附件仍需单独上传。</p>
    <textarea className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" value={text} maxLength={20000} onChange={event => { setText(event.target.value); setPreview(null); }} placeholder={'报告编号：JY-001\n检测机构：某检测机构\n检测时间：2026-10-30 11:30\nCaF₂≥97%，实测值97.36%\n水分≤12%，实测8.7%'} />
    <div className="flex justify-end"><Button variant="outline" disabled={!text.trim()} onClick={() => setPreview(recognizeQualityReportText(text, indicators))}>识别文字</Button></div>
    {preview && <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
      <div className="font-medium">识别预览 · {recognizedCount} 项</div>
      {recognizedCount ? <><div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">{fields.map(([label, value]) => <span key={label}>{label}：{value}</span>)}{preview.measured.map(item => <span key={item.code}>{item.name} 实测：{item.value}</span>)}</div>
        <p className="text-xs text-muted-foreground">{linkedSample ? '已关联的样品编号、取样时间及取样人不自动改动；请核对预览与样品信息是否一致。' : '应用后仅覆盖识别到的同名字段，其余已填内容不变。'}检测机构类型、机构主数据和质量标准仍需人工核对。</p>
        <div className="flex justify-end"><Button onClick={() => { onApply(preview); setPreview(null); }}>应用识别结果</Button></div></>
        : <p className="text-xs text-muted-foreground">未识别到明确字段，请尝试“字段名称：内容”格式，并把指标名称与实测值写在同一行。</p>}
    </div>}
  </Card>;
}
