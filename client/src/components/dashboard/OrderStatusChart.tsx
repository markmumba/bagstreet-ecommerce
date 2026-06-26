import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ORDER_STATUS } from 'shared';

interface Props {
  data: { status: string; count: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  [ORDER_STATUS.PENDING]: 'var(--color-warning-text)',
  [ORDER_STATUS.CONFIRMED]: 'var(--color-info-text)',
  [ORDER_STATUS.PROCESSING]: 'var(--chart-2)',
  [ORDER_STATUS.SHIPPED]: 'var(--chart-4)',
  [ORDER_STATUS.DELIVERED]: 'var(--color-success-text)',
  [ORDER_STATUS.CANCELLED]: 'var(--color-danger-text)',
  [ORDER_STATUS.REFUNDED]: 'var(--color-neutral-text)',
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-sm shadow-[var(--shadow-dropdown)]">
      <p className="font-medium">{name}</p>
      <p className="text-muted-foreground">{value} order{value !== 1 ? 's' : ''}</p>
    </div>
  );
}

export function OrderStatusChart({ data }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="table-header">Orders by Status</CardTitle>
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
                  fill={STATUS_COLORS[entry.status] ?? 'var(--color-neutral-text)'}
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
