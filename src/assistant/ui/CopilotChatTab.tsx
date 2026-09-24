// Copilot Chat Tab Component for Smart Pharmacy Copilot (Phase 9)
// Multi-turn Gemini Chatbot with Role-based System Instructions and Model Selection
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
  ChevronLeft,
  Stethoscope,
  Boxes,
  DollarSign,
  Zap,
  Copy,
  Check,
  Activity,
  Cpu
} from 'lucide-react';
import {
  AssistantMessage,
  AssistantContext,
  AmbiguityChoice,
  ChatbotRole,
  GeminiChatModel
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
  onOpenMoreTools?: () => void;
}

interface RoleConfig {
  id: ChatbotRole;
  title: string;
  shortTitle: string;
  icon: React.ComponentType<{ className?: string }>;
  recommendedModel: GeminiChatModel;
  description: string;
  colorClass: string;
  badgeBg: string;
  chips: string[];
}

const ROLES_CONFIG: Record<ChatbotRole, RoleConfig> = {
  general: {
    id: 'general',
    title: 'المساعد الشامل للنظام',
    shortTitle: 'شامل',
    icon: Bot,
    recommendedModel: 'gemini-3.5-flash',
    description: 'مساعد عام لإدارة شاشات الصيدلية والاستفسارات التشغيلية والأدلة',
    colorClass: 'text-indigo-700 border-indigo-200 bg-indigo-50/80',
    badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    chips: ['كيف أعمل خصم في POS؟', 'مبيعات اليوم', 'رصيد الصندوق', 'كيف أضيف صنف جديد؟', 'النواقص']
  },
  clinical: {
    id: 'clinical',
    title: 'مستشار صيدلي سريري',
    shortTitle: 'صيدلي سريري',
    icon: Stethoscope,
    recommendedModel: 'gemini-3.1-pro-preview',
    description: 'تحليل سريري متعمق: التداخلات الدوائية، حساب الجرعات، والبدائل وموانع الاستعمال',
    colorClass: 'text-emerald-700 border-emerald-200 bg-emerald-50/80',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    chips: [
      'فحص تعارض أسبرين مع وارفارين',
      'بدائل أوجمنتين 1 جم المتوفرة',
      'جرعة باراسيتامول شراب لطفل 15 كجم',
      'موانع استعمال إيبوبروفين لمريض ربو أو قرحة'
    ]
  },
  inventory: {
    id: 'inventory',
    title: 'مستشار إدارة المخزون',
    shortTitle: 'مخزون وFEFO',
    icon: Boxes,
    recommendedModel: 'gemini-3.5-flash',
    description: 'سياسة الصرف FEFO، تقليل هدر الصلاحيات، وإدارة التشغيلات ونقاط إعادة الطلب',
    colorClass: 'text-amber-700 border-amber-200 bg-amber-50/80',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
    chips: [
      'كيف أطبق سياسة FEFO بصرامة؟',
      'الأصناف قريبة الانتهاء',
      'نصائح جرد المخزون ومعالجة الفروقات',
      'كيف أحدد كمية إعادة الطلب المثالية؟'
    ]
  },
  finance: {
    id: 'finance',
    title: 'المستشار المالي ومحاسب الصيدلية',
    shortTitle: 'محاسبة ومالية',
    icon: DollarSign,
    recommendedModel: 'gemini-3.5-flash',
    description: 'تدقيق حركات الصناديق، تكلفة المبيعات COGS، وهوامش الربح وديون العملاء',
    colorClass: 'text-blue-700 border-blue-200 bg-blue-50/80',
    badgeBg: 'bg-blue-100 text-blue-800 border-blue-200',
    chips: [
      'طريقة مطابقة وتدقيق رصيد الصندوق',
      'كيفية حساب تكلفة المبيعات COGS؟',
      'خطوات إقفال وردية الكاشير',
      'متابعة مديونيات العملاء المتأخرة'
    ]
  },
  fast: {
    id: 'fast',
    title: 'المساعد السريع لكاونتر البيع',
    shortTitle: 'مساعد سريع',
    icon: Zap,
    recommendedModel: 'gemini-3.1-flash-lite',
    description: 'إجابات فورية وموجزة جداً لضغط كاونتر المبيعات ونقطة البيع POS',
    colorClass: 'text-purple-700 border-purple-200 bg-purple-50/80',
    badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
    chips: [
      'جرعة بنادول الاعتيادية للبالغين',
      'أفضل وقت لتناول دواء أوميبرازول',
      'الفرق بين باراسيتامول وإيبوبروفين',
      'هل يؤخذ المضاد الحيوي قبل أم بعد الأكل؟'
    ]
  }
};

