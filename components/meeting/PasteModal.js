import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Upload, RefreshCw, Sparkles, File, CheckCircle2, AlertTriangle, Bell } from 'lucide-react';

function ProcessingOverlay({ onProcessInBackground, canNotify }) {
  return (
    <div className="absolute inset-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-xl">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 animate-spin-slow opacity-20 absolute inset-0" />
        <div className="w-20 h-20 rounded-full bg-gradient-to-bl from-indigo-500 via-purple-500 to-pink-500 animate-spin-slow-reverse opacity-20 absolute inset-0" />
        <div className="w-20 h-20 rounded-full bg-white dark:bg-neutral-900 flex items-center justify-center relative">
          <Sparkles className="w-10 h-10 text-indigo-600 dark:text-orange-500 animate-pulse" />
        </div>
      </div>

      <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">AI is analyzing your transcript</h3>
      <p className="text-sm text-slate-500 dark:text-neutral-400 mb-6 text-center max-w-xs">
        Extracting action items, identifying owners, and setting priorities...
      </p>

      <div className="flex gap-1 mb-6">
        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>

      <button
        onClick={onProcessInBackground}
        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
      >
        <Bell size={16} />
        {canNotify ? 'Process in background' : 'Enable notifications & continue'}
      </button>
    </div>
  );
}

