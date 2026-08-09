import React, { useMemo, useState } from 'react';
import { Student, Topic, Session, StudentRecord, TeacherSettings } from '../types';
import { calculateTopicScore, calculateSessionScore, calculateQuarterGrade, getTotalSessionWeight, DEFAULT_GRADING_CONFIG } from '../gradingUtils';
import { Check, X, Clock, AlertCircle, FileText, MessageSquare, Award, MinusCircle, PlusCircle, ChevronDown, ChevronUp, Trash2, ArrowRightLeft } from 'lucide-react';

interface Props {
  studentId: string;
  quarter: string;
  section: string;
  students: Student[];
  topics: Topic[];
  sessions: Session[];
  settings?: TeacherSettings | null;
  activePeriod: string;
  onSaveSession: (session: Session) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  showToast: (msg: string) => void;
  onNavigateToSession?: (sessionId: string, topicId: string) => void;
}

const getLocalDateString = (d: Date = new Date()) => {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const formatLocalDate = (dateStr: string, options?: Intl.DateTimeFormatOptions) => {
  if (!dateStr || !dateStr.includes('-')) return dateStr;
  const [year, month, day] = dateStr.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(undefined, options);
};

const DebouncedTextarea = ({ 
  value, 
  onChange, 
  placeholder, 
  className 
}: { 
  value: string; 
  onChange: (val: string) => void; 
  placeholder?: string; 
  className?: string; 
}) => {
  const [localValue, setLocalValue] = React.useState(value);
  const isFocused = React.useRef(false);

  React.useEffect(() => {
    if (!isFocused.current) {
      setLocalValue(value);
    }
  }, [value]);

  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [localValue, value, onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalValue(e.target.value);
  };

  const handleBlur = () => {
    isFocused.current = false;
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  return (
    <textarea
      value={localValue}
      onChange={handleChange}
      onFocus={() => isFocused.current = true}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
    />
  );
};

export default function StudentViewPanel({
  studentId,
  quarter,
  section,
  students,
  topics,
  sessions,
  settings,
  activePeriod,
  onSaveSession,
  onDeleteSession,
  showToast,
  onNavigateToSession
}: Props) {
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});
  const [addSessionTopicId, setAddSessionTopicId] = useState<string | null>(null);
  const [newSessionDate, setNewSessionDate] = useState<string>(getLocalDateString());
  const [newSessionType, setNewSessionType] = useState<'class' | 'quiz' | 'exam'>('class');
  const [moveSessionId, setMoveSessionId] = useState<string | null>(null);
  const [targetTopicId, setTargetTopicId] = useState<string>('');
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);

  const student = useMemo(() => students.find(s => s.id === studentId), [students, studentId]);

  // Filter topics based on quarter and section
  const relevantTopics = useMemo(() => {
    const filtered = topics.filter(t => t.quarter === quarter && t.section === section);
    const hasNotDefinedSessions = sessions.some(s => s.topicId === 'NOT_DEFINED' && s.records.some(r => r.studentId === studentId));
    if (hasNotDefinedSessions) {
      return [...filtered, { id: 'NOT_DEFINED', title: 'Not defined', quarter, section, period: '2025-2026' } as Topic];
    }
    return filtered;
  }, [topics, quarter, section, sessions, studentId]);

  // Group sessions by topic
  const sessionsByTopic = useMemo(() => {
    const grouped: Record<string, Session[]> = {};
    relevantTopics.forEach(t => {
      grouped[t.id] = sessions.filter(s => s.topicId === t.id).sort((a, b) => {
        const [aYear, aMonth, aDay] = a.date.split('-');
        const [bYear, bMonth, bDay] = b.date.split('-');
        return new Date(Number(bYear), Number(bMonth) - 1, Number(bDay)).getTime() - new Date(Number(aYear), Number(aMonth) - 1, Number(aDay)).getTime();
      });
    });
    return grouped;
  }, [sessions, relevantTopics]);

  const config = settings?.gradingConfig || DEFAULT_GRADING_CONFIG;

  const handleUpdateRecord = async (session: Session, updates: Partial<StudentRecord>) => {
    const currentRecord = session.records.find(r => r.studentId === studentId) || {
      studentId,
      present: true,
      participation: null,
      rawParticipation: null,
      classwork: null,
      homework: 'None Assigned',
      behavior: null,
      quizStatus: 'None',
      extraPoints: 0,
      punishment: 0
    };

    let newRecords = [...session.records];
    
    // Handle participation logic
    if ('participation' in updates && updates.participation !== null && updates.participation !== undefined) {
      const isFirstParticipation = newRecords.every(r => r.participation === null || r.participation === undefined);
      if (isFirstParticipation) {
        newRecords = newRecords.map(r => {
          if (r.present) {
            return { ...r, participation: 0 };
          }
          return r;
        });
      }
    }

    const recordIndex = newRecords.findIndex(r => r.studentId === studentId);
    if (recordIndex >= 0) {
      newRecords[recordIndex] = {
        ...currentRecord,
        ...updates
      };
    } else {
      newRecords.push({
        ...currentRecord,
        ...updates
      });
    }

    const updatedSession = { ...session, records: newRecords };
    try {
      await onSaveSession(updatedSession);
    } catch (e) {
      console.error(e);
      showToast('Error saving record');
    }
  };

  const toggleSession = (sessionId: string) => {
    setExpandedSessions(prev => ({ ...prev, [sessionId]: !prev[sessionId] }));
  };

  // Calculate overall quarter average
  const quarterAverage = useMemo(() => {
    if (!studentId) return '--';
    const scores: number[] = [];
    relevantTopics.forEach(t => {
      const score = calculateTopicScore(studentId, t.id, sessions, settings);
      if (score !== null) {
        scores.push(score);
      }
    });

    let quarterExamScore: number | null = null;
    const examSession = sessions.find(s => s.topicId === `QUARTER_EXAM_${quarter}_${section}`);
    if (examSession) {
      const examRecord = examSession.records.find(r => r.studentId === studentId);
      if (examRecord && examRecord.present && examRecord.quiz !== undefined) {
        quarterExamScore = examRecord.quiz;
      }
    }

    const quarterGrade = calculateQuarterGrade(scores, quarterExamScore, settings);

    if (quarterGrade === null) return '--';
    return quarterGrade.toString() + '%';
  }, [studentId, relevantTopics, sessions, settings, quarter, section]);

  const handleAddNewSession = async () => {
    if (!addSessionTopicId || !newSessionDate) return;
    
    // Check if session already exists
    if (sessions.some(s => s.topicId === addSessionTopicId && s.date === newSessionDate)) {
      showToast('A session already exists for this date in this lesson');
      return;
    }

    const newSession: Session = {
      id: `${addSessionTopicId}_${newSessionDate}`,
      topicId: addSessionTopicId,
      date: newSessionDate,
      period: activePeriod,
      type: newSessionType,
      records: students.map(s => ({
        studentId: s.id,
        present: true,
        participation: null,
        rawParticipation: null,
        classwork: null,
        homework: 'None Assigned',
        behavior: null,
        quizStatus: 'None',
        extraPoints: 0,
        punishment: 0
      }))
    };

    try {
      await onSaveSession(newSession);
      showToast('New session added');
      setAddSessionTopicId(null);
    } catch (e) {
      console.error(e);
      showToast('Error adding session');
    }
  };

  const handleMoveSession = async () => {
    if (!moveSessionId || !targetTopicId) return;
    
    const sessionToMove = sessions.find(s => s.id === moveSessionId);
    if (!sessionToMove) return;

    // Check if target topic already has a session on this date
    if (sessions.some(s => s.topicId === targetTopicId && s.date === sessionToMove.date)) {
      showToast('Target lesson already has a session on this date');
      return;
    }

    try {
      // First create the new session
      const newSession = {
        ...sessionToMove,
        id: `${targetTopicId}_${sessionToMove.date}`,
        topicId: targetTopicId
      };
      await onSaveSession(newSession);
      
      // Then delete the old one
      await onDeleteSession(sessionToMove.id);
      
      showToast('Session moved successfully');
      setMoveSessionId(null);
      setTargetTopicId('');
    } catch (e) {
      console.error(e);
      showToast('Error moving session');
    }
  };

  const handleDeleteSession = async () => {
    if (!deleteSessionId) return;
    try {
      await onDeleteSession(deleteSessionId);
      showToast('Session deleted');
      setDeleteSessionId(null);
    } catch (e) {
      console.error(e);
      showToast('Error deleting session');
    }
  };

  if (!student) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 bg-white/60 backdrop-blur-md rounded-2xl shadow-lg border border-white/50">
        <p className="text-slate-500 text-lg">Please select a student to view their records.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Student Header */}
      <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl shadow-lg border border-white/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-indigo-950">{student.lastName}, {student.firstName}</h2>
          <p className="text-slate-500 font-mono text-sm">ID: {student.id} | Cohort: {student.cohort}</p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">Quarter Average</span>
          <span className="text-4xl font-black text-indigo-600 drop-shadow-sm">{quarterAverage}</span>
        </div>
      </div>

      {/* Topics Timeline */}
      <div className="space-y-6">
        {relevantTopics.length === 0 ? (
          <div className="text-center p-8 bg-white/50 rounded-2xl border border-white/50 text-slate-500">
            No topics found for this selection.
          </div>
        ) : (
          relevantTopics.map(topic => {
            const topicSessions = sessionsByTopic[topic.id] || [];
            const topicScore = calculateTopicScore(studentId, topic.id, sessions, settings);
            
            return (
              <div key={topic.id} className="bg-white/60 backdrop-blur-md rounded-2xl shadow-sm border border-white/50 overflow-hidden">
                <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-800">{topic.title}</h3>
                  <span 
                    className={`px-3 py-1 font-bold rounded-lg text-sm ${onNavigateToSession ? 'cursor-pointer hover:bg-indigo-200 transition-colors bg-indigo-100 text-indigo-800' : 'bg-indigo-100 text-indigo-800'}`}
                    onClick={(e) => {
                      if (onNavigateToSession && topicSessions.length > 0) {
                        e.stopPropagation();
                        // Navigate to the most recent session of this topic
                        const latestSession = [...topicSessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                        onNavigateToSession(latestSession.id, topic.id);
                      }
                    }}
                    title={onNavigateToSession && topicSessions.length > 0 ? "Click to view in Tracker" : undefined}
                  >
                    {topicScore !== null ? `${topicScore}%` : 'No Grade'}
                  </span>
                </div>
                
                <div className="p-4 space-y-4">
                  {topicSessions.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No sessions recorded yet.</p>
                  ) : (
                    topicSessions.map(session => {
                      const record = session.records.find(r => r.studentId === studentId);
                      const isExpanded = expandedSessions[session.id];
                      const isAbsent = record && !record.present;
                      
                      const isQuizOrExam = session.type === 'quiz' || session.type === 'exam' || (!session.type && session.records.some(r => r.quiz !== undefined));
                      const isClass = session.type === 'class' || (!session.type && !session.records.some(r => r.quiz !== undefined));
                      
                      let sessionGrade: number | string = '--';
                      let quizGrade: number | string = '--';
                      if (record) {
                        const sScore = calculateSessionScore(record, session.records, settings);
                        sessionGrade = sScore !== null ? sScore : '--';
                        quizGrade = record.quiz !== undefined ? record.quiz : '--';
                      }

                      return (
                        <div key={session.id} className={`border rounded-xl overflow-hidden transition-all ${isAbsent ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200 bg-white'}`}>
                          {/* Session Header (Clickable) */}
                          <div className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left group">
                            <button 
                              onClick={() => toggleSession(session.id)}
                              className="flex-1 flex items-center gap-4"
                            >
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${isQuizOrExam ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                {isQuizOrExam ? 'Q' : 'S'}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-800">
                                  {formatLocalDate(session.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                                </div>
                                <div className="text-xs text-slate-500 capitalize">
                                  {session.type === 'exam' ? 'Quarter Exam' : (isQuizOrExam ? 'Lesson Quiz' : 'Class Session')}
                                </div>
                              </div>
                            </button>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1 opacity-100 transition-opacity mr-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMoveSessionId(session.id);
                                  }}
                                  title="Move to another lesson"
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                >
                                  <ArrowRightLeft size={16} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteSessionId(session.id);
                                  }}
                                  title="Delete session"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                              {isAbsent && <span className="px-2 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-md">ABSENT</span>}
                              <div className="text-right flex items-center gap-4">
                                {isClass && sessionGrade !== '--' && (
                                  <div 
                                    className={onNavigateToSession ? "cursor-pointer hover:bg-slate-100 p-1.5 -m-1.5 rounded-lg transition-colors" : ""}
                                    onClick={(e) => {
                                      if (onNavigateToSession) {
                                        e.stopPropagation();
                                        onNavigateToSession(session.id, topic.id);
                                      }
                                    }}
                                    title={onNavigateToSession ? "Click to view in Tracker" : undefined}
                                  >
                                    <div className="font-bold text-slate-700">{sessionGrade}</div>
                                    <div className="text-xs text-slate-400">Session Score</div>
                                  </div>
                                )}
                                {isQuizOrExam && quizGrade !== '--' && (
                                  <div
                                    className={onNavigateToSession ? "cursor-pointer hover:bg-amber-50 p-1.5 -m-1.5 rounded-lg transition-colors" : ""}
                                    onClick={(e) => {
                                      if (onNavigateToSession) {
                                        e.stopPropagation();
                                        onNavigateToSession(session.id, topic.id);
                                      }
                                    }}
                                    title={onNavigateToSession ? "Click to view in Tracker" : undefined}
                                  >
                                    <div className="font-bold text-amber-600">{quizGrade}</div>
                                    <div className="text-xs text-amber-400">Quiz Score</div>
                                  </div>
                                )}
                              </div>
                              <button onClick={() => toggleSession(session.id)} className="text-slate-400 hover:text-indigo-600 transition-colors">
                                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Editor */}
                          {isExpanded && (
                            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                              {!record ? (
                                <div className="text-center py-4">
                                  <p className="text-slate-500 mb-4">No record exists for this student in this session.</p>
                                  <button 
                                    onClick={() => handleUpdateRecord(session, { present: true })}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                                  >
                                    Create Record
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-6">
                                  {/* Attendance Toggle */}
                                  <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-3 h-3 rounded-full ${record.present ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                      <span className="font-medium text-slate-700">Attendance</span>
                                    </div>
                                    <button
                                      onClick={() => handleUpdateRecord(session, { present: !record.present })}
                                      className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-colors ${record.present ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'}`}
                                    >
                                      {record.present ? 'PRESENT' : 'ABSENT'}
                                    </button>
                                  </div>

                                  {record.present && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {/* Classwork */}
                                      {isClass && config.classwork.enabled && (
                                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                          <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                              <FileText size={16} className="text-indigo-500" /> Classwork
                                            </label>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            {['A', 'B', 'C', 'F', 'N/A'].map(pts => (
                                              <button
                                                key={pts}
                                                onClick={() => handleUpdateRecord(session, { classwork: record.classwork === pts ? null : pts as any })}
                                                className={`h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${pts === 'N/A' ? 'px-2' : 'w-8'} ${
                                                  record.classwork === pts 
                                                    ? 'bg-indigo-600 text-white shadow-md' 
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                              >
                                                {pts}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Participation */}
                                      {isClass && config.participation.enabled && (
                                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                          <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                              <MessageSquare size={16} className="text-indigo-500" /> Participation
                                            </label>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            {[10, 8, 6, 4, 2, 0].map(pts => (
                                              <button
                                                key={pts}
                                                onClick={() => handleUpdateRecord(session, { participation: record.participation === pts ? null : pts })}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                                                  record.participation === pts 
                                                    ? 'bg-indigo-600 text-white shadow-md' 
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                              >
                                                {pts}
                                              </button>
                                            ))}
                                            <button
                                              onClick={() => handleUpdateRecord(session, { participation: null })}
                                              className={`px-2 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                                                record.participation === null || record.participation === undefined
                                                  ? 'bg-indigo-600 text-white shadow-md' 
                                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                              }`}
                                            >
                                              N/A
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                      {/* Behavior */}
                                      {isClass && config.behavior.enabled && (
                                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                          <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                              <Award size={16} className="text-indigo-500" /> Behavior
                                            </label>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            {[10, 8, 6, 4, 2, 0].map(pts => (
                                              <button
                                                key={pts}
                                                onClick={() => handleUpdateRecord(session, { behavior: record.behavior === pts ? null : pts })}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                                                  record.behavior === pts 
                                                    ? 'bg-indigo-600 text-white shadow-md' 
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                              >
                                                {pts}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Homework */}
                                      {isClass && config.homework.enabled && (
                                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                          <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                              <Clock size={16} className="text-indigo-500" /> Homework
                                            </label>
                                          </div>
                                          <select
                                            value={record.homework}
                                            onChange={e => handleUpdateRecord(session, { homework: e.target.value as any })}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                          >
                                            <option value="None Assigned">None Assigned</option>
                                            <option value="Submitted">Submitted ({config.homework.statuses.Completed}%)</option>
                                            <option value="Late">Late ({config.homework.statuses.Late}%)</option>
                                            <option value="Incompleted">Incomplete ({config.homework.statuses.Incomplete}%)</option>
                                            <option value="Not Submitted">Not Submitted (0%)</option>
                                          </select>
                                        </div>
                                      )}
                                      
                                      {/* Quiz */}
                                      {isQuizOrExam && config.quiz.enabled && (
                                        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm">
                                          <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                              <FileText size={16} className="text-amber-500" /> Quiz Score
                                            </label>
                                          </div>
                                          <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={record.quiz === undefined ? '' : record.quiz}
                                            onChange={e => handleUpdateRecord(session, { quiz: e.target.value === '' ? undefined : Number(e.target.value) })}
                                            placeholder="Enter score (0-100)..."
                                            className="w-full px-3 py-2 bg-slate-50 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                                          />
                                        </div>
                                      )}

                                      {/* Adjustments */}
                                      {config.adjustments.enabled && (
                                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm md:col-span-2">
                                          <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                                              <AlertCircle size={16} className="text-indigo-500" /> Adjustments
                                            </label>
                                          </div>
                                          <div className="flex items-center gap-4">
                                            <button
                                              onClick={() => {
                                                const currentExtra = record.extraPoints || 0;
                                                const currentPunishment = record.punishment || 0;
                                                const currentTotal = currentExtra - currentPunishment;
                                                const newTotal = currentTotal - 1;
                                                
                                                if (newTotal < 0) {
                                                  handleUpdateRecord(session, { punishment: Math.abs(newTotal), extraPoints: 0 });
                                                } else {
                                                  handleUpdateRecord(session, { extraPoints: newTotal, punishment: 0 });
                                                }
                                              }}
                                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                            >
                                              <MinusCircle size={24} />
                                            </button>
                                            <div className="flex-1 text-center font-mono text-xl font-bold text-slate-700">
                                              {((record.extraPoints || 0) - (record.punishment || 0)) > 0 ? '+' : ''}{((record.extraPoints || 0) - (record.punishment || 0))}
                                            </div>
                                            <button
                                              onClick={() => {
                                                const currentExtra = record.extraPoints || 0;
                                                const currentPunishment = record.punishment || 0;
                                                const currentTotal = currentExtra - currentPunishment;
                                                const newTotal = currentTotal + 1;
                                                
                                                if (newTotal < 0) {
                                                  handleUpdateRecord(session, { punishment: Math.abs(newTotal), extraPoints: 0 });
                                                } else {
                                                  handleUpdateRecord(session, { extraPoints: newTotal, punishment: 0 });
                                                }
                                              }}
                                              className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                                            >
                                              <PlusCircle size={24} />
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Objective */}
                                  <div className="mt-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-2">
                                      <FileText size={16} className="text-indigo-500" /> Session Objective
                                    </label>
                                    <DebouncedTextarea
                                      value={session.objective || ''}
                                      onChange={val => {
                                        const updatedSession = { ...session, objective: val };
                                        onSaveSession(updatedSession);
                                      }}
                                      placeholder="What are the learning objectives for this session?"
                                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none h-16"
                                    />
                                  </div>

                                  {/* Annotations */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                      <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-2">
                                        <FileText size={16} className="text-indigo-500" /> Session Annotations
                                      </label>
                                      <DebouncedTextarea
                                        value={session.annotation || ''}
                                        onChange={val => {
                                          const updatedSession = { ...session, annotation: val };
                                          onSaveSession(updatedSession);
                                        }}
                                        placeholder="Add notes for this session..."
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none h-24"
                                      />
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                      <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-2">
                                        <MessageSquare size={16} className="text-indigo-500" /> Student Annotations
                                      </label>
                                      <DebouncedTextarea
                                        value={record.annotation || ''}
                                        onChange={val => handleUpdateRecord(session, { annotation: val })}
                                        placeholder="Add notes for this student..."
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none h-24"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <button
                    onClick={() => {
                      setAddSessionTopicId(topic.id);
                      setNewSessionType('class');
                    }}
                    className="w-full flex items-center justify-center gap-2 p-3 mt-2 border border-dashed border-indigo-200 text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors font-medium text-sm"
                  >
                    <PlusCircle size={16} />
                    Add New Session
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Session Modal */}
      {addSessionTopicId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800">Add New Session</h3>
              <button 
                onClick={() => setAddSessionTopicId(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Session Date</label>
                <input
                  type="date"
                  value={newSessionDate}
                  onChange={e => setNewSessionDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              
              <div>
                <p className="text-sm text-slate-600 font-medium mb-2">Select the type of session you want to create:</p>
                <div className="space-y-3">
                  {/* Class Session Option */}
                  <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${newSessionType === 'class' ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}>
                    <div className="pt-0.5">
                      <input 
                        type="checkbox" 
                        checked={newSessionType === 'class'}
                        onChange={() => setNewSessionType('class')}
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">Class Session</div>
                      <div className="text-sm text-slate-500">Regular class day. Tracks attendance, participation, behavior, and classwork.</div>
                    </div>
                  </label>

                  {/* Lesson Quiz Option */}
                  <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${newSessionType === 'quiz' ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}>
                    <div className="pt-0.5">
                      <input 
                        type="checkbox" 
                        checked={newSessionType === 'quiz'}
                        onChange={() => setNewSessionType('quiz')}
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">Lesson Quiz</div>
                      <div className="text-sm text-slate-500">A quiz or assessment for this specific lesson.</div>
                    </div>
                  </label>

                  {/* Quarter Exam Option */}
                  <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${newSessionType === 'exam' ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}>
                    <div className="pt-0.5">
                      <input 
                        type="checkbox" 
                        checked={newSessionType === 'exam'}
                        onChange={() => setNewSessionType('exam')}
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">Quarter Exam</div>
                      <div className="text-sm text-slate-500">Major assessment for the entire quarter.</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setAddSessionTopicId(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNewSession}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
              >
                Add Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Session Modal */}
      {moveSessionId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800">Move Session</h3>
              <button 
                onClick={() => {
                  setMoveSessionId(null);
                  setTargetTopicId('');
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Target Lesson</label>
                <select
                  value={targetTopicId}
                  onChange={e => setTargetTopicId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="" disabled>Select a lesson...</option>
                  {relevantTopics.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setMoveSessionId(null);
                  setTargetTopicId('');
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMoveSession}
                disabled={!targetTopicId}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Move Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Session Modal */}
      {deleteSessionId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-rose-100 flex justify-between items-center bg-rose-50/50">
              <h3 className="text-lg font-bold text-rose-800">Delete Session</h3>
              <button 
                onClick={() => setDeleteSessionId(null)}
                className="text-rose-400 hover:text-rose-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-slate-600">Are you sure you want to delete this session? This action cannot be undone and will remove all student records for this date.</p>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setDeleteSessionId(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSession}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 transition-colors"
              >
                Delete Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
