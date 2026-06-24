import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  data: { status: string; count: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b',
  PROCESSING: '#3b82f6',
  SHIPPED: '#8b5cf6',
  DELIVERED: '#10b981',
  CANCELLED: '#ef4444',
  REFUNDED: '#6b7280',
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded border bg-background px-3 py-2 shadow text-sm">
      <p className="font-medium">{name}</p>
      <p className="text-muted-foreground">{value} order{value !== 1 ? 's' : ''}</p>
    </div>
  );
}

export function OrderStatusChart({ data }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Orders by Status</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="status"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.status}
                  fill={STATUS_COLORS[entry.status] ?? '#94a3b8'}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => <span className="text-xs">{value}</span>}
              iconSize={10}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
