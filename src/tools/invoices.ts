import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

type ToolResult = { content: Array<{ type: string; text: string }> };

const STATUS_LABELS: Record<number, string> = {
  1: 'draft',
  2: 'sent',
  3: 'paid',
  4: 'canceled',
};

const listInvoicesSchema = z.object({
  company_id: z.string().optional(),
  project_id: z.string().optional(),
  status: z.number().int().min(1).max(4).optional().describe('1=draft, 2=sent, 3=paid, 4=canceled'),
  after: z.string().optional(),
  before: z.string().optional(),
  limit: z.number().min(1).max(200).default(30).optional(),
  page: z.number().min(1).optional(),
});

const getInvoiceSchema = z.object({
  invoice_id: z.string().min(1, 'Invoice ID is required'),
});

function handleError(error: unknown): never {
  if (error instanceof z.ZodError) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`);
  }
  throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error occurred');
}

function formatCurrency(amount: number | undefined, currency: string | undefined): string {
  if (amount === undefined) return 'N/A';
  const curr = currency ?? 'USD';
  return `${curr} ${(amount / 100).toFixed(2)}`;
}

export async function listInvoicesTool(client: ProductiveAPIClient, args: unknown): Promise<ToolResult> {
  try {
    const params = listInvoicesSchema.parse(args || {});

    const response = await client.listInvoices({
      company_id: params.company_id,
      project_id: params.project_id,
      status: params.status,
      after: params.after,
      before: params.before,
      limit: params.limit,
      page: params.page,
    });

    if (!response.data || response.data.length === 0) {
      return { content: [{ type: 'text', text: 'No invoices found matching the criteria.' }] };
    }

    const invoicesText = response.data.map(invoice => {
      const status = invoice.attributes.status ? (STATUS_LABELS[invoice.attributes.status] ?? `status ${invoice.attributes.status}`) : 'unknown';
      const companyId = invoice.relationships?.company?.data?.id;
      const projectId = invoice.relationships?.project?.data?.id;
      const total = formatCurrency(invoice.attributes.total as number | undefined, invoice.attributes.currency as string | undefined);
      return `• Invoice ${invoice.attributes.number ?? invoice.id} (ID: ${invoice.id})
  Status: ${status}
  Total: ${total}
  ${invoice.attributes.invoice_date ? `Date: ${invoice.attributes.invoice_date}` : ''}
  ${invoice.attributes.due_date ? `Due: ${invoice.attributes.due_date}` : ''}
  ${companyId ? `Company ID: ${companyId}` : ''}
  ${projectId ? `Project ID: ${projectId}` : ''}`.trim();
    }).join('\n\n');

    const total = response.meta?.total_count;
    const summary = `Found ${response.data.length} invoice${response.data.length !== 1 ? 's' : ''}${total ? ` (showing ${response.data.length} of ${total})` : ''}:\n\n${invoicesText}`;

    return { content: [{ type: 'text', text: summary }] };
  } catch (error) {
    handleError(error);
  }
}

export async function getInvoiceTool(client: ProductiveAPIClient, args: unknown): Promise<ToolResult> {
  try {
    const params = getInvoiceSchema.parse(args);
    const response = await client.getInvoice(params.invoice_id);
    const invoice = response.data;
    const status = invoice.attributes.status ? (STATUS_LABELS[invoice.attributes.status] ?? `status ${invoice.attributes.status}`) : 'unknown';
    const companyId = invoice.relationships?.company?.data?.id;
    const projectId = invoice.relationships?.project?.data?.id;
    const total = formatCurrency(invoice.attributes.total as number | undefined, invoice.attributes.currency as string | undefined);
    const paid = formatCurrency(invoice.attributes.paid_amount as number | undefined, invoice.attributes.currency as string | undefined);

    let text = `Invoice Details:\n\n`;
    text += `Number: ${invoice.attributes.number ?? invoice.id}\n`;
    text += `ID: ${invoice.id}\n`;
    text += `Status: ${status}\n`;
    text += `Total: ${total}\n`;
    if (invoice.attributes.paid_amount !== undefined) text += `Paid: ${paid}\n`;
    if (invoice.attributes.invoice_date) text += `Invoice Date: ${invoice.attributes.invoice_date}\n`;
    if (invoice.attributes.due_date) text += `Due Date: ${invoice.attributes.due_date}\n`;
    if (invoice.attributes.note) text += `Note: ${invoice.attributes.note}\n`;
    if (companyId) text += `Company ID: ${companyId}\n`;
    if (projectId) text += `Project ID: ${projectId}\n`;
    if (invoice.attributes.created_at) text += `Created: ${invoice.attributes.created_at}\n`;

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    handleError(error);
  }
}

export const listInvoicesDefinition = {
  name: 'list_invoices',
  description: 'List invoices in Productive.io. Filter by company, project, or status (1=draft, 2=sent, 3=paid, 4=canceled) and date range.',
  inputSchema: {
    type: 'object',
    properties: {
      company_id: { type: 'string', description: 'Filter by company ID' },
      project_id: { type: 'string', description: 'Filter by project ID' },
      status: {
        type: 'number',
        description: 'Filter by status: 1=draft, 2=sent, 3=paid, 4=canceled',
        minimum: 1,
        maximum: 4,
      },
      after: { type: 'string', description: 'Filter invoices dated after this date (YYYY-MM-DD)' },
      before: { type: 'string', description: 'Filter invoices dated before this date (YYYY-MM-DD)' },
      limit: { type: 'number', description: 'Number of results (1-200, default: 30)', minimum: 1, maximum: 200, default: 30 },
      page: { type: 'number', description: 'Page number for pagination', minimum: 1 },
    },
  },
};

export const getInvoiceDefinition = {
  name: 'get_invoice',
  description: 'Get detailed information about a specific invoice by its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      invoice_id: { type: 'string', description: 'The ID of the invoice to retrieve (required)' },
    },
    required: ['invoice_id'],
  },
};
