'use client';

import { LineChart, Line, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

/** 迷你折线图（无坐标轴，用于卡片内趋势展示） */
export function Sparkline({
  data,
  dataKey,
  color = '#6366f1',
  height = 32,
}: {
  data: Record<string, number | string | null>[];
  dataKey: string;
  color?: string;
  height?: number;
}) {
  if (!data || data.length === 0) {
    return <div style={{ height }} className="flex items-center text-xs text-gray-400">暂无数据</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <YAxis domain={['dataMin', 'dataMax']} hide />
        <Tooltip
          contentStyle={{
            fontSize: '11px',
            padding: '4px 8px',
            borderRadius: '6px',
            border: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
          formatter={(v) => (typeof v === 'number' ? (dataKey === 'balance' ? `$${v.toFixed(2)}` : `${v}`) : String(v))}
          labelFormatter={() => ''}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
