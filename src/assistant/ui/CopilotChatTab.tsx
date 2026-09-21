// Copilot Chat Tab Component for Smart Pharmacy Copilot (Phase 9)
import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Package,
  Layers,
  ShieldCheck,
  ChevronLeft
} from 'lucide-react';
import {
  AssistantMessage,
  AssistantContext,
  AmbiguityChoice
} from '../types';
import { AssistantOrchestrator } from '../orchestrator/AssistantOrchestrator';
import { GuideCard } from './GuideCard';
import { ProductCardView } from './ProductCardView';
import { BalanceCardView } from './BalanceCardView';
import { ConfirmationCard } from './ConfirmationCard';
import { User } from '../../types';

interface CopilotChatTabProps {
  currentUser: User;
  currentScreen: string;
  onNavigate: (screen: string, section?: string) => void;
  onCloseModal: () => void;
}

export const CopilotChatTab: React.FC<CopilotChatTabProps> = ({
  currentUser,
  currentScreen,
  onNavigate,
  onCloseModal
}) => {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      timestamp: Date.now(),
      text: `مرحباً بك دكتور ${currentUser.name}. أنا مساعد الصيدلية الذكي (Smart Pharmacy Copilot).\n\nأفهم بنية التطبيق وصلاحياتك الحالية (${currentUser.role_id === 'admin' ? 'مدير النظام' : 'صيدلي'}). يمكنك سؤالي عن طريقة استخدام أي شاشة، أو الاستفسار عن الأرصدة والمخزون، أو تنفيذ عملياتك بأمان تحت تأكيدك المباشر.`,
      responseType: 'TEXT'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  // Contextual chips based on the screen user is currently on
  const getContextualChips = () => {
    switch (currentScreen) {
      case 'pos':
        return ['كيف أعمل خصم؟', 'مبيعات اليوم', 'رصيد الصندوق', 'النواقص'];
      case 'inventory':
        return ['كيف أضيف صنف جديد؟', 'النواقص', 'الأصناف قريبة الانتهاء', 'كيف أعمل جرد؟'];
      case 'purchases':
        return ['كيف أسجل فاتورة مشتريات؟', 'رصيد الموردين', 'رصيد الصندوق'];
      case 'more':
        return ['رصيد الصندوق', 'سجل مصروف 2000 ريال صيانة', 'كيف أفتح أو أغلق الوردية؟'];
      default:
        return ['كيف أضيف صنف جديد؟', 'رصيد الصندوق', 'مبيعات اليوم', 'النواقص'];
    }
  };

  const getScreenDisplayName = (screen: string) => {
    switch (screen) {
      case 'pos':
        return 'نقطة البيع (POS)';
      case 'inventory':
        return 'الأصناف والمخزون';
      case 'purchases':
        return 'المشتريات والتوريد';
      case 'more':
        return 'الصناديق والتقارير';
      default:
        return 'الرئيسية';
    }
  };

  const context: AssistantContext = {
    currentUser,
    currentScreen,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    navigateTo: (screen, section) => {
      onNavigate(screen, section);
      onCloseModal();
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query || isProcessing) return;

    setInputText('');

    // Add user message
    const userMsg: AssistantMessage = {
      id: 'user-' + Date.now(),
      sender: 'user',
      timestamp: Date.now(),
      text: query
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const response = await AssistantOrchestrator.processMessage(query, context, messages);
      setMessages((prev) => [...prev, response]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          sender: 'assistant',
          timestamp: Date.now(),
          text: `عذراً، حدث خطأ أثناء معالجة الطلب: ${err.message}`,
          responseType: 'ERROR',
          data: { errorReason: err.message, canRetry: true, originalQuery: query }
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmAction = async (operationKey: string) => {
    setIsProcessing(true);
    try {
      const response = await AssistantOrchestrator.confirmAction(operationKey, context);
      setMessages((prev) => [...prev, response]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelAction = (operationKey: string) => {
    const response = AssistantOrchestrator.cancelAction(operationKey);
    setMessages((prev) => [...prev, response]);
  };

  const handleAmbiguitySelect = async (choice: AmbiguityChoice) => {
    // If choice is for product stock, inquire about that product
    if (choice.params?.productName) {
      await handleSendMessage(`كم مخزون ${choice.params.productName}`);
    } else if (choice.params?.productId) {
      await handleSendMessage(`ابحث عن ${choice.title}`);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome-reset',
        sender: 'assistant',
        timestamp: Date.now(),
        text: 'تم مسح المحادثة. كيف يمكنني مساعدتك الآن؟',
        responseType: 'TEXT'
      }
    ]);
  };

  return (
    <div className="flex flex-col h-[520px] max-h-[70vh] text-slate-800">
      {/* Copilot Header Context Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-indigo-50/60 border-b border-indigo-100 rounded-xl mb-3 text-2xs">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="font-bold text-indigo-950">
            {context.isOnline ? 'مساعد متصل' : 'يعمل محلياً (Offline)'}
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600">
            السياق: <strong className="text-indigo-900">{getScreenDisplayName(currentScreen)}</strong>
          </span>
        </div>

        <button
          type="button"
          onClick={handleClearHistory}
          className="text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
          title="مسح المحادثة"
        >
          <RefreshCw className="w-3 h-3" />
          <span>مسح</span>
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-3 px-1 pr-2 pb-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} transition-all`}
          >
            {msg.sender === 'user' ? (
              <div className="bg-indigo-600 text-white font-medium text-xs px-3.5 py-2.5 rounded-2xl rounded-br-xs max-w-[85%] sm:max-w-[75%] shadow-xs">
                {msg.text}
              </div>
            ) : (
              <div className="w-full max-w-[95%] space-y-2">
                {/* Text Bubble */}
                {msg.text && (
                  <div className="bg-slate-100/90 text-slate-800 text-xs px-3.5 py-2.5 rounded-2xl rounded-bl-xs leading-relaxed border border-slate-200/60 whitespace-pre-line">
                    {msg.text}
                  </div>
                )}

                {/* Structured Guide Card */}
                {msg.responseType === 'GUIDE' && msg.data?.guide && (
                  <GuideCard
                    guide={msg.data.guide}
                    onNavigate={(screen, sec) => context.navigateTo(screen, sec)}
                  />
                )}

                {/* Single Product Card */}
                {msg.responseType === 'PRODUCT_CARD' && msg.data?.product && (
                  <ProductCardView product={msg.data.product} />
                )}

                {/* Multiple Products List */}
                {msg.responseType === 'PRODUCT_LIST' && msg.data?.products && (
                  <div className="space-y-2 my-2">
                    {msg.data.products.map((prod) => (
                      <ProductCardView key={prod.id} product={prod} />
                    ))}
                  </div>
                )}

                {/* Balance Card */}
                {msg.responseType === 'BALANCE_CARD' && msg.data?.balance && (
                  <BalanceCardView card={msg.data.balance} />
                )}

                {/* Report Card */}
                {msg.responseType === 'REPORT_CARD' && msg.data?.report && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 my-2 text-slate-800 shadow-xs space-y-3">
                    <h4 className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-2">
                      {msg.data.report.title}
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-2xs">
                      {msg.data.report.metrics.map((m, i) => (
                        <div key={i} className="bg-white p-2 rounded-xl border border-slate-100 shadow-2xs">
                          <span className="text-slate-500 block">{m.label}</span>
                          <span className="font-bold text-slate-900 text-xs">{m.value}</span>
                        </div>
                      ))}
                    </div>
                    {msg.data.report.summaryNotes && (
                      <p className="text-2xs text-slate-500 pt-1 border-t border-slate-100">
                        {msg.data.report.summaryNotes}
                      </p>
                    )}
                  </div>
                )}

                {/* Structured Confirmation Card */}
                {msg.responseType === 'CONFIRMATION' && msg.data?.confirmation && (
                  <ConfirmationCard
                    confirmation={msg.data.confirmation}
                    onConfirm={handleConfirmAction}
                    onCancel={handleCancelAction}
                  />
                )}

                {/* Action Result Success */}
                {msg.responseType === 'ACTION_RESULT' && msg.data?.actionResult && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 my-2 text-emerald-900 text-xs flex items-start gap-2.5 shadow-2xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h5 className="font-bold">{msg.data.actionResult.actionName} - تم بنجاح!</h5>
                      <p className="text-2xs text-emerald-800 mt-1 leading-normal">
                        {msg.data.actionResult.message}
                      </p>
                    </div>
                  </div>
                )}

                {/* Ambiguity Selection Card */}
                {msg.responseType === 'AMBIGUITY' && msg.data?.ambiguity && (
                  <div className="space-y-1.5 my-2">
                    {msg.data.ambiguity.choices.map((choice) => (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => handleAmbiguitySelect(choice)}
                        className="w-full text-right p-2.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all shadow-2xs flex items-center justify-between group"
                      >
                        <div>
                          <span className="text-xs font-bold text-slate-900 block group-hover:text-indigo-900">
                            {choice.title}
                          </span>
                          <span className="text-2xs text-slate-500 block mt-0.5">
                            {choice.description}
                          </span>
                        </div>
                        <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-transform group-hover:-translate-x-1" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Error Card with Retry Button */}
                {msg.responseType === 'ERROR' && (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 my-2 text-rose-900 text-xs flex flex-col gap-2 shadow-2xs">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="text-2xs font-medium leading-relaxed">
                        {msg.data?.errorReason || msg.text}
                      </div>
                    </div>
                    {msg.data?.canRetry && msg.data?.originalQuery && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => handleSendMessage(msg.data.originalQuery)}
                          disabled={isProcessing}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-2xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>إعادة المحاولة</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {isProcessing && (
          <div className="flex items-center gap-2 text-indigo-700 text-2xs py-2 px-3 bg-indigo-50/80 border border-indigo-100 rounded-xl w-fit shadow-2xs animate-pulse">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
            <span className="font-semibold">جاري التفكير والتواصل مع المساعد الصيدلاني الذكي...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Contextual Quick Prompt Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-2 px-1 scrollbar-none">
        {getContextualChips().map((chip, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendMessage(chip)}
            className="shrink-0 text-2xs font-bold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200/80 px-2.5 py-1.5 rounded-full transition-all active:scale-95 shadow-2xs"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <div className="pt-2 border-t border-slate-100">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="اسأل المساعد أو اكتب طلباً (مثال: كيف أضيف صنف، ما رصيد الصندوق...)"
            className="flex-1 py-2.5 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isProcessing}
            className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
          >
            <span>إرسال</span>
            <Send className="w-3.5 h-3.5 rotate-180" />
          </button>
        </form>
      </div>
    </div>
  );
};
