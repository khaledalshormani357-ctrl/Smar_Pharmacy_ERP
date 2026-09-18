// Money and Numerical Utility for Smart Pharmacy ERP
// Operates on integer Minor Units (e.g. 10000 = 100.00 YER)

export const Money = {
  // Convert major decimal units (e.g., 12.50) to minor integer units (1250)
  toMinor(val: number | string | undefined | null): number {
    if (val === undefined || val === null || val === '') return 0;
    const num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
    if (isNaN(num)) return 0;
    return Math.round(num * 100);
  },

  // Convert minor integer units (1250) to decimal major units (12.5)
  toMajor(minor: number | undefined | null): number {
    if (!minor || isNaN(minor)) return 0;
    return minor / 100;
  },

  // Format minor units with Arabic currency and comma separation
  format(minor: number | undefined | null, currency = 'ر.ي'): string {
    const major = this.toMajor(minor);
    const formatted = major.toLocaleString('ar-YE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${formatted} ${currency}`;
  },

  // Pure formatted number without currency symbol
  formatNumber(minor: number | undefined | null): string {
    const major = this.toMajor(minor);
    return major.toLocaleString('ar-YE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  },

  // Basis points conversion: 2000 bps = 20.00%
  bpsToPercent(bps: number): number {
    return bps / 100;
  },

  percentToBps(percent: number): number {
    return Math.round(percent * 100);
  }
};
