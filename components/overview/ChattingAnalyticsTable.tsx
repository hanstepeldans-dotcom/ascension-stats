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
  cancelledSubscribers: number;
  netSubscribers: number;
}

interface ChattingAnalyticsTableProps {
  rows: ChattingAnalyticsRow[];
  periodLabel?: string;
  className?: string;
}

export function ChattingAnalyticsTable({
  rows,
  periodLabel = "This week",
  className,
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
                  <TableCell className="text-left text-zinc-300">
                    {row.newSubscribers.toLocaleString("en-US")}
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-left text-zinc-300">
                    {row.cancelledSubscribers.toLocaleString("en-US")}
                  </TableCell>
                  <TableCell
                    className={`text-left font-medium ${
                      row.netSubscribers >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {row.netSubscribers >= 0 ? "+" : ""}
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
