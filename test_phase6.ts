// ============================================================================
// PHASE 6 — FINANCIAL OPERATIONS & CASHBOX INTEGRITY TEST SUITE
// Cashbox + Expenses + Settlements + Integrity + Reports Foundation
// ============================================================================

import { db } from './src/db/sqlite';
import { FinanceService } from './src/services/FinanceService';
import { Money } from './src/utils/money';
import { User, Cashbox, Customer, Supplier, ExpenseCategory } from './src/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    failed++;
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  } else {
    passed++;
    console.log(`✅ PASS: ${msg}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('STARTING PHASE 6 VERIFICATION TEST SUITE');
  console.log('======================================================\n');

  // Fresh reset of DB state
  const state = db.getState();
  const now = Date.now();

  // 1. Setup entities
  const adminUser: User = {
    id: 'user-admin-p6',
    username: 'admin_p6',
    full_name: 'مدير النظام المالي',
    role_id: 'admin',
    password_hash: 'hash',
    pin_code: '1234',
    biometric_enabled: false,
    is_active: true,
    created_at: now,
    updated_at: now
  };

  const cashierUser: User = {
    id: 'user-cashier-p6',
    username: 'cashier_p6',
    full_name: 'كاشير الصيدلية',
    role_id: 'cashier',
    password_hash: 'hash',
    pin_code: '1234',
    biometric_enabled: false,
    is_active: true,
    created_at: now,
    updated_at: now
  };

  state.roles = [
    { id: 'admin', title_ar: 'مدير النظام', permissions: ['all'] },
    { id: 'cashier', title_ar: 'كاشير', permissions: ['pos'] }
  ];
  state.users = [adminUser, cashierUser];

  // Cashbox
  const testCashbox: Cashbox = {
    id: 'cb-test-p6',
    name_ar: 'الخزينة الرئيسية للاختبار',
    type: 'main',
    cached_balance: 0,
    is_active: true,
    created_at: now,
    updated_at: now
  };
  state.cashboxes = [testCashbox];
  state.cash_transactions = [];

  // Customer
  const testCustomer: Customer = {
    id: 'cust-p6-01',
    name: 'صالح محمد العولقي',
    phone: '771234567',
    cached_balance: 0,
    credit_limit: 1000000,
    is_active: true,
    created_at: now,
    updated_at: now
  };
  state.customers = [testCustomer];
  state.customer_transactions = [];

  // Supplier
  const testSupplier: Supplier = {
    id: 'supp-p6-01',
    name: 'شركة آزال للأدوية والمستلزمات',
    phone: '01234567',
    contact_person: 'د. وليد الحكيمي',
    cached_balance: 0,
    is_active: true,
    created_at: now,
    updated_at: now
  };
  state.suppliers = [testSupplier];
  state.supplier_transactions = [];

  // Expense Categories
  const expCat1: ExpenseCategory = {
    id: 'cat-exp-01',
    name_ar: 'كهرباء ومياه وطاقة',
    is_active: true
  };
  const expCat2: ExpenseCategory = {
    id: 'cat-exp-02',
    name_ar: 'أدوات نظافة وضيافة',
    is_active: true
  };
  state.expense_categories = [expCat1, expCat2];
  state.expenses = [];
  state.work_shifts = [];
  state.audit_logs = [];

  console.log('--- TEST GROUP 1: Cashbox Opening Balance & Balance Formula ---');
  // Opening balance formula: Opening + Total IN - Total OUT = Current Balance
  assert(FinanceService.getCashboxBalance(testCashbox.id) === 0, 'Initial cashbox true balance is exactly 0');

  const openingAmount = 100000; // 1,000.00 YER in minor units
  const openTx = FinanceService.setOpeningBalance({
    cashbox_id: testCashbox.id,
    amount: openingAmount,
    reason: 'إيداع رصيد افتتاحي لبداية التشغيل',
    user_id: adminUser.id
  });

  assert(openTx.amount === openingAmount, 'Opening cash transaction created with exact amount');
  assert(openTx.direction === 'IN', 'Opening transaction direction is IN');
  assert(FinanceService.getCashboxBalance(testCashbox.id) === openingAmount, 'Cashbox true balance equals opening amount');
  assert(testCashbox.cached_balance === openingAmount, 'Cashbox cached balance is synchronized');

  // Verify Audit Log
  const openAudit = state.audit_logs.find((l) => l.action === 'SET_OPENING_BALANCE');
  assert(!!openAudit, 'Audit log generated for SET_OPENING_BALANCE');
  assert(openAudit?.user_id === adminUser.id, 'Audit log has correct user ID');

  console.log('--- TEST GROUP 2: Strict No Negative Cashbox Prevention ---');
  let threwInsuff = false;
  try {
    // Current cash is 100,000. Try to adjust/withdraw 150,000
    FinanceService.adjustCash({
      cashbox_id: testCashbox.id,
      amount: 150000,
      direction: 'OUT',
      reason: 'سحب يتجاوز الرصيد',
      user_id: adminUser.id
    });
  } catch (err: any) {
    threwInsuff = true;
    assert(err.message.includes('غير كافٍ'), 'Error explicitly mentions insufficient cashbox funds');
  }
  assert(threwInsuff, 'Adjustment exceeding available cashbox balance was strictly REJECTED');
  assert(FinanceService.getCashboxBalance(testCashbox.id) === openingAmount, 'Cashbox balance completely intact after failed withdrawal');

  console.log('--- TEST GROUP 3: Customer Receivables & Debt Settlements ---');
  // Let customer buy goods on credit: 50,000 minor units
  const initialDebt = 50000;
  state.customer_transactions.push({
    id: 'ctx-init-01',
    customer_id: testCustomer.id,
    transaction_type: 'sale_credit',
    reference_type: 'invoice',
    reference_id: 'INV-TEST-01',
    debit: initialDebt,
    credit: 0,
    balance_after: initialDebt,
    notes: 'فاتورة مبيعات آجل',
    created_by: adminUser.id,
    created_at: now
  });
  testCustomer.cached_balance = initialDebt;

  assert(FinanceService.getCustomerBalance(testCustomer.id) === initialDebt, 'Customer true balance reflects credit invoice (50,000)');

  // Attempt overpayment: customer owes 50,000. Try to collect 60,000
  let threwOverpay = false;
  try {
    FinanceService.addCustomerReceipt({
      customer_id: testCustomer.id,
      cashbox_id: testCashbox.id,
      amount: 60000,
      notes: 'تحصيل زيادة',
      user_id: adminUser.id
    });
  } catch (err: any) {
    threwOverpay = true;
    assert(err.message.includes('يتجاوز مديونية العميل'), 'Error rejected customer overpayment');
  }
  assert(threwOverpay, 'Customer overpayment was strictly rejected');
  assert(FinanceService.getCustomerBalance(testCustomer.id) === initialDebt, 'Customer balance unchanged after rejected overpayment');

  // Valid partial receipt: 20,000 minor units
  const receiptAmount = 20000;
  const prevCash = FinanceService.getCashboxBalance(testCashbox.id);
  const receiptRes = FinanceService.addCustomerReceipt({
    customer_id: testCustomer.id,
    cashbox_id: testCashbox.id,
    amount: receiptAmount,
    notes: 'دفعة نقدية من الحساب',
    user_id: adminUser.id
  });

  assert(!!receiptRes.receipt_number, 'Receipt number generated properly (format REC-...)');
  assert(receiptRes.receipt_number.startsWith('REC-'), 'Receipt number follows naming convention');
  assert(receiptRes.customer_transaction.credit === receiptAmount, 'Customer transaction credited with receipt amount');
  assert(receiptRes.cash_transaction.direction === 'IN', 'Cash transaction direction is IN');
  assert(FinanceService.getCustomerBalance(testCustomer.id) === initialDebt - receiptAmount, 'Customer balance reduced by payment (30,000)');
  const updatedCustomer = state.customers.find((c) => c.id === testCustomer.id);
  assert(updatedCustomer?.cached_balance === initialDebt - receiptAmount, 'Customer cached balance synchronized');
  assert(FinanceService.getCashboxBalance(testCashbox.id) === prevCash + receiptAmount, 'Cashbox balance increased by payment amount');

  console.log('--- TEST GROUP 4: Supplier Payables & Payments ---');
  // Supplier delivers goods: credit of 80,000 minor units
  const initialPayable = 80000;
  state.supplier_transactions.push({
    id: 'stx-init-01',
    supplier_id: testSupplier.id,
    transaction_type: 'purchase_credit',
    reference_type: 'bill',
    reference_id: 'BILL-TEST-01',
    debit: 0,
    credit: initialPayable,
    balance_after: initialPayable,
    notes: 'فاتورة توريد آجل',
    created_by: adminUser.id,
    created_at: now
  });
  testSupplier.cached_balance = initialPayable;

  assert(FinanceService.getSupplierBalance(testSupplier.id) === initialPayable, 'Supplier payable reflects credit bill (80,000)');

  // Attempt overpayment to supplier: supplier is owed 80,000. Try to pay 90,000
  let threwSuppOverpay = false;
  try {
    FinanceService.addSupplierPayment({
      supplier_id: testSupplier.id,
      cashbox_id: testCashbox.id,
      amount: 90000,
      notes: 'سداد فائض',
      user_id: adminUser.id
    });
  } catch (err: any) {
    threwSuppOverpay = true;
    assert(err.message.includes('يتجاوز إجمالي مستحقات المورد'), 'Supplier overpayment rejected');
  }
  assert(threwSuppOverpay, 'Supplier overpayment was strictly rejected');

  // Valid payment: 40,000 minor units
  const paymentAmount = 40000;
  const cashBeforePayment = FinanceService.getCashboxBalance(testCashbox.id);
  const payRes = FinanceService.addSupplierPayment({
    supplier_id: testSupplier.id,
    cashbox_id: testCashbox.id,
    amount: paymentAmount,
    notes: 'دفعة سداد من فاتورة التوريد',
    user_id: adminUser.id
  });

  assert(payRes.voucher_number.startsWith('PAY-'), 'Voucher number follows convention (PAY-...)');
  assert(payRes.supplier_transaction.debit === paymentAmount, 'Supplier transaction debited with payment amount');
  assert(payRes.cash_transaction.direction === 'OUT', 'Cash transaction direction is OUT');
  assert(FinanceService.getSupplierBalance(testSupplier.id) === initialPayable - paymentAmount, 'Supplier payable reduced (40,000)');
  assert(FinanceService.getCashboxBalance(testCashbox.id) === cashBeforePayment - paymentAmount, 'Cashbox balance debited by payment');

  console.log('--- TEST GROUP 5: Operational Expenses & Reversal-Based Cancellation ---');
  const cashBeforeExpense = FinanceService.getCashboxBalance(testCashbox.id);
  const expAmount = 15000; // 150.00 YER
  const expRes = FinanceService.addExpense({
    category_id: expCat1.id,
    cashbox_id: testCashbox.id,
    amount: expAmount,
    statement: 'سداد فاتورة كهرباء الصيدلية لشهر مايو',
    recipient: 'المؤسسة العامة للكهرباء',
    user_id: adminUser.id
  });

  assert(expRes.expense.status === 'completed', 'Expense status is completed');
  assert(expRes.expense.amount === expAmount, 'Expense amount recorded as integer minor units');
  assert(expRes.cash_transaction?.direction === 'OUT', 'Cash transaction for expense is OUT');
  assert(FinanceService.getCashboxBalance(testCashbox.id) === cashBeforeExpense - expAmount, 'Cashbox decreased by expense amount');

  // Cancel Expense (Must be reversal, no physical delete)
  const cancelRes = FinanceService.cancelExpense({
    expense_id: expRes.expense.id,
    reason: 'خطأ في تسجيل قيمة الفاتورة',
    user_id: adminUser.id
  });

  assert(cancelRes.expense.status === 'cancelled', 'Expense status updated to cancelled');
  assert(cancelRes.expense.cancellation_reason === 'خطأ في تسجيل قيمة الفاتورة', 'Cancellation reason saved');
  assert(!!cancelRes.expense.cancelled_at, 'Cancelled timestamp recorded');
  assert(cancelRes.reversing_cash_transaction?.direction === 'IN', 'Reversing cash transaction has direction IN');
  assert(cancelRes.reversing_cash_transaction?.amount === expAmount, 'Reversing cash transaction has exact expense amount');
  assert(FinanceService.getCashboxBalance(testCashbox.id) === cashBeforeExpense, 'Cashbox balance completely restored after reversal');

  // Attempt double cancellation
  let threwDoubleCancel = false;
  try {
    FinanceService.cancelExpense({
      expense_id: expRes.expense.id,
      reason: 'محاولة إلغاء ثانية',
      user_id: adminUser.id
    });
  } catch (err: any) {
    threwDoubleCancel = true;
    console.log('Double cancel error message received:', err.message);
    assert(err.message.includes('ملغى مسبقاً') || err.message.includes('ملغى'), 'Double cancellation rejected');
  }
  assert(threwDoubleCancel, 'Prevented double cancellation of expense');

  console.log('--- TEST GROUP 6: Shift Operations & Counted Cash Variance Audit ---');
  // Open Shift
  const shiftOpening = 10000;
  const shift = FinanceService.openShift({
    cashbox_id: testCashbox.id,
    opening_cash: shiftOpening,
    user_id: cashierUser.id
  });

  assert(shift.status === 'open', 'Shift status is open');
  assert(shift.opening_cash === shiftOpening, 'Shift opening cash stored correctly');
  assert(shift.shift_number?.startsWith('SFT-'), 'Shift number has SFT prefix');

  // Attempt duplicate open shift on same cashbox for same user
  let threwDuplicateShift = false;
  try {
    FinanceService.openShift({
      cashbox_id: testCashbox.id,
      opening_cash: shiftOpening,
      user_id: cashierUser.id,
      idempotency_key: 'attempt-2-' + Date.now()
    });
  } catch (err: any) {
    threwDuplicateShift = true;
    assert(err.message.includes('مفتوحة بالفعل'), 'Duplicate shift rejected');
  }
  assert(threwDuplicateShift, 'Duplicate open shift strictly prevented');

  // Get summary
  const summary = FinanceService.getShiftSummary(shift.id);
  assert(typeof summary.expected_cash === 'number', 'Expected cash computed dynamically');

  // Attempt to close shift with variance without notes
  let threwVarianceWithoutNotes = false;
  try {
    FinanceService.closeShift({
      shift_id: shift.id,
      actual_cash: summary.expected_cash - 500, // Deficit of 5.00 YER
      closing_notes: '',
      user_id: cashierUser.id
    });
  } catch (err: any) {
    threwVarianceWithoutNotes = true;
    assert(err.message.includes('فارق نقدي'), 'Closing notes required when variance exists');
  }
  assert(threwVarianceWithoutNotes, 'Variance without explanation is strictly rejected');

  // Close with explanation
  const closedShift = FinanceService.closeShift({
    shift_id: shift.id,
    actual_cash: summary.expected_cash - 500,
    closing_notes: 'عجز طفيف في الفكة المعدنية',
    user_id: cashierUser.id
  });

  assert(closedShift.status === 'closed', 'Shift status updated to closed');
  assert(closedShift.cash_difference === -500, 'Cash difference deficit recorded correctly (-500)');
  assert(closedShift.closing_notes === 'عجز طفيف في الفكة المعدنية', 'Closing notes recorded');

  console.log('--- TEST GROUP 7: Manual Cash Adjustments & Permissions ---');
  // Cashier cannot adjust cash without admin role
  let threwUnauthorizedAdj = false;
  try {
    FinanceService.adjustCash({
      cashbox_id: testCashbox.id,
      amount: 5000,
      direction: 'IN',
      reason: 'تعديل بدون صلاحية',
      user_id: cashierUser.id
    });
  } catch (err: any) {
    threwUnauthorizedAdj = true;
    assert(err.message.includes('صلاحية'), 'Non-admin cash adjustment rejected');
  }
  assert(threwUnauthorizedAdj, 'Permission check enforces admin-only manual adjustments');

  // Admin adjustments
  const cashPreAdj = FinanceService.getCashboxBalance(testCashbox.id);
  const adjInRes = FinanceService.adjustCash({
    cashbox_id: testCashbox.id,
    amount: 25000,
    direction: 'IN',
    reason: 'إيداع تغذية نقدية للصندوق',
    user_id: adminUser.id
  });
  assert(adjInRes.cash_transaction.direction === 'IN', 'Adjustment IN direction verified');
  assert(FinanceService.getCashboxBalance(testCashbox.id) === cashPreAdj + 25000, 'Cashbox increased by 25,000');

  console.log('--- TEST GROUP 8: Full Reconciliation Engine ---');
  // Intentionally corrupt cached_balance
  const cbToCorrupt = state.cashboxes.find((c) => c.id === testCashbox.id)!;
  const custToCorrupt = state.customers.find((c) => c.id === testCustomer.id)!;
  const suppToCorrupt = state.suppliers.find((s) => s.id === testSupplier.id)!;

  cbToCorrupt.cached_balance = 9999999;
  custToCorrupt.cached_balance = 8888888;
  suppToCorrupt.cached_balance = 7777777;

  const reconRes = FinanceService.reconcileAll();
  assert(reconRes.cashboxes >= 1, 'Reconciled cashboxes counted');
  assert(reconRes.customers >= 1, 'Reconciled customers counted');
  assert(reconRes.suppliers >= 1, 'Reconciled suppliers counted');

  // Verify cached balances restored to true ledger source of truth
  const reconCb = state.cashboxes.find((c) => c.id === testCashbox.id);
  const reconCust = state.customers.find((c) => c.id === testCustomer.id);
  const reconSupp = state.suppliers.find((s) => s.id === testSupplier.id);
  assert(reconCb?.cached_balance === FinanceService.getCashboxBalance(testCashbox.id), 'Cashbox cached balance restored to ledger truth');
  assert(reconCust?.cached_balance === FinanceService.getCustomerBalance(testCustomer.id), 'Customer cached balance restored to ledger truth');
  assert(reconSupp?.cached_balance === FinanceService.getSupplierBalance(testSupplier.id), 'Supplier cached balance restored to ledger truth');

  console.log('--- TEST GROUP 9: Reports & Statements Foundation ---');
  // Cashbox Report
  const cbReport = FinanceService.getCashboxReport(testCashbox.id);
  assert(cbReport.closing_balance === FinanceService.getCashboxBalance(testCashbox.id), 'Cashbox report closing balance matches ledger truth');
  assert(cbReport.inflows.total > 0, 'Cashbox report includes inflows');
  assert(cbReport.outflows.total > 0, 'Cashbox report includes outflows');
  assert(cbReport.net_change === cbReport.inflows.total - cbReport.outflows.total, 'Net cash flow formula holds');

  // Customer Statement
  const custStatement = FinanceService.getCustomerStatement(testCustomer.id);
  assert(custStatement.closing_balance === FinanceService.getCustomerBalance(testCustomer.id), 'Customer statement closing balance matches true balance');
  assert(custStatement.items.length >= 2, 'Customer statement includes credit sale and payment receipt');
  // Verify running balance consistency
  let lastRun = custStatement.opening_balance;
  for (const item of custStatement.items) {
    lastRun = lastRun + (item.debit - item.credit);
    assert(item.running_balance === lastRun, `Running balance at ${item.id} is mathematically exact`);
  }

  // Supplier Statement
  const suppStatement = FinanceService.getSupplierStatement(testSupplier.id);
  assert(suppStatement.closing_balance === FinanceService.getSupplierBalance(testSupplier.id), 'Supplier statement closing balance matches true balance');
  assert(suppStatement.items.length >= 2, 'Supplier statement includes bill and payment voucher');
  let lastSuppRun = suppStatement.opening_balance;
  for (const item of suppStatement.items) {
    lastSuppRun = lastSuppRun + (item.credit - item.debit);
    assert(item.running_balance === lastSuppRun, `Supplier running balance at ${item.id} is mathematically exact`);
  }

  // Expense Report
  const expReport = FinanceService.getExpenseReport();
  assert(expReport.count_active >= 0, 'Expense report counts active expenses');
  assert(expReport.count_cancelled >= 1, 'Expense report counts cancelled expenses');
  assert(expReport.total_cancelled_amount === expAmount, 'Cancelled expense amount matches exactly');

  console.log('\n======================================================');
  console.log(`PHASE 6 VERIFICATION COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test runner encountered unexpected fatal error:', err);
  process.exit(1);
});
