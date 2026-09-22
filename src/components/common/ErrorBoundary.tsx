import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  title?: string;
  subTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || 'حدث خطأ غير متوقع في واجهة النظام';

      return (
        <div className="min-h-[300px] w-full p-6 flex items-center justify-center bg-slate-50/80 rounded-3xl border border-slate-200" dir="rtl">
          <div className="max-w-md w-full bg-white p-6 rounded-2xl shadow-lg border border-rose-100 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
              <ShieldAlert className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                {this.props.title || 'تعذر تحميل هذا الجزء من الواجهة'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {this.props.subTitle || 'تم منع الشاشة البيضاء بنجاح وإيقاف الانهيار البرمجي بأمان.'}
              </p>
            </div>

            <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-100 text-right">
              <p className="text-[11px] font-mono text-rose-800 break-words line-clamp-3">
                {errorMessage}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>إعادة المحاولة</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Home className="w-3.5 h-3.5" />
                <span>تحديث التطبيق</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
