import { useState, type RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { FiActivity, FiCalendar, FiCheck, FiFlag, FiThumbsDown, FiThumbsUp, FiTrendingUp, FiUser, FiX } from 'react-icons/fi';
import MascotAvatar from '@/components/MascotAvatar';
import type { AiFeedbackValue } from '@/lib/api-client';
import { FEEDBACK_OPTIONS, type Message } from './chatbot-types';
import { getStatusLabel } from './chatbot-usage';

function cleanMarkdownText(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // Fix single-line table breaks where rows are joined with || or | |
  cleaned = cleaned.replace(/\|\s*\|\s*\|/g, '|\n|');
  cleaned = cleaned.replace(/\|\s*\|\s*(?=\|)/g, '|\n');
  cleaned = cleaned.replace(/\|\s*\|\s*(?=[A-Za-z0-9À-ỹ]+)/g, '|\n');

  // Ensure newline after Markdown table header divider e.g. "| --- | --- |\n"
  cleaned = cleaned.replace(/(\|-{2,}[\s\S]*?\|)\s*(\|)/g, '$1\n$2');

  // Replace <br> with \n ONLY outside of table rows so table cells don't break across lines
  const lines = cleaned.split('\n');
  const processedLines = lines.map((line) => {
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      return line.replace(/<br\s*\/?>/gi, '<br />');
    }
    return line.replace(/<br\s*\/?>/gi, '\n');
  });

  return processedLines.join('\n');
}

function MessageContent({ content, role, language }: { content: string; role: string; language: string }) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (role !== 'assistant') {
    return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{cleanMarkdownText(content)}</ReactMarkdown>;
  }

  // Globally extract all closed <thought>...</thought> blocks
  const regex = /<thought>([\s\S]*?)<\/thought>/g;
  let match;
  const thoughts: string[] = [];

  while ((match = regex.exec(content)) !== null) {
    thoughts.push(match[1].trim());
  }

  let restText = content.replace(/<thought>[\s\S]*?<\/thought>/g, '').trim();
  let thoughtText = thoughts.join('\n\n').trim();

  // Handle unclosed thought block (especially for real-time streaming)
  if (restText.includes('<thought>')) {
    const startIdx = restText.indexOf('<thought>');
    const unclosedThought = restText.substring(startIdx + 9).trim();
    restText = restText.substring(0, startIdx).trim();

    if (thoughtText) {
      thoughtText += '\n\n' + unclosedThought;
    } else {
      thoughtText = unclosedThought;
    }
  }

  // Smart Fallback: If LLM omitted literal <thought> tags but wrote 'Phân tích yêu cầu:',
  // extract that paragraph into thoughtText so it displays inside the AI Reasoning box!
  if (!thoughtText && /^Phân tích (yêu cầu|câu hỏi|dữ liệu):/i.test(restText)) {
    const doubleNewlineIdx = restText.indexOf('\n\n');
    if (doubleNewlineIdx !== -1) {
      thoughtText = restText.substring(0, doubleNewlineIdx).trim();
      restText = restText.substring(doubleNewlineIdx).trim();
    }
  }

  if (!thoughtText) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{cleanMarkdownText(content)}</ReactMarkdown>;
  }

  const isVi = language === 'vi';

  return (
    <div className="space-y-3">
      {thoughtText && (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 overflow-hidden">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-slate-500 hover:text-primary transition-colors hover:bg-slate-100/30 dark:hover:bg-slate-900/40"
          >
            <div className="flex items-center gap-2">
              <FiActivity className="text-primary animate-pulse" />
              <span>{isVi ? 'Suy luận của Trợ lý AI' : 'AI Reasoning thought process'}</span>
            </div>
            <span className="text-[10px] text-slate-400">
              {isExpanded ? (isVi ? 'Thu gọn' : 'Collapse') : (isVi ? 'Xem chi tiết' : 'Expand')}
            </span>
          </button>
          {isExpanded && (
            <div className="px-3.5 pb-3 pt-1 text-slate-500 dark:text-slate-400 text-xs border-t border-slate-200/40 dark:border-slate-800/40 bg-white/30 dark:bg-slate-950/20 whitespace-pre-line leading-relaxed font-normal">
              {thoughtText}
            </div>
          )}
        </div>
      )}
      {restText ? <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{cleanMarkdownText(restText)}</ReactMarkdown> : null}
    </div>
  );
}

