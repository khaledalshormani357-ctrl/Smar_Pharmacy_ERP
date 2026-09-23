// Types and Contracts for Smart Pharmacy Copilot (Phase 9)
// Strictly typed Intent system, Action Registry, Confirmation policies, and Structured Responses

import { User } from '../types';

export type AssistantIntent =
  // Guide & Navigation
  | 'GUIDE'
  | 'NAVIGATE'
  | 'HELP'
  // Read Queries
  | 'SEARCH_PRODUCT'
  | 'GET_PRODUCT_DETAILS'
  | 'GET_STOCK'
  | 'GET_LOW_STOCK'
  | 'GET_EXPIRING_PRODUCTS'
  | 'GET_CASHBOX'
  | 'GET_CUSTOMER'
  | 'GET_CUSTOMER_BALANCE'
  | 'GET_SUPPLIER'
  | 'GET_SUPPLIER_BALANCE'
  | 'GET_SALES'
  | 'GET_REPORT'
  // Write Operations
  | 'CREATE_PRODUCT'
  | 'UPDATE_PRODUCT'
  | 'CREATE_SALE'
  | 'CANCEL_SALE'
  | 'CREATE_PURCHASE'
  | 'CANCEL_PURCHASE'
  | 'CREATE_EXPENSE'
  | 'CANCEL_EXPENSE'
  | 'ADJUST_CASH'
  | 'RECEIVE_CUSTOMER_PAYMENT'
  | 'PAY_SUPPLIER'
  | 'OPEN_SHIFT'
  | 'CLOSE_SHIFT'
  // Medical Safety & Pharmacy Knowledge
  | 'CHECK_INTERACTIONS'
  | 'CALCULATE_DOSE'
  | 'UNKNOWN';

export type ConfirmationPolicy = 'none' | 'required';

export type ActionCategory = 'navigation' | 'guide' | 'read' | 'write';

export interface ActionParameterDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
}

export interface AssistantActionDef {
  id: string;
  intent: AssistantIntent;
  name_ar: string;
  description_ar: string;
  category: ActionCategory;
  requiredPermissions: string[];
  confirmationPolicy: ConfirmationPolicy;
  parameters: ActionParameterDef[];
}

export interface AssistantContext {
  currentUser: User;
  currentScreen: string;
  currentSubSection?: string;
  activeShiftId?: string;
  isOnline: boolean;
  navigateTo: (screen: string, subSection?: string) => void;
}

export type AssistantResponseType =
  | 'TEXT'
  | 'GUIDE'
  | 'NAVIGATION'
  | 'PRODUCT_CARD'
  | 'PRODUCT_LIST'
  | 'BALANCE_CARD'
  | 'INVOICE_SUMMARY'
  | 'REPORT_CARD'
  | 'CONFIRMATION'
  | 'ACTION_RESULT'
  | 'AMBIGUITY'
  | 'ERROR';

export interface GuideStep {
  stepNumber: number;
  title: string;
  instruction: string;
  targetScreen?: string;
  targetSection?: string;
}

export interface GuideResponseData {
  topic: string;
  summary: string;
  steps: GuideStep[];
  navigationTarget?: {
    screen: string;
    section?: string;
    buttonLabel: string;
  };
}

export interface NavigationResponseData {
  screen: string;
  section?: string;
  label: string;
  description?: string;
}

export interface ProductCardData {
  id: string;
  name_ar: string;
  name_en?: string;
  active_ingredient?: string;
  dosage_form?: string;
  barcode?: string;
  current_selling_price: number;
  current_purchase_price: number;
  total_stock: number;
  base_unit: string;
  batches: Array<{
    batch_number: string;
    expiry_date: string;
    quantity: number;
    days_to_expiry?: number;
  }>;
}

export interface BalanceCardData {
  entityType: 'cashbox' | 'customer' | 'supplier';
  entityId: string;
  title: string;
  name: string;
  balance: number;
  currency: string;
  subtitle?: string;
  details?: Array<{ label: string; value: string | number }>;
}

export interface InvoiceSummaryData {
  invoiceId: string;
  invoiceNumber: string;
  type: 'sale' | 'purchase' | 'return';
  partyName?: string;
  date: string;
  itemCount: number;
  totalAmount: number;
  paidAmount: number;
  paymentType: string;
  itemsSummary: Array<{
    productName: string;
    quantity: number;
    unitName: string;
    unitPrice: number;
    lineTotal: number;
  }>;
}

export interface ReportCardData {
  reportType: string;
  title: string;
  metrics: Array<{ label: string; value: string | number; color?: string }>;
  summaryNotes?: string;
}

export interface ConfirmationRequestData {
  actionId: string;
  actionName: string;
  operationKey: string;
  impactLevel: 'financial' | 'inventory' | 'security';
  summary: string;
  details: Array<{ label: string; value: string | number }>;
  params: any;
}

export interface ActionResultData {
  success: boolean;
  actionId: string;
  actionName: string;
  entityId?: string;
  entityType?: string;
  referenceNumber?: string;
  message: string;
  affectedRecords?: number;
  financialImpact?: {
    cashboxId?: string;
    amount: number;
    direction: 'in' | 'out';
  };
  stockImpact?: {
    productId?: string;
    quantity: number;
    direction: 'in' | 'out';
  };
  details?: any;
}

export interface AmbiguityChoice {
  id: string;
  title: string;
  description: string;
  params: any;
}

export interface AmbiguityData {
  prompt: string;
  choices: AmbiguityChoice[];
}

export type GeminiChatModel = 'gemini-3-flash-preview' | 'gemini-3.5-flash' | 'gemini-3.1-flash-lite' | 'gemini-3.1-pro-preview';
export type ChatbotRole = 'general' | 'clinical' | 'inventory' | 'finance' | 'fast';

export interface AssistantMessage {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: number;
  text: string;
  responseType?: AssistantResponseType;
  model?: string;
  role?: string;
  latencyMs?: number;
  data?: {
    guide?: GuideResponseData;
    navigation?: NavigationResponseData;
    product?: ProductCardData;
    products?: ProductCardData[];
    balance?: BalanceCardData;
    invoice?: InvoiceSummaryData;
    report?: ReportCardData;
    confirmation?: ConfirmationRequestData;
    actionResult?: ActionResultData;
    ambiguity?: AmbiguityData;
    errorReason?: string;
    canRetry?: boolean;
    originalQuery?: string;
  };
}
