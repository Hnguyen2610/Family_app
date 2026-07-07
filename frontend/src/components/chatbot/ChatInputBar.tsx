import type { ChangeEvent, FormEvent, RefObject } from 'react';
import { FiImage, FiSend, FiX } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AiModelProvider } from './chatbot-usage';

type ChatInputBarProps = {
  fileInputRef: RefObject<HTMLInputElement>;
  input: string;
  isLoading: boolean;
  language: string;
  model: AiModelProvider;
  selectedImage: string | null;
  onCancelStream: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onInputChange: (value: string) => void;
  onRemoveImage: () => void;
  onSubmit: (event: FormEvent) => void;
  onUploadClick: () => void;
};

export function ChatInputBar({
  fileInputRef,
  input,
  isLoading,
  language,
  model,
  selectedImage,
  onCancelStream,
  onFileChange,
  onInputChange,
  onRemoveImage,
  onSubmit,
  onUploadClick,
}: ChatInputBarProps) {
  return (
    <div className="p-4 md:p-5 border-t border-border bg-card relative z-10">
      {selectedImage && (
        <div className="max-w-7xl mx-auto mb-3 md:mb-4 flex items-center gap-3 md:gap-4 animate-in slide-in-from-bottom-2 duration-300">
          <div className="relative w-14 h-14 md:w-20 md:h-20 rounded-xl overflow-hidden border-2 border-primary group">
            <img src={selectedImage} alt="selected" className="w-full h-full object-cover" />
            <button
              onClick={onRemoveImage}
              className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
            >
              <FiX size={20} />
            </button>
          </div>
          <p className="text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-full">
            Image Ready // {model} context
          </p>
        </div>
      )}

      <form onSubmit={onSubmit} className="flex gap-3 md:gap-4 max-w-7xl mx-auto">
        <div className="flex-1 relative group flex items-center gap-2 min-w-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileChange}
            accept="image/*"
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            onClick={onUploadClick}
            disabled={isLoading}
            className="w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-white/5 text-slate-500 hover:text-primary transition-all shrink-0"
          >
            <FiImage size={20} />
          </Button>
          <div className="flex-1 relative min-w-0">
            <Input
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              className="pr-16 h-12"
              disabled={isLoading}
              placeholder={language === 'vi' ? 'Hỏi AI bất cứ điều gì...' : 'Message AI...'}
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2">
              {isLoading ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={onCancelStream}
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                >
                  <FiX />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={(!input.trim() && !selectedImage)}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                    (input.trim() || selectedImage)
                      ? 'shadow-md active:scale-95'
                      : ''
                  }`}
                >
                  <FiSend />
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
