'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

type Coordinate = [number, number];
type PolygonCoordinates = Coordinate[][];
type Geometry =
  | { type: 'Polygon'; coordinates: PolygonCoordinates }
  | { type: 'MultiPolygon'; coordinates: PolygonCoordinates[] };

type ProvinceFeature = {
  type: 'Feature';
  properties: { name?: string };
  geometry: Geometry;
};

type FeatureCollection = {
  type: 'FeatureCollection';
  features: ProvinceFeature[];
};

export type ProvinceDistributionItem = {
  province: string;
  count: number;
};

type ChinaProvinceMapProps = {
  data: ProvinceDistributionItem[];
  compact?: boolean;
  className?: string;
};

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 690;
const MAP_PADDING = 22;

function normalizeProvince(name = '') {
  return name
    .replace(/壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市$/u, '')
    .trim();
}

function coordinatesOf(geometry: Geometry): Coordinate[] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap((polygon) => polygon.flatMap((ring) => ring));
}

function colorFor(count: number, maxCount: number) {
  if (!count) return 'hsl(var(--muted))';
  const ratio = maxCount <= 1 ? 1 : count / maxCount;
  if (ratio >= 0.75) return '#155eaa';
  if (ratio >= 0.5) return '#2580c2';
  if (ratio >= 0.25) return '#49a7d5';
  return '#8bd2e8';
}

export function ChinaProvinceMap({ data, compact = false, className = '' }: ChinaProvinceMapProps) {
  const router = useRouter();
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [hovered, setHovered] = useState<{ name: string; count: number } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/maps/china-provinces.geojson')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<FeatureCollection>;
      })
      .then((result) => {
        if (active) setGeoData(result);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => { active = false; };
  }, []);

  const counts = useMemo(() => new Map(data.map((item) => [normalizeProvince(item.province), item.count])), [data]);
  const maxCount = useMemo(() => Math.max(1, ...data.map((item) => item.count)), [data]);

  const projection = useMemo(() => {
    if (!geoData?.features.length) return null;
    const all = geoData.features.flatMap((feature) => coordinatesOf(feature.geometry));
    const longitudes = all.map(([longitude]) => longitude);
    const latitudes = all.map(([, latitude]) => latitude);
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);
    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const usableWidth = VIEWBOX_WIDTH - MAP_PADDING * 2;
    const usableHeight = VIEWBOX_HEIGHT - MAP_PADDING * 2;
    const longitudeScale = usableWidth / (maxLongitude - minLongitude);
    const latitudeScale = usableHeight / (maxLatitude - minLatitude);
    const scale = Math.min(longitudeScale, latitudeScale);
    const contentWidth = (maxLongitude - minLongitude) * scale;
    const contentHeight = (maxLatitude - minLatitude) * scale;
    const offsetX = (VIEWBOX_WIDTH - contentWidth) / 2;
    const offsetY = (VIEWBOX_HEIGHT - contentHeight) / 2;
    return ([longitude, latitude]: Coordinate) => [
      offsetX + (longitude - minLongitude) * scale,
      offsetY + (maxLatitude - latitude) * scale,
    ] as Coordinate;
  }, [geoData]);

  const featurePaths = useMemo(() => {
    if (!geoData || !projection) return [];
    return geoData.features.map((feature) => {
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      const path = polygons.map((polygon) => polygon.map((ring) => ring.map((coordinate, index) => {
        const [x, y] = projection(coordinate);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ') + ' Z').join(' ')).join(' ');
      const name = normalizeProvince(feature.properties.name);
      return { name, path, count: counts.get(name) || 0 };
    });
  }, [counts, geoData, projection]);

  const openProvince = (province: string, count: number) => {
    if (!count) return;
    router.push(`/dashboard/industry-database/fluorite-producers?province=${encodeURIComponent(province)}`);
  };

  if (loadFailed) {
    return <div className={`flex min-h-64 items-center justify-center rounded-lg bg-muted/30 text-sm text-muted-foreground ${className}`}>地图资源加载失败，请刷新后重试</div>;
  }
  if (!geoData || !projection) {
    return <div className={`flex min-h-64 items-center justify-center rounded-lg bg-muted/30 text-sm text-muted-foreground ${className}`}><Loader2 className="mr-2 h-4 w-4 animate-spin" />地图加载中</div>;
  }

  return (
    <div className={`relative overflow-hidden rounded-lg border bg-gradient-to-br from-slate-50 to-sky-50/70 dark:from-slate-950 dark:to-slate-900 ${className}`}>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className={compact ? 'h-auto w-full max-h-[430px]' : 'h-auto w-full max-h-[680px]'}
        role="img"
        aria-label="萤石生产企业区域分布地图"
      >
        {featurePaths.map((feature) => {
          const interactive = feature.count > 0;
          return (
            <path
              key={feature.name}
              d={feature.path}
              fill={colorFor(feature.count, maxCount)}
              fillRule="evenodd"
              stroke="hsl(var(--background))"
              strokeWidth={compact ? 1.5 : 1.8}
              className={interactive ? 'cursor-pointer transition-[filter,opacity] duration-150 hover:brightness-95 focus:outline-none focus:[filter:drop-shadow(0_0_5px_rgba(14,116,144,0.7))]' : 'opacity-75'}
              tabIndex={interactive ? 0 : undefined}
              role={interactive ? 'button' : undefined}
              aria-label={`${feature.name}：${feature.count} 家萤石生产企业`}
              onMouseEnter={() => setHovered({ name: feature.name, count: feature.count })}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered({ name: feature.name, count: feature.count })}
              onBlur={() => setHovered(null)}
              onClick={() => openProvince(feature.name, feature.count)}
              onKeyDown={(event) => {
                if (interactive && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  openProvince(feature.name, feature.count);
                }
              }}
            >
              <title>{feature.name}：{feature.count} 家</title>
            </path>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <p className="font-medium">萤石生产企业数量</p>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>少</span>
          {['#8bd2e8', '#49a7d5', '#2580c2', '#155eaa'].map((color) => <span key={color} className="h-2.5 w-7 rounded-sm" style={{ backgroundColor: color }} />)}
          <span>多</span>
        </div>
      </div>

      {hovered && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border bg-background/95 px-4 py-2 text-sm shadow-md backdrop-blur">
          <span className="font-medium">{hovered.name}</span>
          <span className="ml-3 text-primary">{hovered.count} 家</span>
          {!!hovered.count && <span className="ml-2 text-xs text-muted-foreground">点击查看企业</span>}
        </div>
      )}
    </div>
  );
}
