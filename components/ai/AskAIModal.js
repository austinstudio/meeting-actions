import React, { useState, useEffect, useRef } from 'react';
import { X, Bot, Send, ChevronRight, Clock } from 'lucide-react';

// Compact task card for AI responses (local to this module)
function AITaskCard({ task, meeting, onEdit }) {
  const priorityColors = {
    high: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
    low: 'bg-slate-100 text-slate-600 dark:bg-neutral-700 dark:text-neutral-400',
  };

  const statusColors = {
    'uncategorized': 'border-purple-300 dark:border-purple-500/50',
    'todo': 'border-slate-300 dark:border-slate-600',
    'in-progress': 'border-blue-300 dark:border-blue-500/50',
    'waiting': 'border-amber-300 dark:border-amber-500/50',
    'done': 'border-emerald-300 dark:border-emerald-500/50',
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    if (dateOnly < today && task.status !== 'done') return { text: 'Overdue', className: 'text-rose-600 dark:text-rose-400 font-medium' };
    if (dateOnly.getTime() === today.getTime()) return { text: 'Today', className: 'text-amber-600 dark:text-amber-400 font-medium' };
    if (dateOnly.getTime() === tomorrow.getTime()) return { text: 'Tomorrow', className: 'text-blue-600 dark:text-blue-400' };
    return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), className: 'text-slate-500 dark:text-neutral-400' };
  };

  const dueDateInfo = formatDate(task.dueDate);

  return (
    <button
      onClick={onEdit}
      className={`w-full text-left p-3 rounded-lg bg-white dark:bg-neutral-900 border-l-4 ${statusColors[task.status] || statusColors['uncategorized']} border border-slate-200 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600 transition-colors group`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 dark:text-white leading-snug flex-1 group-hover:text-indigo-600 dark:group-hover:text-orange-500 transition-colors">
          {task.task}
        </p>
        <ChevronRight size={14} className="text-slate-300 dark:text-neutral-600 group-hover:text-indigo-500 dark:group-hover:text-orange-500 flex-shrink-0 mt-0.5" />
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className={`text-xs px-1.5 py-0.5 rounded ${priorityColors[task.priority] || priorityColors['medium']}`}>
          {task.priority}
        </span>
        <span className="text-xs text-slate-500 dark:text-neutral-400">
          {task.owner}
        </span>
        <span className={`text-xs flex items-center gap-1 ${dueDateInfo.className}`}>
          <Clock size={10} />
          {dueDateInfo.text}
        </span>
      </div>
      {meeting && (
        <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1.5 truncate">
          From: {meeting.title}
        </p>
      )}
    </button>
  );
}

export default function AskAIModal({ isOpen, onClose, onEditTask, tasks: liveTasks, meetings: liveMeetings }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [referencedTaskIds, setReferencedTaskIds] = useState(new Set());
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const taskMap = {};
  liveTasks?.forEach(t => { taskMap[t.id] = t; });
  const meetingMap = {};
  liveMeetings?.forEach(m => { meetingMap[m.id] = m; });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
    setReferencedTaskIds(new Set());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages.filter(m => !m.tasks)
        })
      });

      const data = await response.json();

      if (data.success) {
        if (data.tasks) {
          setReferencedTaskIds(prev => {
            const updated = new Set(prev);
            data.tasks.forEach(t => updated.add(t.id));
            return updated;
          });
        }

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.response
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.'
        }]);
      }
    } catch (error) {
      console.error('Ask AI error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I couldn\'t connect to the AI service. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderAIResponse = (content) => {
    const parts = content.split(/(\[\[TASK:[\w_]+\]\])/g);

    return (
      <div className="space-y-2">
        {parts.map((part, i) => {
          const taskMatch = part.match(/\[\[TASK:([\w_]+)\]\]/);
          if (taskMatch) {
            const taskId = taskMatch[1];
            const task = taskMap[taskId];
            if (task) {
              return (
                <AITaskCard
                  key={i}
                  task={task}
                  meeting={meetingMap[task.meetingId]}
                  onEdit={() => {
                    onClose();
                    onEditTask(task);
                  }}
                />
              );
            }
            return null;
          }

          if (!part.trim()) return null;

          return (
            <div key={i} className="text-sm">
              {formatAIText(part)}
            </div>
          );
        })}
      </div>
    );
  };

  const formatAIText = (text) => {
    const lines = text.split('\n');

    return lines.map((line, i) => {
      if (!line.trim()) return <br key={i} />;

      let formatted = line;

      const parts = [];
      let lastIndex = 0;
      const boldRegex = /\*\*([^*]+)\*\*/g;
      let match;

      while ((match = boldRegex.exec(formatted)) !== null) {
        if (match.index > lastIndex) {
          parts.push(formatted.slice(lastIndex, match.index));
        }
        parts.push(<strong key={`bold-${i}-${match.index}`} className="font-semibold">{match[1]}</strong>);
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < formatted.length) {
        parts.push(formatted.slice(lastIndex));
      }

      const content = parts.length > 0 ? parts : formatted;

      if (line.trim().startsWith('• ') || line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const bulletContent = line.trim().replace(/^[•\-*]\s*/, '');
        return (
          <div key={i} className="flex gap-2 ml-1">
            <span className="text-indigo-500 dark:text-orange-500">•</span>
            <span>{typeof content === 'string' ? bulletContent : content}</span>
          </div>
        );
      }

      return <p key={i} className="leading-relaxed">{content}</p>;
    });
  };

  const suggestedQuestions = [
    "What's due this week?",
    "What should I prioritize today?",
    "Show me overdue tasks",
    "Summarize my open items"
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl shadow-xl w-full md:max-w-2xl h-[85vh] md:h-[70vh] flex flex-col border border-transparent dark:border-neutral-700">
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-neutral-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 dark:from-orange-500 dark:via-amber-500 dark:to-yellow-500 flex items-center justify-center">
            <Bot size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg text-slate-800 dark:text-white">
              AI Assistant
            </h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400">
              Ask questions about your tasks and meetings
            </p>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={handleNewChat}
                className="px-2 py-1 text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded transition-colors"
              >
                New Chat
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 dark:text-neutral-400 dark:hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
                <Bot size={32} className="text-slate-400 dark:text-neutral-500" />
              </div>
              <h4 className="text-slate-700 dark:text-neutral-200 font-medium mb-2">
                How can I help you?
              </h4>
              <p className="text-sm text-slate-500 dark:text-neutral-400 mb-6 max-w-sm">
                I can answer questions about your tasks, help you find things, and suggest what to prioritize.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {suggestedQuestions.map((question, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(question);
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300 rounded-full hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'user' ? (
                    <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-indigo-600 dark:bg-orange-500 text-white">
                      <div className="text-sm">{msg.content}</div>
                    </div>
                  ) : (
                    <div className="max-w-[90%] rounded-2xl px-4 py-3 bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-neutral-200">
                      {renderAIResponse(msg.content)}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 dark:bg-neutral-800 rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-neutral-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-neutral-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-neutral-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-neutral-800">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your tasks..."
              className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-orange-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-4 py-2.5 bg-indigo-600 dark:bg-orange-500 text-white rounded-xl hover:bg-indigo-700 dark:hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
