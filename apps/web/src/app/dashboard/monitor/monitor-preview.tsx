'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface PreviewCamera { id: string; name: string; deviceSerial: string; channelNo: number }
interface PreviewCredential { accessToken: string; url: string }

/**
 * 配置页单路预览：用于确认设备序列号与通道号是否配对正确。
 * 播放器脚本按需动态加载，避免拖慢不看监控的页面。
 */
export function MonitorPreview({ camera, onClose }: { camera: PreviewCamera; onClose: () => void }) {
  const containerId = `monitor-preview-${camera.id}`;
  const playerRef = useRef<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const credential = await api.post<PreviewCredential>(`/monitor/cameras/${camera.id}/preview`, {});
        if (cancelled) return;
        const { EZUIKitPlayer } = await import('ezuikit-js');
        if (cancelled) return;
        playerRef.current = new EZUIKitPlayer({
          id: containerId,
          accessToken: credential.accessToken,
          url: credential.url,
          width: 640,
          height: 360,
          template: 'simple',
          scaleMode: 1,
          audio: false,
        });
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) { setError(err.message || '预览失败'); setLoading(false); }
      }
    };
    void start();

    return () => {
      cancelled = true;
      if (playerRef.current?.destroy) playerRef.current.destroy();
      playerRef.current = null;
    };
  }, [camera.id, containerId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg bg-card p-4" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-medium">{camera.name}</div>
            <div className="font-mono text-xs text-muted-foreground">
              {camera.deviceSerial} · 通道 {camera.channelNo}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        {error
          ? <div className="rounded-md border border-destructive-border bg-destructive-bg p-6 text-sm text-destructive">{error}</div>
          : (
            <div className="relative overflow-hidden rounded-md bg-black" style={{ aspectRatio: '16 / 9' }}>
              <div id={containerId} className="h-full w-full" />
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">正在连接摄像头…</div>
              )}
            </div>
          )}
        <p className="mt-3 text-xs text-muted-foreground">
          预览用于校验点位配置。画面异常时请核对设备序列号、通道号和设备验证码。
        </p>
      </div>
    </div>
  );
}
