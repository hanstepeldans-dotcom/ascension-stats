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

export interface ChattingAnalyticsRow {
  modelId: string;
  modelName: string;
  newSubscribers: number;
  chattingRatio: number;
  netSubscribers: number;
}

interface ChattingAnalyticsTableProps {
  rows: ChattingAnalyticsRow[];
  periodLabel?: string;
  className?: string;
  onSubsChange?: (modelId: string, value: number) => void;
}

export function ChattingAnalyticsTable({
  rows,
  periodLabel = "This week",
  className,
  onSubsChange,
}: ChattingAnalyticsTableProps) {
  return (
    <Card
      className={
        className ??
        "border-white/10 bg-white/[0.04] backdrop-blur-sm"
      }
    >
      <CardHeader>
        <CardTitle className="text-white">Chatting analytics</CardTitle>
        <p className="text-xs text-zinc-500">{periodLabel}</p>
      </CardHeader>
      <CardContent>
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-zinc-400 font-medium w-[32%]">Model</TableHead>
              <TableHead className="text-left text-zinc-400 font-medium w-[17%]">
                Subs
              </TableHead>
              <TableHead className="w-[17%]" />
              <TableHead className="text-left text-zinc-400 font-medium w-[17%]">
                Chatting Ratio
              </TableHead>
              <TableHead className="text-left text-zinc-400 font-medium w-[17%]">
                LTV
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
                  No chatting data for this period.
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
                  <TableCell className="text-left text-zinc-300 py-0">
                    <input
                      type="number"
                      min={0}
                      value={row.newSubscribers || ""}
                      placeholder="—"
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        onSubsChange?.(row.modelId, Number.isNaN(v) ? 0 : v);
                      }}
                      className="w-full bg-transparent text-zinc-300 placeholder-zinc-600 outline-none py-3 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-left text-zinc-300">
                    {row.chattingRatio.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-left text-zinc-300">
                    {row.netSubscribers.toLocaleString("en-US")}
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
