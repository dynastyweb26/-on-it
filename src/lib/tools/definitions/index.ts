// ═══ AI Smart · one entry per tool file ═══
//
// Every tool lives in its own file in this folder and is exported here. The
// registry builds from this list and refuses to load if any definition is
// incomplete, so adding a file is the only way to add a tool.
import type { ToolDefinition } from '../contract';
import { unpaidTool } from './unpaid';
import { listInvoicesTool } from './list_invoices';
import { listEstimatesTool } from './list_estimates';
import { getInvoiceTool } from './get_invoice';
import { getEstimateTool } from './get_estimate';
import { findClientTool } from './find_client';
import { getClientSummaryTool } from './get_client_summary';
import { listExpensesTool } from './list_expenses';
import { getExpenseTool } from './get_expense';
import { listPaymentsTool } from './list_payments';
import { listSavedItemsTool } from './list_saved_items';
import { runReportTool } from './run_report';
import { createClientTool } from './create_client';

import { editClientTool } from './edit_client';
import { saveItemTool } from './save_item';
import { editExpenseTool } from './edit_expense';
import { deleteExpenseTool } from './delete_expense';
import { deleteDraftTool } from './delete_draft';
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [unpaidTool, listInvoicesTool, listEstimatesTool, getInvoiceTool, getEstimateTool, findClientTool, getClientSummaryTool, listExpensesTool, getExpenseTool, listPaymentsTool, listSavedItemsTool, runReportTool, createClientTool, editClientTool, saveItemTool, editExpenseTool, deleteExpenseTool, deleteDraftTool];
