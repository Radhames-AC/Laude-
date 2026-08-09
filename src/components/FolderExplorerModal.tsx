import React, { useState, useMemo } from 'react';
import { X, Folder, FileText, ChevronRight, ChevronDown, Calendar, Target, Award, CheckCircle } from 'lucide-react';
import { Session, Topic, TeacherSettings } from '../types';
import { calculateSessionScore } from '../gradingUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sessions: Session[];
  topics: Topic[];
  settings?: TeacherSettings | null;
  onSelectSession: (topicId: string, date: string) => void;
}

export default function FolderExplorerModal({ isOpen, onClose, sessions, topics, settings, onSelectSession }: Props) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const tree = useMemo(() => {
    const root: any = {};
    
    // First, organize topics into the tree
    topics.forEach(topic => {
      const period = topic.period || '2025-2026';
      const quarter = topic.quarter || 'Unassigned';
      const section = topic.section || 'Unassigned';
      
      if (!root[period]) root[period] = {};
      if (!root[period][quarter]) root[period][quarter] = {};
      if (!root[period][quarter][section]) root[period][quarter][section] = {};
      
      root[period][quarter][section][topic.id] = {
        topic,
        sessions: []
      };
    });

    // Then, add sessions to their respective topics
    sessions.forEach(session => {
      const topic = topics.find(t => t.id === session.topicId);
      if (topic) {
        const period = topic.period || '2025-2026';
        const quarter = topic.quarter || 'Unassigned';
        const section = topic.section || 'Unassigned';
        
        if (root[period]?.[quarter]?.[section]?.[topic.id]) {
          root[period][quarter][section][topic.id].sessions.push(session);
        }
      }
    });

    return root;
  }, [topics, sessions]);

  if (!isOpen) return null;

  const renderTree = (node: any, path: string, level: number = 0) => {
    return Object.keys(node).sort().map(key => {
      const currentPath = `${path}/${key}`;
      const isExpanded = expandedFolders.has(currentPath);
      const isTopicLevel = level === 3;

      if (isTopicLevel) {
        const topicData = node[key];
        const topic: Topic = topicData.topic;
        const topicSessions: Session[] = topicData.sessions;

        return (
          <div key={currentPath} className="ml-4">
            <div 
              className="flex items-center gap-2 py-2 px-2 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              onClick={() => toggleFolder(currentPath)}
            >
              {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
              <Folder size={18} className="text-indigo-400" />
              <span className="font-medium text-slate-700">{topic.title}</span>
              <span className="text-xs text-slate-400 ml-2">({topicSessions.length} sessions)</span>
            </div>
            
            {isExpanded && (
              <div className="ml-2 sm:ml-8 mt-2 mb-4 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                {/* Desktop Table View */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                        <th className="p-3 font-medium">Session Date</th>
                        <th className="p-3 font-medium">Objective</th>
                        <th className="p-3 font-medium text-center">Avg Score</th>
                        <th className="p-3 font-medium text-center">Quiz Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {topicSessions.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-sm text-slate-500">
                            No sessions recorded for this lesson yet.
                          </td>
                        </tr>
                      ) : (
                        topicSessions.sort((a, b) => b.date.localeCompare(a.date)).map(session => {
                          // Calculate average score
                          const records = Object.values(session.records || {});
                          let hasQuiz = false;
                          let totalQuizScore = 0;
                          let quizCount = 0;
                          let totalScore = 0;
                          let scoreCount = 0;

                          records.forEach(r => {
                            if (r.present && settings) {
                              totalScore += calculateSessionScore(r, records, settings);
                              scoreCount++;
                            }
                            
                            if (r.quiz !== undefined && r.quiz !== null && r.quizStatus !== 'Absent' && r.quizStatus !== 'Exonerated') {
                              hasQuiz = true;
                              totalQuizScore += r.quiz;
                              quizCount++;
                            }
                          });

                          const quizAvg = quizCount > 0 ? (totalQuizScore / quizCount).toFixed(1) : '- -';
                          const avgScore = scoreCount > 0 ? (totalScore / scoreCount).toFixed(1) : '- -';

                          return (
                            <tr 
                              key={session.id} 
                              className="hover:bg-indigo-50/50 cursor-pointer transition-colors"
                              onClick={() => {
                                onSelectSession(session.topicId, session.date);
                                onClose();
                              }}
                            >
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <FileText size={16} className="text-indigo-400" />
                                  <span className="font-medium text-slate-700">{session.date}</span>
                                </div>
                              </td>
                              <td className="p-3 text-sm text-slate-600 truncate max-w-[200px]" title={session.objective || 'No objective'}>
                                {session.objective || <span className="text-slate-400 italic">No objective</span>}
                              </td>
                              <td className="p-3 text-center">
                                <span className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium text-sm">
                                  {avgScore}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                {hasQuiz ? (
                                  <span className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-amber-50 text-amber-700 font-medium text-sm">
                                    {quizAvg}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">- -</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="sm:hidden flex flex-col gap-3 p-2">
                  {topicSessions.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
                      No sessions recorded for this lesson yet.
                    </div>
                  ) : (
                    topicSessions.sort((a, b) => b.date.localeCompare(a.date)).map(session => {
                      // Calculate average score
                      const records = Object.values(session.records || {});
                      let hasQuiz = false;
                      let totalQuizScore = 0;
                      let quizCount = 0;
                      let totalScore = 0;
                      let scoreCount = 0;

                      records.forEach(r => {
                        if (r.present && settings) {
                          totalScore += calculateSessionScore(r, records, settings);
                          scoreCount++;
                        }
                        
                        if (r.quiz !== undefined && r.quiz !== null && r.quizStatus !== 'Absent' && r.quizStatus !== 'Exonerated') {
                          hasQuiz = true;
                          totalQuizScore += r.quiz;
                          quizCount++;
                        }
                      });

                      const quizAvg = quizCount > 0 ? (totalQuizScore / quizCount).toFixed(1) : '- -';
                      const avgScore = scoreCount > 0 ? (totalScore / scoreCount).toFixed(1) : '- -';

                      return (
                        <div 
                          key={session.id} 
                          className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all flex flex-col gap-3 relative overflow-hidden group"
                          onClick={() => {
                            onSelectSession(session.topicId, session.date);
                            onClose();
                          }}
                        >
                          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-400 group-hover:bg-indigo-500 transition-colors"></div>
                          
                          <div className="flex items-center justify-between ml-1">
                            <div className="flex items-center gap-2.5">
                              <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                                <Calendar size={18} />
                              </div>
                              <span className="font-bold text-slate-800 text-[15px]">{session.date}</span>
                            </div>
                            <ChevronRight size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                          </div>
                          
                          <div className="ml-1 text-[13px] text-slate-600 bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                            {session.objective || <span className="text-slate-400 italic">No objective specified for this session.</span>}
                          </div>

                          <div className="flex items-center gap-2 mt-1 ml-1 flex-wrap">
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50/80 border border-emerald-100">
                              <Target size={14} className="text-emerald-600" />
                              <span className="text-xs font-semibold text-emerald-800">
                                Avg: {avgScore}
                              </span>
                            </div>
                            {hasQuiz && (
                              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50/80 border border-amber-100">
                                <Award size={14} className="text-amber-600" />
                                <span className="text-xs font-semibold text-amber-800">
                                  Quiz: {quizAvg}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        );
      }

      return (
        <div key={currentPath} className="ml-4">
          <div 
            className="flex items-center gap-2 py-2 px-2 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            onClick={() => toggleFolder(currentPath)}
          >
            {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
            <Folder size={18} className={level === 0 ? "text-blue-500" : level === 1 ? "text-emerald-500" : "text-amber-500"} />
            <span className="font-medium text-slate-700">{key}</span>
          </div>
          {isExpanded && (
            <div className="border-l border-slate-200 ml-3">
              {renderTree(node[key], currentPath, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Folder className="text-indigo-600" /> Session Explorer
            </h2>
            <p className="text-sm text-slate-500 mt-1">Browse your sessions by Period, Quarter, Section, and Lesson.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-h-full">
            {Object.keys(tree).length === 0 ? (
              <div className="text-center text-slate-500 py-12">
                <Folder size={48} className="mx-auto text-slate-300 mb-4" />
                <p>No lessons or sessions found.</p>
              </div>
            ) : (
              <div className="-ml-4">
                {renderTree(tree, 'root')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
