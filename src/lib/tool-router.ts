// Tool router for executing capabilities requested by user via chat or voice.
import { createClient } from '@/lib/supabase/server';

export interface ToolExecutionRequest {
  tool: 'create_invoice' | 'create_expense' | 'search_records' | 'financial_summary' | 'generate_report_pdf' | 'navigate_ui' | 'save_preference';
  params: Record<string, unknown>;
  userId?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  message?: string;
  data?: unknown;
  redirect_url?: string;
}

export async function executeToolAction(req: ToolExecutionRequest): Promise<ToolExecutionResult> {
  const supabase = await createClient();

  switch (req.tool) {
    case 'navigate_ui': {
      const dest = String(req.params.destination ?? 'dashboard');
      const routes: Record<string, string> = {
        invoices: '/invoices',
        expenses: '/expenses',
        settings: '/settings',
        dashboard: '/dashboard',
        summary: '/summary',
        clients: '/clients',
      };
      const path = routes[dest] || '/dashboard';
      return {
        success: true,
        message: `Navigating to ${dest}`,
        redirect_url: path,
      };
    }

    case 'search_records': {
      if (!req.userId) return { success: false, message: 'Authentication required' };
      const query = String(req.params.query ?? '').trim();
      const recordType = String(req.params.record_type ?? 'invoice');

      if (recordType === 'expense') {
        const { data } = await supabase
          .from('expenses')
          .select('id, vendor, category, amount, occurred_on')
          .eq('user_id', req.userId)
          .ilike('vendor', `%${query}%`)
          .limit(5);
        return { success: true, data: data ?? [] };
      } else {
        const { data } = await supabase
          .from('invoices')
          .select('id, invoice_number, client_name, total, status, created_at')
          .eq('user_id', req.userId)
          .is('deleted_at', null)
          .ilike('client_name', `%${query}%`)
          .limit(5);
        return { success: true, data: data ?? [] };
      }
    }

    case 'financial_summary': {
      if (!req.userId) return { success: false, message: 'Authentication required' };
      const period = (req.params.period as 'week' | 'month' | 'year') || 'month';

      const { data: invoices } = await supabase
        .from('invoices')
        .select('total, status, created_at')
        .eq('user_id', req.userId)
        .is('deleted_at', null);

      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount, category, occurred_on')
        .eq('user_id', req.userId);

      const rev = (invoices ?? []).reduce((acc, i) => acc + (Number(i.total) || 0), 0);
      const exp = (expenses ?? []).reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

      return {
        success: true,
        data: {
          title: `${period.toUpperCase()} Financial Summary`,
          period,
          revenue: rev,
          expenses: exp,
          netIncome: rev - exp,
        },
      };
    }

    case 'save_preference': {
      if (!req.userId) return { success: false, message: 'Authentication required' };
      const key = String(req.params.key ?? '');
      const value = req.params.value;
      if (key) {
        const { saveUserPreferences } = await import('@/lib/preferences');
        await saveUserPreferences(req.userId, { [key]: value });
      }
      return { success: true, message: 'Preference saved.' };
    }

    default:
      return { success: true, message: 'Tool capability ready' };
  }
}