function ProposalDiffDetail({ proposal, language }: { proposal: any; language: string }) {
  const isVi = language === 'vi';
  const { before, after, riskLevel, action } = proposal;

  const getRiskBadge = () => {
    if (action === 'delete_event' || riskLevel === 'high') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 text-xs font-bold text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40">
          ⚠️ {isVi ? 'Xóa dữ liệu / Rủi ro cao' : 'Destructive / High risk'}
        </span>
      );
    }
    if (riskLevel === 'medium') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40">
          ✏️ {isVi ? 'Thay đổi dữ liệu' : 'Data modification'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40">
        ✨ {isVi ? 'Thêm mới' : 'Create new'}
      </span>
    );
  };

  const renderFieldDiff = (label: string, beforeVal: any, afterVal: any) => {
    const hasChange = beforeVal !== afterVal;
    if (!beforeVal && !afterVal) return null;
    return (
      <div className="grid grid-cols-3 gap-2 text-xs py-1 border-b border-black/5 dark:border-white/5 last:border-b-0">
        <span className="text-slate-400 font-semibold">{label}</span>
        {hasChange ? (
          <>
            <span className="text-slate-400 line-through truncate">{String(beforeVal || '-')}</span>
            <span className="text-slate-800 dark:text-slate-200 font-bold truncate">➡️ {String(afterVal || '-')}</span>
          </>
        ) : (
          <span className="col-span-2 text-slate-700 dark:text-slate-350 truncate">{String(beforeVal || '-')}</span>
        )}
      </div>
    );
  };

  if (before && after) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-slate-800/40 space-y-2">
        <div className="flex items-center justify-between pb-1.5 border-b border-black/5 dark:border-white/5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{isVi ? 'So sánh thay đổi' : 'Changes comparison'}</span>
          {getRiskBadge()}
        </div>
        {renderFieldDiff(isVi ? 'Tiêu đề' : 'Title', before.title, after.title)}
        {renderFieldDiff(isVi ? 'Ngày' : 'Date', before.date, after.date)}
        {renderFieldDiff(isVi ? 'Giờ' : 'Time', before.time, after.time)}
        {renderFieldDiff(isVi ? 'Phạm vi' : 'Scope', before.scope, after.scope)}
        {renderFieldDiff(isVi ? 'Ghi chú' : 'Description', before.description, after.description)}
      </div>
    );
  }

  if (before) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-rose-50/25 dark:bg-rose-950/15 border border-rose-200/45 dark:border-rose-900/35 space-y-2">
        <div className="flex items-center justify-between pb-1.5 border-b border-rose-100/30 dark:border-rose-900/20">
          <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">{isVi ? 'Dữ liệu sẽ xóa' : 'Data to delete'}</span>
          {getRiskBadge()}
        </div>
        <div className="space-y-1 text-xs">
          {before.title && <div className="text-slate-700 dark:text-slate-350 font-semibold line-through">❌ {before.title}</div>}
          {before.date && <div className="text-slate-400">{isVi ? 'Ngày: ' : 'Date: '}{before.date}</div>}
          {before.time && <div className="text-slate-400">{isVi ? 'Giờ: ' : 'Time: '}{before.time}</div>}
          {before.scope && <div className="text-slate-400">{isVi ? 'Phạm vi: ' : 'Scope: '}{before.scope}</div>}
        </div>
      </div>
    );
  }

  if (after) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-emerald-50/25 dark:bg-emerald-950/15 border border-emerald-200/45 dark:border-emerald-900/35 space-y-2">
        <div className="flex items-center justify-between pb-1.5 border-b border-emerald-100/30 dark:border-emerald-900/20">
          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">{isVi ? 'Chi tiết tạo mới' : 'New details'}</span>
          {getRiskBadge()}
        </div>
        <div className="space-y-1 text-xs">
          {after.title && <div className="text-slate-800 dark:text-slate-200 font-bold">✨ {after.title}</div>}
          {after.date && <div className="text-slate-600 dark:text-slate-400">{isVi ? 'Ngày: ' : 'Date: '}{after.date}</div>}
          {after.time && <div className="text-slate-600 dark:text-slate-400">{isVi ? 'Giờ: ' : 'Time: '}{after.time}</div>}
          {after.scope && <div className="text-slate-600 dark:text-slate-400">{isVi ? 'Phạm vi: ' : 'Scope: '}{after.scope}</div>}
        </div>
      </div>
    );
  }

  return null;
}

type ChatMessageListProps = {
  isLoading: boolean;
  language: string;
  messages: Message[];
  scrollContainerRef: RefObject<HTMLDivElement>;
  streamStatus: string;
  onFeedback: (messageIndex: number, value: AiFeedbackValue) => void;
  onProposalAction: (messageIndex: number, action: 'confirm' | 'reject') => void;
  onSetInput: (input: string) => void;
};

function getFeedbackIcon(icon: 'up' | 'down' | 'flag') {
  if (icon === 'up') return <FiThumbsUp size={12} />;
  if (icon === 'down') return <FiThumbsDown size={12} />;
  return <FiFlag size={12} />;
}