const MODELS_CONFIG: Record<GeminiChatModel, { name: string; label: string; tag: string; icon: string }> = {
  'gemini-3-flash-preview': {
    name: 'gemini-3-flash-preview',
    label: 'مستقر وسريع (Flash Preview)',
    tag: '⚡ مستقر',
    icon: '⚡'
  },
  'gemini-3.1-flash-lite': {
    name: 'gemini-3.1-flash-lite',
    label: 'فائق السرعة (Flash Lite)',
    tag: '⚡ سريع',
    icon: '⚡'
  },
  'gemini-3.5-flash': {
    name: 'gemini-3.5-flash',
    label: 'متوازن وعام (Flash 3.5)',
    tag: '🎯 عام',
    icon: '🎯'
  },
  'gemini-3.1-pro-preview': {
    name: 'gemini-3.1-pro-preview',
    label: 'تحليل معقد (Pro Preview)',
    tag: '🧠 معقد',
    icon: '🧠'
  }
};

export const CopilotChatTab: React.FC<CopilotChatTabProps> = ({
  currentUser,
  currentScreen,
  onNavigate,
  onCloseModal,
  onOpenMoreTools
}) => {
  const [selectedRole, setSelectedRole] = useState<ChatbotRole>('general');
  const [selectedModel, setSelectedModel] = useState<GeminiChatModel>('gemini-3-flash-preview');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      timestamp: Date.now(),
      text: `مرحباً بك دكتور ${currentUser.full_name || currentUser.username}. أنا مساعد الصيدلية الذكي (Smart Pharmacy Copilot).\n\nأفهم بنية التطبيق وصلاحياتك الحالية (${currentUser.role_id === 'admin' ? 'مدير النظام' : 'صيدلي'}). يمكنك سؤالي عن طريقة استخدام أي شاشة، أو الاستفسار عن الأرصدة والمخزون، أو التبديل بين الأدوار المتخصصة (سريري، مخزني، مالي، سريع) أعلاه للإجابة على استفساراتك بدقة.`,
      responseType: 'TEXT',
      role: 'general',
      model: 'gemini-3-flash-preview'
    }
  ]);

  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiStatus, setAiStatus] = useState<{
    configured: boolean;
    provider: string;
    model: string;
    reachable: boolean;
    errorCode?: string;
    lastError: string | null;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/assistant/status')
      .then((r) => r.json())
      .then((data) => setAiStatus(data))
      .catch(() => {
        setAiStatus({
          configured: false,
          provider: 'google-gemini',
          model: 'gemini-3.8-flash',
          reachable: false,
          lastError: 'تعذر الاتصال بخادم التطبيق.'
        });
      });
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  const handleRoleSelect = (role: ChatbotRole) => {
    setSelectedRole(role);
    // Auto-switch to recommended model for the selected role
    const config = ROLES_CONFIG[role];
    if (config?.recommendedModel) {
      setSelectedModel(config.recommendedModel);
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
      text: query,
      role: selectedRole
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const response = await AssistantOrchestrator.processMessage(
        query,
        context,
        messages,
        { model: selectedModel, role: selectedRole }
      );
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
          role: selectedRole,
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
        text: `تم مسح المحادثة السابقة. دور المساعد الحالي: (${ROLES_CONFIG[selectedRole].title}). كيف يمكنني مساعدتك الآن؟`,
        responseType: 'TEXT',
        role: selectedRole,
        model: selectedModel
      }
    ]);
  };

  const copyToClipboard = (text: string, id: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      });
    }
  };

  const activeRoleConfig = ROLES_CONFIG[selectedRole];

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900">
      {/* Top Compact Header: AI Status + Role Switcher + Model + Clear History */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-2xs shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="flex h-2 w-2 relative shrink-0">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                aiStatus?.configured && aiStatus?.reachable ? 'bg-emerald-400' : 'bg-amber-400'
              } opacity-75`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                aiStatus?.configured && aiStatus?.reachable ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          </span>
          <span className="font-bold text-slate-700 dark:text-slate-300 truncate">
            {activeRoleConfig.title}
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as GeminiChatModel)}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 focus:outline-none"
            title="اختيار نموذج Gemini"
          >
            <option value="gemini-3-flash-preview">⚡ Flash (سريع)</option>
            <option value="gemini-3.1-flash-lite">⚡ Flash-Lite</option>
            <option value="gemini-3.5-flash">🎯 Flash 3.5</option>
            <option value="gemini-3.1-pro-preview">🧠 Pro (سريري)</option>
          </select>
        </div>

        <button
          type="button"
          onClick={handleClearHistory}
          className="text-slate-400 hover:text-rose-600 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 shrink-0"
          title="مسح سجل المحادثة"
        >
          <RefreshCw className="w-3 h-3" />
          <span className="hidden sm:inline">مسح</span>
        </button>
      </div>

      {/* Unconfigured Provider Notice Banner */}
      {aiStatus && !aiStatus.configured && (
        <div className="bg-amber-50/90 dark:bg-amber-950/40 border-b border-amber-200/80 dark:border-amber-900/60 px-3 py-1.5 text-2xs text-amber-900 dark:text-amber-200 flex items-center gap-2 shrink-0">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="truncate">المساعد الذكي غير مُهيأ بعد للذكاء السحابي (GEMINI_API_KEY). يعمل حالياً بالوضع المحلي وقواعد البيانات.</span>
        </div>
      )}

      {/* Response Scroll Area: Absolute Priority (flex: 1; min-height: 0; overflow-y: auto) */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 px-3 py-3 scrollbar-thin">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} transition-all`}
          >
            {msg.sender === 'user' ? (
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-medium text-xs px-3.5 py-2.5 rounded-2xl rounded-br-xs max-w-[85%] sm:max-w-[75%] shadow-xs leading-relaxed">
                {msg.text}
              </div>
            ) : (
              <div className="w-full max-w-[95%] space-y-2">
                {/* Assistant Message Container */}
                <div className="bg-white border border-slate-200/80 rounded-2xl rounded-bl-xs p-3 shadow-2xs">
                  {/* Message Meta Header: Role Badge + Model Tag + Copy Button */}
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 text-2xs">
                    <div className="flex items-center gap-1.5">
                      <span className="p-1 rounded-md bg-indigo-50 text-indigo-700">
                        <Bot className="w-3.5 h-3.5" />
                      </span>
                      <span className="font-bold text-slate-800">
                        {ROLES_CONFIG[(msg.role as ChatbotRole) || selectedRole]?.title || 'المساعد الذكي'}
                      </span>
                      {msg.model && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                          {msg.model}
                        </span>
                      )}
                      {msg.latencyMs && (
                        <span className="text-slate-400 text-[10px]">({msg.latencyMs}ms)</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => copyToClipboard(msg.text, msg.id)}
                      className="text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-slate-100"
                      title="نسخ نص الإجابة"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-600 text-[10px]">تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span className="text-[10px]">نسخ</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Text Content */}
                  {msg.text && (
                    <div className="text-slate-800 text-xs leading-relaxed whitespace-pre-line font-normal">
                      {msg.text}
                    </div>
                  )}
                </div>

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
            <span className="font-semibold">
              جاري التفكير والتواصل مع {activeRoleConfig.title} ({MODELS_CONFIG[selectedModel].tag})...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Android-First Quick Actions Bar (Core 6 + More) */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-2 px-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 scrollbar-none shrink-0">
        <button
          type="button"
          onClick={() => handleSendMessage('ابحث عن دواء في الصيدلية')}
          className="shrink-0 text-[11px] font-bold bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 px-2.5 py-1.5 rounded-full transition-all active:scale-95 shadow-2xs flex items-center gap-1"
        >
          <span>🔎</span>
          <span>بحث عن دواء</span>
        </button>

        <button
          type="button"
          onClick={() => handleSendMessage('ما هي معلومات الصنف والجرعات المعتادة؟')}
          className="shrink-0 text-[11px] font-bold bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 px-2.5 py-1.5 rounded-full transition-all active:scale-95 shadow-2xs flex items-center gap-1"
        >
          <span>💊</span>
          <span>معلومات الصنف</span>
        </button>

        <button
          type="button"
          onClick={() => handleSendMessage('ما هي الأصناف التي أوشكت على النفاد في المخزون؟')}
          className="shrink-0 text-[11px] font-bold bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-slate-700 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80 px-2.5 py-1.5 rounded-full transition-all active:scale-95 shadow-2xs flex items-center gap-1"
        >
          <span>📦</span>
          <span>نقص المخزون</span>
        </button>

        <button
          type="button"
          onClick={() => handleSendMessage('اقترح بدائل للأدوية الشائعة الناقصة')}
          className="shrink-0 text-[11px] font-bold bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 px-2.5 py-1.5 rounded-full transition-all active:scale-95 shadow-2xs flex items-center gap-1"
        >
          <span>🔄</span>
          <span>بدائل / أصناف مشابهة</span>
        </button>

        <button
          type="button"
          onClick={() => handleSendMessage('استعلم عن آخر فواتير المبيعات المسجلة اليوم')}
          className="shrink-0 text-[11px] font-bold bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80 px-2.5 py-1.5 rounded-full transition-all active:scale-95 shadow-2xs flex items-center gap-1"
        >
          <span>🧾</span>
          <span>استعلام فاتورة</span>
        </button>

        <button
          type="button"
          onClick={() => handleSendMessage('تقرير استعلام سريع عن إجمالي المخزون والأرصدة')}
          className="shrink-0 text-[11px] font-bold bg-white dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-slate-700 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80 px-2.5 py-1.5 rounded-full transition-all active:scale-95 shadow-2xs flex items-center gap-1"
        >
          <span>📊</span>
          <span>استعلام مخزون</span>
        </button>

        {onOpenMoreTools && (
          <button
            type="button"
            onClick={onOpenMoreTools}
            className="shrink-0 text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-800 dark:text-indigo-200 border border-indigo-300/80 dark:border-indigo-700 px-3 py-1.5 rounded-full transition-all active:scale-95 shadow-2xs flex items-center gap-1"
          >
            <span>✨</span>
            <span>المزيد...</span>
          </button>
        )}
      </div>

      {/* Input Bar */}
      <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
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
            placeholder={`اسأل ${activeRoleConfig.title} أو اكتب استفسارك...`}
            className="flex-1 py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition-all"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isProcessing}
            className="py-2 px-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all shrink-0"
          >
            <span>إرسال</span>
            <Send className="w-3.5 h-3.5 rotate-180" />
          </button>
        </form>
      </div>
    </div>
  );
};
