import React, { useState } from 'react';
import { X, Calendar, Clock, AlignLeft, Type, MessageSquare } from 'lucide-react';
import { Reminder } from '../types';

interface Props {
  onClose: () => void;
  onSave: (reminder: Reminder) => void;
  initialType?: 'reminder' | 'note';
  context?: string;
}

export default function ReminderModal({ onClose, onSave, initialType = 'reminder', context }: Props) {
  const [type, setType] = useState<'reminder' | 'note'>(initialType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newReminder: Reminder = {
      id: `REM_${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      date: date || new Date().toISOString().split('T')[0],
      completed: false,
      createdAt: Date.now(),
      type: type,
      context: context,
    };

    onSave(newReminder);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[10000] animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex bg-slate-200/50 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setType('reminder')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                type === 'reminder' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Calendar size={16} /> Reminder
            </button>
            <button
              type="button"
              onClick={() => setType('note')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                type === 'note' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <MessageSquare size={16} /> Note
            </button>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {context && (
            <div className="bg-indigo-50 text-indigo-700 text-xs px-3 py-2 rounded-lg border border-indigo-100 flex items-center gap-2">
              <span className="font-semibold">Context:</span> {context}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
              <Type size={14} className="text-slate-400" /> {type === 'note' ? 'Note Title' : 'Title'}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              placeholder={type === 'note' ? "e.g., Student behavior observation..." : "e.g., Grade midterms, Email parents..."}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
              <AlignLeft size={14} className="text-slate-400" /> {type === 'note' ? 'Note Content' : 'Description (Optional)'}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
              placeholder="Add more details here..."
              rows={4}
            />
          </div>

          {type === 'reminder' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                <Clock size={14} className="text-slate-400" /> Date (Optional)
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              Save {type === 'note' ? 'Note' : 'Reminder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
