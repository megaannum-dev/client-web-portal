"use server";

import {
  getTickets as _getTickets,
  getTicket as _getTicket,
  setTicketStatus as _setTicketStatus,
  type APIResult,
} from "@/server/rm";
import type { RmTicketDTO, TicketStatus } from "@/lib/rm/tickets";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    code: "ACTION_ERROR",
  };
}

export async function getTickets(): Promise<APIResult<RmTicketDTO[]>> {
  try {
    logger.log("🔄 Fetching RM tickets...");
    const response = await _getTickets();
    logger.json("✅ Get tickets response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching RM tickets:", { error });
    return toErrorResult(error);
  }
}

export async function getTicket(ref: string): Promise<APIResult<RmTicketDTO>> {
  try {
    logger.log("🔄 Fetching RM ticket:", ref);
    const response = await _getTicket(ref);
    logger.json("✅ Get ticket response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching RM ticket:", { error, ref });
    return toErrorResult(error);
  }
}

export async function setTicketStatus(
  ref: string,
  body: { status: TicketStatus; note?: string },
): Promise<APIResult<RmTicketDTO>> {
  try {
    logger.json("🔄 Setting RM ticket status:", { ref, body });
    const response = await _setTicketStatus(ref, body);
    logger.json("✅ Set ticket status response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error setting RM ticket status:", { error, ref, body });
    return toErrorResult(error);
  }
}
