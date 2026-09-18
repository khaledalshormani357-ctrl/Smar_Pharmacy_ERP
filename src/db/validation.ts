// Domain Validation Layer for Smart Pharmacy ERP
// Validates entities before database insertion to enforce integrity and business rules

export class ValidationError extends Error {
  public field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class DomainValidator {
  // Normalize Arabic text for uniform matching without altering original visual representation
  static normalizeArabic(text: string): string {
    if (!text) return '';
    return text
      .trim()
      .replace(/[\u064B-\u065F]/g, '') // remove tashkeel
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي');
  }

  // Validate Product definition
  static validateProduct(data: {
    name_ar?: string;
    base_unit?: string;
    current_purchase_price?: number;
    current_selling_price?: number;
    min_stock_level?: number;
    barcode?: string;
  }, isPartial = false): void {
    if (!isPartial) {
      if (!data.name_ar || data.name_ar.trim().length === 0) {
        throw new ValidationError('اسم الصنف بالعربية إلزامي.', 'name_ar');
      }
      if (!data.base_unit || data.base_unit.trim().length === 0) {
        throw new ValidationError('الوحدة الأساسية (Base Unit) إلزامية.', 'base_unit');
      }
    } else {
      if (data.name_ar !== undefined && data.name_ar.trim().length === 0) {
        throw new ValidationError('اسم الصنف بالعربية لا يمكن أن يكون فارغاً.', 'name_ar');
      }
      if (data.base_unit !== undefined && data.base_unit.trim().length === 0) {
        throw new ValidationError('الوحدة الأساسية لا يمكن أن تكون فارغة.', 'base_unit');
      }
    }
    if (data.current_purchase_price !== undefined && data.current_purchase_price < 0) {
      throw new ValidationError('سعر الشراء لا يمكن أن يكون سالباً.', 'current_purchase_price');
    }
    if (data.current_selling_price !== undefined && data.current_selling_price < 0) {
      throw new ValidationError('سعر البيع لا يمكن أن يكون سالباً.', 'current_selling_price');
    }
    if (data.min_stock_level !== undefined && data.min_stock_level < 0) {
      throw new ValidationError('حد إعادة الطلب الأدنى لا يمكن أن يكون سالباً.', 'min_stock_level');
    }
  }

  // Validate Batch definition
  static validateBatch(data: {
    batch_number?: string;
    expiry_date?: string;
    initial_quantity?: number;
    purchase_price?: number;
    selling_price?: number;
  }): void {
    if (!data.batch_number || data.batch_number.trim().length === 0) {
      throw new ValidationError('رقم التشغيلة (Batch Number) إلزامي.', 'batch_number');
    }
    if (!data.expiry_date || !/^\d{4}-\d{2}-\d{2}$/.test(data.expiry_date)) {
      throw new ValidationError('تاريخ الصلاحية يجب أن يكون بصيغة YYYY-MM-DD صالحة.', 'expiry_date');
    }
    if (data.initial_quantity !== undefined && data.initial_quantity < 0) {
      throw new ValidationError('كمية الدفعة لا يمكن أن تكون سالبة.', 'initial_quantity');
    }
    if (data.purchase_price !== undefined && data.purchase_price < 0) {
      throw new ValidationError('سعر شراء الدفعة لا يمكن أن يكون سالباً.', 'purchase_price');
    }
    if (data.selling_price !== undefined && data.selling_price < 0) {
      throw new ValidationError('سعر بيع الدفعة لا يمكن أن يكون سالباً.', 'selling_price');
    }
  }

  // Validate Unit Conversion
  static validateConversion(data: {
    unit_name?: string;
    conversion_factor?: number;
    selling_price?: number;
  }): void {
    if (!data.unit_name || data.unit_name.trim().length === 0) {
      throw new ValidationError('اسم وحدة البيع إلزامي.', 'unit_name');
    }
    if (!data.conversion_factor || data.conversion_factor <= 0) {
      throw new ValidationError('معامل التحويل (Conversion Factor) يجب أن يكون أكبر من الصفر.', 'conversion_factor');
    }
    if (data.selling_price !== undefined && data.selling_price < 0) {
      throw new ValidationError('سعر بيع الوحدة لا يمكن أن يكون سالباً.', 'selling_price');
    }
  }

  // Validate Money Minor Units integer constraint
  static validateIntegerAmount(amount: number, fieldName: string): void {
    if (typeof amount !== 'number' || !Number.isInteger(amount)) {
      throw new ValidationError(`القيمة المالية (${fieldName}) يجب أن تكون عدداً صحيحاً بالوحدات الصغرى (Minor Units).`, fieldName);
    }
    if (amount < 0) {
      throw new ValidationError(`القيمة المالية (${fieldName}) لا يمكن أن تكون سالبة.`, fieldName);
    }
  }
}
