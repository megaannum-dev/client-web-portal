"use server";

import {
  getPeriods as _getPeriods,
  getAllocation as _getAllocation,
  confirmPeriod as _confirmPeriod,
} from "@/server/pc";

export async function getPeriods() { return _getPeriods(); }
export async function getAllocation(period?: string, etag?: string) { return _getAllocation(period, etag); }
export async function confirmPeriod(id: string) { return _confirmPeriod(id); }