export function ChatMessageList({
  isLoading,
  language,
  messages,
  scrollContainerRef,
  streamStatus,
  onFeedback,
  onProposalAction,
  onSetInput,
}: ChatMessageListProps) {
  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto p-4 md:p-8 xl:px-12 space-y-6 md:space-y-10 no-scrollbar"
    >
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-start md:justify-center text-center space-y-5 md:space-y-8 pt-3 md:pt-0">
          <div className="hidden sm:flex shrink-0 items-center justify-center">
            <MascotAvatar size="lg" isWaving={true} showBubble={false} />
          </div>
          <div className="max-w-md space-y-3 md:space-y-4">
            <h3 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {language === 'vi' ? 'AI đã sẵn sàng.' : 'AI is ready.'}
            </h3>
            <p className="text-slate-500 dark:text-slate-500 font-medium text-xs md:text-sm leading-relaxed">
              {language === 'vi'
                ? 'Hỏi lịch, sổ tay gia đình, món ăn hoặc nhờ tạo sự kiện bằng ngôn ngữ tự nhiên.'
                : 'Ask about calendar, family notes, meals, or create events in natural language.'}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 w-full max-w-lg px-1 md:px-4 pt-1 md:pt-4">
            {[
              { text: language === 'vi' ? 'Kiểm tra lịch tuần tới' : 'Audit next week schedule', icon: <FiCalendar /> },
              { text: language === 'vi' ? 'Đề xuất hôm nay ăn gì' : 'Nutrition plan analysis', icon: <FiTrendingUp /> },
            ].map((hint, index) => (
              <button
                key={index}
                onClick={() => onSetInput(hint.text)}
                className="p-3 md:p-5 text-left rounded-xl bg-white dark:bg-slate-900/40 border border-black/5 dark:border-white/5 hover:border-primary/20 transition-all text-[11px] font-bold text-slate-600 dark:text-slate-400 group flex items-center gap-3 shadow-sm"
              >
                <span className="text-primary group-hover:scale-110 transition-transform">{hint.icon}</span>
                {hint.text}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {messages.map((message, index) => (
            (message.content || message.role === 'user') && (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-300`}
              >
                <div className={`flex gap-3 md:gap-5 max-w-[96%] md:max-w-[92%] xl:max-w-[88%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {message.role === 'user' ? (
                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl shrink-0 flex items-center justify-center border bg-primary border-primary/20 text-primary-foreground">
                      <FiUser size={16} />
                    </div>
                  ) : (
                    <div className="shrink-0 flex items-center justify-center">
                      <MascotAvatar size="sm" isWaving={false} showBubble={false} />
                    </div>
                  )}
                  <div
                    className={`p-4 md:p-5 rounded-2xl text-sm leading-relaxed border ${
                      message.role === 'user'
                        ? 'bg-primary/15 border-primary/20 text-slate-950 dark:text-slate-100'
                        : 'bg-white dark:bg-slate-900/60 border-black/5 dark:border-white/5 text-slate-900 dark:text-slate-300'
                    }`}
                  >
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-bold prose-headings:text-primary prose-code:bg-slate-950 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-primary font-medium">
                      {message.cached && (
                        <div className="mb-3 inline-flex rounded bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          Cached
                        </div>
                      )}
                      <MessageContent content={message.content} role={message.role} language={language} />
                    </div>
                    {message.role === 'assistant' && message.proposal && (
                      <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-3 space-y-3">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                          {language === 'vi' ? 'Cần xác nhận' : 'Requires Confirmation'}
                        </div>
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {message.proposal.summary || message.proposal.message || message.proposal.action.replace(/_/g, ' ')}
                        </div>

                        <ProposalDiffDetail proposal={message.proposal} language={language} />

                        {message.proposalStatus ? (
                          <span className="inline-flex rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                            {message.proposalStatus === 'confirmed' ? (language === 'vi' ? 'Đã xác nhận' : 'Confirmed') : (language === 'vi' ? 'Đã hủy' : 'Declined')}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => onProposalAction(index, 'confirm')}
                              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600"
                            >
                              <FiCheck size={14} />
                              {language === 'vi' ? 'Xác nhận' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => onProposalAction(index, 'reject')}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-rose-200 hover:text-rose-500 dark:border-slate-700 dark:bg-slate-900"
                            >
                              <FiX size={14} />
                              {language === 'vi' ? 'Hủy' : 'Decline'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {message.role === 'assistant' && message.requestLogId && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/5 dark:border-white/5 pt-3">
                        <span className="text-xs font-semibold text-slate-400">
                          Feedback
                        </span>
                        {message.feedback ? (
                          <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            {FEEDBACK_OPTIONS.find((option) => option.value === message.feedback)?.label || message.feedback}
                          </span>
                        ) : (
                          FEEDBACK_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => onFeedback(index, option.value)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-black/5 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1 text-xs font-semibold text-slate-500 hover:border-primary/30 hover:text-primary transition-all"
                            >
                              {getFeedbackIcon(option.icon)}
                              {option.label}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3 md:gap-5">
                <div className="shrink-0 flex items-center justify-center">
                  <MascotAvatar size="sm" isWaving={false} showBubble={false} />
                </div>
                <div className="bg-white dark:bg-slate-900/40 p-4 md:p-6 rounded-2xl border border-black/5 dark:border-white/5">
                  <div className="mb-3 text-xs font-semibold text-primary">
                    {streamStatus || getStatusLabel('', language)}
                  </div>
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((n) => (
                      <div key={n} className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: `${n * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
