"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CURRENCY_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export interface ModelEarningsRow {
  modelId: string;
  modelName: string;
  total: number;
  messages: number;
  tips: number;
  subscriptions: number;
}

interface ModelsEarningsTableProps {
  rows: ModelEarningsRow[];
  periodLabel?: string;
  metricTypeLabel?: string;
  className?: string;
}

export function ModelsEarningsTable({
  rows,
  periodLabel = "This week",
  metricTypeLabel = "Net earnings",
  className,
}: ModelsEarningsTableProps) {
  return (
    <Card
      className={
        className ??
        "border-white/10 bg-white/[0.04] backdrop-blur-sm"
      }
    >
      <CardHeader>
        <CardTitle className="text-white">Earnings by model</CardTitle>
        <p className="text-xs text-zinc-500">
          {metricTypeLabel} · {periodLabel}
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-zinc-400 font-medium">Model</TableHead>
              <TableHead className="text-right text-zinc-400 font-medium">
                Total earnings
              </TableHead>
              <TableHead className="text-right text-zinc-400 font-medium">
                Messages
              </TableHead>
              <TableHead className="text-right text-zinc-400 font-medium">
                Tips
              </TableHead>
              <TableHead className="text-right text-zinc-400 font-medium">
                Subscriber
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="border-white/10">
                <TableCell
                  colSpan={5}
                  className="text-center text-zinc-500 py-8"
                >
                  No model data for this period.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.modelId}
                  className="border-white/10 hover:bg-white/[0.03]"
                >
                  <TableCell className="font-medium text-white">
                    {row.modelName}
                  </TableCell>
                  <TableCell className="text-right text-white">
                    {CURRENCY_FORMAT.format(row.total)}
                  </TableCell>
                  <TableCell className="text-right text-zinc-300">
                    {CURRENCY_FORMAT.format(row.messages)}
                  </TableCell>
                  <TableCell className="text-right text-zinc-300">
                    {CURRENCY_FORMAT.format(row.tips)}
                  </TableCell>
                  <TableCell className="text-right text-zinc-300">
                    {CURRENCY_FORMAT.format(row.subscriptions)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