export default function PasteModal({ isOpen, onClose, onSubmit, isProcessing, onProcessInBackground, canNotify, onBulkSubmit, meetings = [] }) {
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [fileQueue, setFileQueue] = useState([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const fileInputRef = useRef(null);
  const bulkFileInputRef = useRef(null);

  const checkForDuplicate = (filename) => {
    const normalizedFilename = filename.toLowerCase().trim();
    const filenameWithoutExt = normalizedFilename.replace(/\.(pdf|txt)$/i, '');

    return meetings.find(m => {
      const sourceFileName = (m.sourceFileName || '').toLowerCase().trim();
      const sourceFileNameWithoutExt = sourceFileName.replace(/\.(pdf|txt)$/i, '');
      const title = (m.title || '').toLowerCase().trim();

      return sourceFileNameWithoutExt === filenameWithoutExt ||
             sourceFileName === normalizedFilename ||
             title === filenameWithoutExt;
    });
  };

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setTranscript('');
      setUploadedFile(null);
      setUploadError(null);
      setFileQueue([]);
      setBulkMode(false);
      setDuplicateWarning(null);
    }
  }, [isOpen]);

  const parseFile = async (file) => {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const response = await fetch('/api/parse-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: base64,
        filename: file.name,
        type: file.type
      })
    });

    const data = await response.json();
    if (data.success) {
      return { success: true, text: data.text, filename: file.name };
    } else {
      return { success: false, error: data.error, filename: file.name };
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['application/pdf', 'text/plain'];
    const validExtensions = ['.pdf', '.txt'];
    const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExtension) {
      setUploadError('Please upload a PDF or TXT file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be less than 10MB');
      return;
    }

    const existingMeeting = checkForDuplicate(file.name);
    if (existingMeeting) {
      setDuplicateWarning({ filename: file.name, existingMeeting });
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const result = await parseFile(file);

      if (result.success) {
        setTranscript(result.text);
        setUploadedFile(file.name);
        if (!title) {
          const nameWithoutExt = file.name.replace(/\.(pdf|txt)$/i, '');
          setTitle(nameWithoutExt);
        }
      } else {
        setUploadError(result.error || 'Failed to parse file');
      }
    } catch (err) {
      console.error('File upload error:', err);
      setUploadError('Failed to upload file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleBulkFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validTypes = ['application/pdf', 'text/plain'];
    const validExtensions = ['.pdf', '.txt'];

    const validFiles = files.filter(file => {
      const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
      const hasValidType = validTypes.includes(file.type);
      const validSize = file.size <= 10 * 1024 * 1024;
      return (hasValidType || hasValidExtension) && validSize;
    });

    if (validFiles.length === 0) {
      setUploadError('No valid PDF or TXT files selected');
      return;
    }

    if (validFiles.length < files.length) {
      setUploadError(`${files.length - validFiles.length} file(s) skipped (invalid type or too large)`);
    }

    const newQueue = validFiles.map(file => {
      const existingMeeting = checkForDuplicate(file.name);
      return {
        file,
        name: file.name,
        status: 'pending',
        text: null,
        error: null,
        isDuplicate: !!existingMeeting,
        existingMeeting: existingMeeting || null
      };
    });

    setFileQueue(newQueue);
    setBulkMode(true);

    if (bulkFileInputRef.current) {
      bulkFileInputRef.current.value = '';
    }

    for (let i = 0; i < newQueue.length; i++) {
      setFileQueue(prev => prev.map((item, idx) =>
        idx === i ? { ...item, status: 'parsing' } : item
      ));

      try {
        const result = await parseFile(newQueue[i].file);
        setFileQueue(prev => prev.map((item, idx) =>
          idx === i ? {
            ...item,
            status: result.success ? 'parsed' : 'error',
            text: result.text,
            error: result.error
          } : item
        ));
      } catch (err) {
        setFileQueue(prev => prev.map((item, idx) =>
          idx === i ? { ...item, status: 'error', error: 'Failed to parse' } : item
        ));
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (transcript.trim()) {
      onSubmit({ title: title.trim() || 'Untitled Meeting', transcript: transcript.trim() });
    }
  };

  const handleBulkSubmit = () => {
    const parsedFiles = fileQueue.filter(f => f.status === 'parsed' && f.text);
    if (parsedFiles.length > 0 && onBulkSubmit) {
      onBulkSubmit(parsedFiles.map(f => ({
        title: f.name.replace(/\.(pdf|txt)$/i, ''),
        transcript: f.text
      })));
    }
  };

  const removeFromQueue = (index) => {
    setFileQueue(prev => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    setTitle('');
    setTranscript('');
    setUploadedFile(null);
    setUploadError(null);
    setFileQueue([]);
    setBulkMode(false);
    onClose();
  };

  if (!isOpen) return null;

  const parsedCount = fileQueue.filter(f => f.status === 'parsed').length;
  const parsingCount = fileQueue.filter(f => f.status === 'parsing').length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-t-xl md:rounded-xl shadow-2xl w-full md:max-w-2xl h-[90vh] md:h-auto md:max-h-[90vh] overflow-hidden relative border border-transparent dark:border-neutral-600 flex flex-col">
        {isProcessing && (
          <ProcessingOverlay
            onProcessInBackground={onProcessInBackground}
            canNotify={canNotify}
          />
        )}

        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
            {bulkMode ? `Bulk Import (${parsedCount} files ready)` : 'Add Meeting Transcript'}
          </h2>
          <button onClick={handleClose} className="text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-200" disabled={isProcessing}>
            <X size={20} />
          </button>
        </div>

        {bulkMode ? (
          <div className="p-4">
            <div className="mb-4 max-h-[400px] overflow-y-auto space-y-2">
              {fileQueue.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    item.status === 'parsed' && item.isDuplicate ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30' :
                    item.status === 'parsed' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30' :
                    item.status === 'error' ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30' :
                    item.status === 'parsing' ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30' :
                    'bg-slate-50 dark:bg-neutral-800 border-slate-200 dark:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <File size={16} className={
                      item.status === 'parsed' && item.isDuplicate ? 'text-amber-500' :
                      item.status === 'parsed' ? 'text-emerald-500' :
                      item.status === 'error' ? 'text-rose-500' :
                      item.status === 'parsing' ? 'text-blue-500' :
                      'text-slate-400'
                    } />
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-neutral-200">{item.name}</p>
                      {item.status === 'parsing' && (
                        <p className="text-xs text-blue-600 dark:text-blue-400">Parsing...</p>
                      )}
                      {item.status === 'parsed' && !item.isDuplicate && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">Ready to import</p>
                      )}
                      {item.status === 'parsed' && item.isDuplicate && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle size={10} />
                          Duplicate - previously imported as &quot;{item.existingMeeting?.title}&quot;
                        </p>
                      )}
                      {item.status === 'error' && (
                        <p className="text-xs text-rose-600 dark:text-rose-400">{item.error}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === 'parsing' && (
                      <RefreshCw size={14} className="animate-spin text-blue-500" />
                    )}
                    {item.status === 'parsed' && (
                      <CheckCircle2 size={16} className="text-emerald-500" />
                    )}
                    <button
                      onClick={() => removeFromQueue(idx)}
                      className="p-1 text-slate-400 hover:text-rose-500"
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  setBulkMode(false);
                  setFileQueue([]);
                }}
                className="text-sm text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200"
              >
                Switch to single file mode
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isProcessing}
                  className="px-4 py-2 text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-slate-100 font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkSubmit}
                  disabled={parsedCount === 0 || parsingCount > 0 || isProcessing}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Sparkles size={16} />
                  Import {parsedCount} File{parsedCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4">
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300 mb-1">
                Meeting Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Sprint Planning, Client Call, 1:1 with Sarah"
                className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-neutral-950 dark:text-white"
                disabled={isProcessing}
              />
              {uploadedFile && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1.5" title={uploadedFile}>
                  <File size={12} className="flex-shrink-0" />
                  <span className="truncate">{uploadedFile}</span>
                </p>
              )}
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-slate-700 dark:text-neutral-300">
                  Transcript <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={isProcessing || isUploading}
                  />
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    onChange={handleBulkFileSelect}
                    className="hidden"
                    multiple
                    disabled={isProcessing || isUploading}
                  />
                  <button
                    type="button"
                    onClick={() => bulkFileInputRef.current?.click()}
                    disabled={isProcessing || isUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-orange-500 bg-indigo-50 dark:bg-orange-500/10 hover:bg-indigo-100 dark:hover:bg-orange-500/20 rounded-lg transition-colors disabled:opacity-50"
                    title="Select multiple files to import at once"
                  >
                    <Plus size={14} />
                    Bulk Import
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing || isUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-neutral-300 bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload size={14} />
                        Upload File
                      </>
                    )}
                  </button>
                </div>
              </div>
              {uploadError && (
                <p className="text-xs text-rose-500 mb-2">{uploadError}</p>
              )}
              {duplicateWarning && (
                <div className="mb-3 px-3 py-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0" />
                    <span className="truncate">
                      Duplicate - previously imported as &quot;{duplicateWarning.existingMeeting.title}&quot;
                    </span>
                  </p>
                </div>
              )}
              <textarea
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  if (uploadedFile) setUploadedFile(null);
                }}
                placeholder="Paste your meeting transcript here, or upload a PDF/TXT file..."
                rows={12}
                required
                disabled={isProcessing || isUploading}
                className="w-full px-3 py-2 border border-slate-300 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-sm disabled:bg-slate-50 dark:disabled:bg-slate-900 dark:bg-neutral-950 dark:text-white"
              />
              <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1">
                Paste the full transcript or upload a file. Use <strong>Bulk Import</strong> to process multiple files at once.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isProcessing}
                className="px-4 py-2 text-slate-600 dark:text-neutral-300 hover:text-slate-800 dark:hover:text-slate-100 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!transcript.trim() || isProcessing}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Sparkles size={16} />
                Extract Action Items
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
