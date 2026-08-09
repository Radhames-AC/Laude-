import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Student, Session, StudentRecord, DEFAULT_QUARTERS, Quarter, Topic, DEFAULT_SECTIONS, Reminder, TeacherSettings } from '../types';
import { Download, Search, User, Filter, ArrowLeft, TrendingUp, AlertCircle, CheckCircle, BookOpen, Star, MessageCircle, GraduationCap, ChevronDown, ChevronRight, FileText, Printer, Maximize2, Minimize2, CheckSquare, CalendarCheck, Trash2, X, UserMinus } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { calculateSessionScore, calculateTopicScore, calculateQuarterGrade, DEFAULT_GRADING_CONFIG, getTotalSessionWeight } from '../gradingUtils';
import { ConfirmModal } from './ConfirmModal';

interface Props {
  students: Student[];
  topics: Topic[];
  sessions: Session[];
  reminders?: Reminder[];
  onSaveReminder?: (reminder: Reminder) => void;
  onDeleteReminder?: (id: string) => void;
  onNavigate: (tab: 'dashboard' | 'tracker' | 'analytics' | 'settings' | 'planner', studentId?: string, sessionId?: string, mode?: string) => void;
  initialStudentId?: string | null;
  initialMode?: string | null;
  allPeriods: string[];
  activePeriod: string;
  setActivePeriod: (period: string) => void;
  onInternalBackChange?: (handler: (() => void) | null) => void;
  settings?: TeacherSettings | null;
  onDeleteTopic?: (id: string) => Promise<void>;
  onDeleteSession?: (id: string) => Promise<void>;
  onRemoveStudentFromSession?: (sessionId: string, studentId: string) => Promise<void>;
}

// Helper to calculate current session score for a student (out of 60)
// Removed: calculateSessionScore and calculateTopicScore are now imported from gradingUtils.ts

const formatLocalDate = (dateStr: string, options?: Intl.DateTimeFormatOptions) => {
  if (!dateStr || !dateStr.includes('-')) return dateStr;
  const [year, month, day] = dateStr.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(undefined, options);
};

const getGradeColor = (grade: number | null) => {
  if (grade === null) return 'text-gray-400';
  if (grade > 100) return 'text-amber-600 font-bold';
  if (grade >= 90) return 'text-emerald-600 font-bold';
  if (grade >= 70) return 'text-indigo-600 font-bold';
  return 'text-rose-600 font-bold';
};

const getGradeBg = (grade: number | null) => {
  if (grade === null) return 'bg-gray-50';
  if (grade > 100) return 'bg-amber-50 border-amber-200';
  if (grade >= 90) return 'bg-emerald-50 border-emerald-200';
  if (grade >= 70) return 'bg-indigo-50 border-indigo-200';
  return 'bg-rose-50 border-rose-200';
};

export default function AnalyticsTab({ students, topics, sessions, reminders = [], onSaveReminder, onDeleteReminder, onNavigate, initialStudentId, initialMode, allPeriods, activePeriod, setActivePeriod, onInternalBackChange, settings, onDeleteTopic, onDeleteSession, onRemoveStudentFromSession }: Props) {
  const config = settings?.gradingConfig || DEFAULT_GRADING_CONFIG;
  const [customQuarters, setCustomQuarters] = useState<string[]>([]);
  const [customSections, setCustomSections] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<string | null>(initialMode || null);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  
  const [expandedExplorerFolders, setExpandedExplorerFolders] = useState<Set<string>>(new Set());

  const toggleExplorerFolder = (path: string) => {
    setExpandedExplorerFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const explorerTree = useMemo(() => {
    const root: any = {};
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

  const renderExplorerTree = (node: any, path: string, level: number = 0) => {
    return Object.keys(node).sort().map(key => {
      const currentPath = `${path}/${key}`;
      const isExpanded = expandedExplorerFolders.has(currentPath);
      const isTopicLevel = level === 3;

      const parts = currentPath.split('/').filter(Boolean);

      if (isTopicLevel) {
        const topicData = node[key];
        const topic: Topic = topicData.topic;
        const topicSessions: Session[] = topicData.sessions;

        return (
          <div key={currentPath} className="ml-4">
            <div 
              className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              onClick={() => toggleExplorerFolder(currentPath)}
            >
              {isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
              <span className="text-indigo-400">📄</span>
              <span className="font-medium text-slate-700 text-sm">{topic.title}</span>
              <span className="text-xs text-slate-400 ml-2">({topicSessions.length} sessions)</span>
            </div>
            
            {isExpanded && (
              <div className="ml-6 border-l border-slate-200 pl-2 mt-1 mb-2 space-y-1">
                {topicSessions.length === 0 ? (
                  <div className="text-xs text-slate-400 italic py-1 px-2">No sessions</div>
                ) : (
                  topicSessions.sort((a, b) => b.date.localeCompare(a.date)).map(session => (
                    <div 
                      key={session.id}
                      className="flex items-center gap-2 py-1 px-2 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors text-sm text-slate-600"
                      onClick={() => onNavigate('tracker', undefined, session.id)}
                    >
                      <span className="text-slate-400">🕒</span>
                      <span>{session.date}</span>
                      {session.objective && <span className="text-xs text-slate-400 truncate ml-2 max-w-[150px]">- {session.objective}</span>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      } else {
        const isSectionLevel = level === 2;
        const isActiveSection = isSectionLevel && parts[2] === selectedSection && parts[1] === selectedQuarter && parts[0] === activePeriod;
        return (
          <div key={currentPath} className="ml-4">
            <div 
              className={`flex items-center justify-between py-1.5 px-2 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors ${isActiveSection ? 'bg-indigo-50 text-indigo-700' : ''}`}
              onClick={() => {
                toggleExplorerFolder(currentPath);
                if (isSectionLevel) {
                  setActivePeriod(parts[0]);
                  setSelectedQuarter(parts[1] as Quarter);
                  setSelectedSection(parts[2]);
                }
              }}
            >
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                <span className="text-amber-400">📁</span>
                <span className={`font-medium ${isActiveSection ? 'text-indigo-700 font-bold' : 'text-slate-700'} text-sm`}>{key}</span>
              </div>
              {isActiveSection && (
                <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">Active</span>
              )}
            </div>
            {isExpanded && (
              <div className="border-l border-slate-200 mt-1 mb-1">
                {renderExplorerTree(node[key], currentPath, level + 1)}
              </div>
            )}
          </div>
        );
      }
    });
  };

  const allQuarters = useMemo(() => {
    const base = settings ? settings.gradingPeriods : DEFAULT_QUARTERS;
    return Array.from(new Set([...base, ...topics.map(t => t.quarter), ...customQuarters])).filter(Boolean).sort();
  }, [topics, customQuarters, settings]);

  const allSections = useMemo(() => {
    const base = settings ? settings.sections : DEFAULT_SECTIONS;
    return Array.from(new Set([...base, ...topics.map(t => t.section), ...customSections])).filter(Boolean).sort();
  }, [topics, customSections, settings]);

  const [selectedQuarter, setSelectedQuarter] = useState<Quarter>(() => {
    const saved = localStorage.getItem('analytics_selectedQuarter');
    if (saved && allQuarters.includes(saved as Quarter)) {
      return saved as Quarter;
    }
    return allQuarters[0] || 'Q1';
  });

  useEffect(() => {
    localStorage.setItem('analytics_selectedQuarter', selectedQuarter);
  }, [selectedQuarter]);

  const [selectedSection, setSelectedSection] = useState<string>(() => {
    const saved = localStorage.getItem('analytics_selectedSection');
    if (saved && allSections.includes(saved)) {
      return saved;
    }
    return allSections[0] || '7a Language';
  });

  useEffect(() => {
    localStorage.setItem('analytics_selectedSection', selectedSection);
  }, [selectedSection]);

  // Evaluate all parameters early
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(initialStudentId || null);
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'anecdotal'>('overview');
  const [mainTab, setMainTab] = useState<'grades' | 'comments_reminders'>('grades');
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean; title: string; message: string; onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showTopicHistoryModal, setShowTopicHistoryModal] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [expandedSessionInModal, setExpandedSessionInModal] = useState<string | null>(null);

  const detailHeaderRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedStudentId && onInternalBackChange) {
      onInternalBackChange(() => () => setSelectedStudentId(null));
    } else if (onInternalBackChange) {
      onInternalBackChange(null);
    }
    return () => {
      if (onInternalBackChange) onInternalBackChange(null);
    };
  }, [selectedStudentId, onInternalBackChange]);

  const toggleTopic = (topicId: string) => {
    setExpandedTopics(prev => ({
      ...prev,
      [topicId]: !prev[topicId]
    }));
  };

  const scrollToTimeline = () => {
    const element = document.getElementById('topic-history');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleGradeClick = (e: React.MouseEvent, studentId: string, topicId: string) => {
    e.stopPropagation();
    setSelectedStudentId(studentId);
    
    // Collapse all topics except the selected one
    const newExpandedState: Record<string, boolean> = {};
    filteredTopics.forEach(t => {
      newExpandedState[t.id] = t.id === topicId;
    });
    setExpandedTopics(newExpandedState);
    
    setTimeout(() => {
      const element = document.getElementById(`topic-history`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  useEffect(() => {
    if (initialStudentId) {
      setSelectedStudentId(prev => prev !== initialStudentId ? initialStudentId : prev);
      const student = students.find(s => s.id === initialStudentId);
      if (student) {
        const studentSection = allSections.find(s => s === student.cohort || s.startsWith(student.cohort + ' '));
        if (studentSection) {
          setSelectedSection(prev => prev !== studentSection ? studentSection : prev);
        }
      }
    }
  }, [initialStudentId, students, allSections]);

  // Filter topics for the selected quarter and section
  const filteredTopics = useMemo(() => {
    const filtered = topics.filter(t => t.quarter === selectedQuarter && t.section === selectedSection);
    
    // Check if there are any sessions with 'NOT_DEFINED' topic for students in this section
    const sectionStudents = students.filter(s => selectedSection === s.cohort || selectedSection.startsWith(s.cohort + ' '));
    const studentIds = new Set(sectionStudents.map(s => s.id));
    const hasNotDefinedSessions = sessions.some(s => s.topicId === 'NOT_DEFINED' && s.records.some(r => studentIds.has(r.studentId)));
    
    if (hasNotDefinedSessions) {
      return [...filtered, { id: 'NOT_DEFINED', title: 'Not defined', quarter: selectedQuarter, section: selectedSection, period: '2025-2026' } as Topic];
    }
    return filtered;
  }, [topics, selectedQuarter, selectedSection, sessions, students]);

  // Calculate Gradebook Data for Class Overview
  const gradebookData = useMemo(() => {
    const studentsInSection = students.filter(s => selectedSection === s.cohort || selectedSection.startsWith(s.cohort + ' '));
    
    return studentsInSection.map(student => {
      const topicScores: Record<string, number | null> = {};
      let sumTopicScores = 0;
      let countTopicScores = 0;
      let totalAbsences = 0;

      filteredTopics.forEach(topic => {
        const score = calculateTopicScore(student.id, topic.id, sessions, settings);
        topicScores[topic.id] = score;
        if (score !== null) {
          sumTopicScores += score;
          countTopicScores++;
        }

        // Count absences
        const topicSessions = sessions.filter(s => s.topicId === topic.id);
        topicSessions.forEach(session => {
          const record = session.records.find(r => r.studentId === student.id);
          if (record && !record.present) {
            totalAbsences++;
          }
        });
      });

      let quarterExamScore: number | null = null;
      let quarterExamSessionId: string | null = null;
      const examSession = sessions.find(s => s.topicId === `QUARTER_EXAM_${selectedQuarter}_${selectedSection}`);
      if (examSession) {
        quarterExamSessionId = examSession.id;
        const examRecord = examSession.records.find(r => r.studentId === student.id);
        if (examRecord && examRecord.present && examRecord.quiz !== undefined) {
          quarterExamScore = examRecord.quiz;
        }
      }

      const validScores = Object.values(topicScores).filter(s => s !== null) as number[];
      const quarterGrade = calculateQuarterGrade(validScores, quarterExamScore, settings);

      return {
        student,
        topicScores,
        quarterExamScore,
        quarterExamSessionId,
        quarterGrade,
        totalAbsences
      };
    }).sort((a, b) => a.student.lastName.localeCompare(b.student.lastName));
  }, [selectedSection, students, filteredTopics, sessions]);

  // Class Metrics
  const classMetrics = useMemo(() => {
    let sumGrades = 0;
    let countGrades = 0;
    let topPerformers = 0;
    let atRisk = 0;

    gradebookData.forEach(data => {
      if (data.quarterGrade !== null) {
        sumGrades += data.quarterGrade;
        countGrades++;
        if (data.quarterGrade >= 90) topPerformers++;
        if (data.quarterGrade < 70 || data.totalAbsences >= 3) atRisk++;
      }
    });

    return {
      average: countGrades > 0 ? Math.round(sumGrades / countGrades) : null,
      totalStudents: gradebookData.length,
      topPerformers,
      atRisk
    };
  }, [gradebookData]);

  const filteredGradebookData = useMemo(() => {
    if (filterMode === 'atRisk') {
      return gradebookData.filter(data => (data.quarterGrade !== null && data.quarterGrade < 70) || data.totalAbsences >= 3);
    }
    if (filterMode === 'topPerformers') {
      return gradebookData.filter(data => data.quarterGrade !== null && data.quarterGrade >= 90);
    }
    return gradebookData;
  }, [gradebookData, filterMode]);

  const sortedGradebookData = useMemo(() => {
    let sortableItems = [...filteredGradebookData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (sortConfig.key === 'student') {
          aValue = a.student.lastName;
          bValue = b.student.lastName;
        } else if (sortConfig.key === 'id') {
          aValue = a.student.id;
          bValue = b.student.id;
        } else if (sortConfig.key === 'qGrade') {
          aValue = a.quarterGrade ?? -1;
          bValue = b.quarterGrade ?? -1;
        } else if (sortConfig.key === 'qExam') {
          aValue = a.quarterExamScore ?? -1;
          bValue = b.quarterExamScore ?? -1;
        } else if (sortConfig.key === 'absences') {
          aValue = a.totalAbsences;
          bValue = b.totalAbsences;
        } else {
          // Topic scores
          aValue = a.topicScores[sortConfig.key] ?? -1;
          bValue = b.topicScores[sortConfig.key] ?? -1;
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredGradebookData, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Student Detail Data
  const studentDetailData = useMemo(() => {
    if (!selectedStudentId) return null;
    
    const student = students.find(s => s.id === selectedStudentId);
    if (!student) return null;

    let totalPartEarned = 0, totalPartMax = 0;
    let totalBehavEarned = 0, totalBehavMax = 0;
    let totalClassworkEarned = 0, totalClassworkMax = 0;
    let hwAssigned = 0, hwSubmitted = 0;
    let quizSum = 0, quizCount = 0;

    const timeline: { topic: Topic, topicScore: number | null, sessions: { session: Session, record: StudentRecord }[] }[] = [];

    filteredTopics.forEach(topic => {
      const topicSessions = sessions.filter(s => s.topicId === topic.id).sort((a, b) => {
        const [aYear, aMonth, aDay] = a.date.split('-');
        const [bYear, bMonth, bDay] = b.date.split('-');
        return new Date(Number(bYear), Number(bMonth) - 1, Number(bDay)).getTime() - new Date(Number(aYear), Number(aMonth) - 1, Number(aDay)).getTime();
      });
      const topicScore = calculateTopicScore(student.id, topic.id, sessions, settings);
      
      const sessionDetails: { session: Session, record: StudentRecord }[] = [];

      topicSessions.forEach(session => {
        const record = session.records.find(r => r.studentId === student.id);
        if (record) {
          sessionDetails.push({ session, record });
          
          if (record.present) {
            if (record.participation !== null && record.participation !== undefined) {
              totalPartEarned += record.participation;
              totalPartMax += 10;
            }
            
            if (record.behavior !== null && record.behavior !== undefined) {
              totalBehavEarned += record.behavior;
              totalBehavMax += 10;
            }

            if (record.classwork !== null && record.classwork !== undefined && record.classwork !== 'N/A') {
              if (typeof record.classwork === 'number') {
                totalClassworkEarned += record.classwork;
                totalClassworkMax += 25; // Classwork is out of 25
              }
            }

            if (record.homework !== 'None Assigned' && record.homework !== 'N/A') {
              hwAssigned++;
              if (record.homework === 'Submitted' || record.homework === 'Completed') hwSubmitted++;
            }
          }

          const qStatus = record.quizStatus || (record.quiz !== undefined ? 'Graded' : 'None');
          if (qStatus === 'Graded' && record.quiz !== undefined) {
            quizSum += record.quiz;
            quizCount++;
          } else if (qStatus === 'Absent') {
            quizSum += 0;
            quizCount++;
          }
        }
      });

      if (sessionDetails.length > 0) {
        timeline.push({ topic, topicScore, sessions: sessionDetails });
      }
    });

    const overallGrade = gradebookData.find(g => g.student.id === selectedStudentId)?.quarterGrade ?? null;

    return {
      student,
      overallGrade,
      avgPart: totalPartMax > 0 ? Math.round((totalPartEarned / totalPartMax) * 100) : null,
      avgBehav: totalBehavMax > 0 ? Math.round((totalBehavEarned / totalBehavMax) * 100) : null,
      avgClasswork: totalClassworkMax > 0 ? Math.round((totalClassworkEarned / totalClassworkMax) * 100) : null,
      hwRate: hwAssigned > 0 ? Math.round((hwSubmitted / hwAssigned) * 100) : null,
      avgQuiz: quizCount > 0 ? Math.round((quizSum / (quizCount * 100)) * 100) : null,
      timeline
    };
  }, [selectedStudentId, students, filteredTopics, sessions, gradebookData, settings]);

  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);
  
  useEffect(() => {
    if (!detailHeaderRef.current || !selectedStudentId || !studentDetailData) {
      setIsHeaderScrolled(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsHeaderScrolled(!entry.isIntersecting);
      },
      { threshold: 0 }
    );
    observer.observe(detailHeaderRef.current);
    return () => observer.disconnect();
  }, [selectedStudentId, studentDetailData]); // Re-bind observer when we change student

  const exportClassCSV = () => {
    const headers = ['Student ID', 'Last Name', 'First Name', 'Quarter Grade', 'Absences', ...filteredTopics.map(t => t.title)];
    const rows = gradebookData.map(data => [
      data.student.id,
      data.student.lastName,
      data.student.firstName,
      data.quarterGrade !== null ? data.quarterGrade.toString() : 'N/A',
      data.totalAbsences.toString(),
      ...filteredTopics.map(t => {
        const score = data.topicScores[t.id];
        return score !== null ? score.toString() : 'N/A';
      })
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSV(csvContent, `${selectedQuarter}_${selectedSection.replace(' ', '_')}_Gradebook.csv`);
  };

  const exportClassPDF = () => {
    const doc = new jsPDF('landscape');
    
    // Add Branding / Header
    doc.setFillColor(79, 70, 229); // Indigo 600
    doc.rect(0, 0, 297, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Quarter Gradebook', 14, 25);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Quarter: ${selectedQuarter} | Section: ${selectedSection}`, 14, 33);
    
    const teacherName = settings?.teacherName || '';
    if (teacherName || activePeriod) {
      doc.text(`Teacher: ${teacherName || 'N/A'} | Year: ${activePeriod || 'N/A'}`, 150, 33);
    }

    const headers = ['Student', 'Grade', 'Absences', ...filteredTopics.map(t => t.title.substring(0, 15) + (t.title.length > 15 ? '...' : ''))];
    
    const rows = gradebookData.map(data => [
      `${data.student.lastName}, ${data.student.firstName}`,
      data.quarterGrade !== null ? `${data.quarterGrade}%` : 'N/A',
      data.totalAbsences.toString(),
      ...filteredTopics.map(t => {
        const score = data.topicScores[t.id];
        return score !== null ? `${score}%` : 'N/A';
      })
    ]);

    autoTable(doc, {
      startY: 50,
      head: [headers],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 3 },
    });

    doc.save(`${selectedQuarter}_${selectedSection.replace(' ', '_')}_Gradebook.pdf`);
  };

  const exportStudentCSV = () => {
    if (!studentDetailData) return;
    
    const headers = ['Topic', 'Date', 'Present', 'Participation', 'Behavior', 'Class Work', 'Homework', 'Quiz Status', 'Quiz Score', 'Extra', 'Punishment', 'Total Session Points'];
    const rows: string[][] = [];

    studentDetailData.timeline.forEach(t => {
      t.sessions.forEach(s => {
        const earned = calculateSessionScore(s.record, s.session.records, settings);

        rows.push([
          t.topic.title,
          s.session.date,
          s.record.present ? 'Yes' : 'No',
          s.record.present ? (s.record.participation ?? '-').toString() : '-',
          s.record.present ? (s.record.behavior ?? '-').toString() : '-',
          s.record.present ? (s.record.classwork ?? '-').toString() : '-',
          s.record.present ? s.record.homework : '-',
          s.record.present ? (s.record.quizStatus || 'None') : '-',
          s.record.present && s.record.quiz !== undefined ? s.record.quiz.toString() : '-',
          s.record.present ? (s.record.extraPoints || 0).toString() : '-',
          s.record.present ? (s.record.punishment || 0).toString() : '-',
          s.record.present && earned !== null ? earned.toString() : '-'
        ]);
      });
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSV(csvContent, `${studentDetailData.student.lastName}_${studentDetailData.student.firstName}_History.csv`);
  };

  const exportStudentPDF = () => {
    if (!studentDetailData) return;

    const doc = new jsPDF();
    const studentName = `${studentDetailData.student.firstName} ${studentDetailData.student.lastName}`;
    
    // Add Branding / Header
    doc.setFillColor(79, 70, 229); // Indigo 600
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Student Report', 14, 25);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Student: ${studentName}`, 14, 33);
    doc.text(`ID: ${studentDetailData.student.id}`, 150, 33);

    // Add Content
    doc.setTextColor(30, 41, 59); // Slate 800
    let yPos = 50;

    // School Info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const teacherName = settings?.teacherName || '';
    doc.text(`Quarter: ${selectedQuarter} | Section: ${selectedSection}`, 14, yPos);
    doc.text(`Teacher: ${teacherName || 'N/A'} | Year: ${activePeriod || 'N/A'}`, 100, yPos);
    yPos += 10;

    // Summary Metrics
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary Metrics', 14, yPos);
    yPos += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Overall Grade: ${studentDetailData.overallGrade !== null ? studentDetailData.overallGrade + '%' : 'N/A'}`, 14, yPos);
    doc.text(`Avg Participation: ${studentDetailData.avgPart !== null ? studentDetailData.avgPart + '%' : 'N/A'}`, 100, yPos);
    yPos += 8;
    doc.text(`Avg Behavior: ${studentDetailData.avgBehav !== null ? studentDetailData.avgBehav + '%' : 'N/A'}`, 14, yPos);
    doc.text(`Avg Class Work: ${studentDetailData.avgClasswork !== null ? studentDetailData.avgClasswork + '%' : 'N/A'}`, 100, yPos);
    yPos += 8;
    doc.text(`HW Completion: ${studentDetailData.hwRate !== null ? studentDetailData.hwRate + '%' : 'N/A'}`, 14, yPos);
    doc.text(`Quiz Average: ${studentDetailData.avgQuiz !== null ? studentDetailData.avgQuiz + '%' : 'N/A'}`, 100, yPos);
    yPos += 15;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Topic History', 14, yPos);
    yPos += 5;

    const tableData: any[] = [];
    
    studentDetailData.timeline.forEach(t => {
      t.sessions.forEach(s => {
        const earned = calculateSessionScore(s.record, s.session.records, settings);

        tableData.push([
          t.topic.title,
          s.session.date,
          s.record.present ? 'Yes' : 'No',
          s.record.present ? (s.record.participation ?? '-').toString() : '-',
          s.record.present ? (s.record.behavior ?? '-').toString() : '-',
          s.record.present ? (s.record.classwork ?? '-').toString() : '-',
          s.record.present ? s.record.homework : '-',
          s.record.present ? (s.record.quizStatus || 'None') : '-',
          s.record.present && s.record.quiz !== undefined ? s.record.quiz.toString() : '-',
          s.record.present ? (s.record.extraPoints || 0).toString() : '-',
          s.record.present ? (s.record.punishment || 0).toString() : '-',
          s.record.present && earned !== null ? earned.toString() : '-'
        ]);
      });
    });

    if (tableData.length === 0) {
      doc.setFontSize(12);
      doc.text('No records found for this student in the selected quarter.', 14, yPos + 10);
      yPos += 20;
    } else {
      autoTable(doc, {
        startY: yPos,
        head: [['Topic', 'Date', 'Present', 'Part.', 'Behav.', 'C.W.', 'HW', 'Quiz Stat', 'Quiz', 'Extra', 'Punish', 'Total']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255 },
        styles: { fontSize: 8, cellPadding: 2 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 15;
    }

    // Anecdotal Records Summary
    const anecdotalData: any[] = [];
    studentDetailData.timeline.forEach(t => {
      t.sessions.forEach(s => {
        const hasComments = s.record.comments && Object.values(s.record.comments).some(v => v.trim() !== '');
        const hasAnnotation = !!s.record.annotation?.trim();
        if (hasComments || hasAnnotation || s.session.annotation || s.session.objective) {
          let commentsString = '';
          if (hasAnnotation) {
            commentsString += `General: ${s.record.annotation}\n`;
          }
          if (hasComments && s.record.comments) {
            commentsString += Object.entries(s.record.comments).filter(([_, v]) => v.trim() !== '').map(([k, v]) => `${k}: ${v}`).join('\n');
          }
          if (!commentsString) commentsString = '-';
          
          anecdotalData.push([
            s.session.date,
            t.topic.title,
            commentsString,
            s.session.annotation || '-',
            s.session.objective || '-'
          ]);
        }
      });
    });

    if (anecdotalData.length > 0) {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Anecdotal Notes Summary', 14, yPos);
      yPos += 5;

      autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Topic', 'Student Comment', 'Session Annotation', 'Session Objective']],
        body: anecdotalData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255 },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 30 },
          2: { cellWidth: 45 },
          3: { cellWidth: 45 },
          4: { cellWidth: 40 }
        },
      });
    }

    doc.save(`${studentDetailData.student.lastName}_${studentDetailData.student.firstName}_Report.pdf`);
  };

  const exportAnecdoticPDF = () => {
    if (!studentDetailData) return;

    const doc = new jsPDF();
    const studentName = `${studentDetailData.student.firstName} ${studentDetailData.student.lastName}`;
    
    // Add Branding / Header
    doc.setFillColor(79, 70, 229); // Indigo 600
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Anecdotal Record', 14, 25);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Student: ${studentName}`, 14, 33);
    doc.text(`ID: ${studentDetailData.student.id}`, 150, 33);

    // Add Content
    doc.setTextColor(30, 41, 59); // Slate 800
    let yPos = 50;

    // School Info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const teacherName = settings?.teacherName || '';
    doc.text(`Quarter: ${selectedQuarter} | Section: ${selectedSection}`, 14, yPos);
    doc.text(`Teacher: ${teacherName || 'N/A'} | Year: ${activePeriod || 'N/A'}`, 100, yPos);
    yPos += 10;

    const tableData: any[] = [];
    
    studentDetailData.timeline.forEach(t => {
      t.sessions.forEach(s => {
        const hasComments = s.record.comments && Object.values(s.record.comments).some(v => v.trim() !== '');
        const hasAnnotation = !!s.record.annotation?.trim();
        if (hasComments || hasAnnotation || s.session.annotation || s.session.objective) {
          let commentsString = '';
          if (hasAnnotation) {
            commentsString += `General: ${s.record.annotation}\n`;
          }
          if (hasComments && s.record.comments) {
            commentsString += Object.entries(s.record.comments).filter(([_, v]) => v.trim() !== '').map(([k, v]) => `${k}: ${v}`).join('\n');
          }
          if (!commentsString) commentsString = '-';
          
          tableData.push([
            s.session.date,
            t.topic.title,
            commentsString,
            s.session.annotation || '-',
            s.session.objective || '-'
          ]);
        }
      });
    });

    if (tableData.length === 0) {
      doc.setFontSize(12);
      doc.text('No anecdotal records found for this student in the selected quarter.', 14, yPos);
    } else {
      autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Topic', 'Student Comment', 'Session Annotation', 'Session Objective']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255 },
        styles: { fontSize: 10, cellPadding: 5 },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 35 },
          2: { cellWidth: 45 },
          3: { cellWidth: 45 },
          4: { cellWidth: 40 }
        },
      });
    }

    doc.save(`${studentDetailData.student.lastName}_${studentDetailData.student.firstName}_Anecdotal.pdf`);
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render Student Detail View
  if (selectedStudentId && studentDetailData) {
    const portalTarget = document.getElementById('mobile-header-extension');

    return (
      <>
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Compact Mobile Scrolled Header */}
        {isHeaderScrolled && portalTarget && createPortal(
          <div className="flex items-center gap-2 w-full animate-in fade-in duration-200 ml-[80px]">
            <span className="font-semibold text-slate-700 text-sm truncate max-w-[200px]">
              {studentDetailData.student.firstName} {studentDetailData.student.lastName}
            </span>
            <div 
              className={`min-w-[24px] px-1.5 h-6 rounded-md flex items-center justify-center font-bold text-[11px] shrink-0 shadow-sm border cursor-pointer ${getGradeBg(studentDetailData.overallGrade)} ${getGradeColor(studentDetailData.overallGrade)}`}
              onClick={scrollToTimeline}
            >
              {studentDetailData.overallGrade !== null ? `${Math.round(studentDetailData.overallGrade)}` : '-'}
            </div>
          </div>,
          portalTarget
        )}
        
        {/* Detail Header */}
        <div ref={detailHeaderRef} className="relative bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button 
              onClick={() => setSelectedStudentId(null)}
              className="group flex items-center justify-center -mr-2 bg-slate-50 hover:bg-indigo-50 px-3 py-2 rounded-xl transition-all border border-slate-100 hover:border-indigo-200 shadow-sm shrink-0 gap-2"
              title="Back to Class Overview"
            >
              <ArrowLeft size={16} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-indigo-600 hidden sm:inline-block">Overview</span>
            </button>
            <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 sm:ml-2">
              <h2 className="text-2xl font-bold text-indigo-950 truncate">
                {studentDetailData.student.firstName} {studentDetailData.student.lastName}
              </h2>
              <p className="text-sm text-slate-500 font-medium truncate">{studentDetailData.student.id} • {selectedSection} • {selectedQuarter}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
            <div 
              onClick={scrollToTimeline}
              className={`px-4 py-2 rounded-xl border ${getGradeBg(studentDetailData.overallGrade)} flex items-center gap-2 cursor-pointer hover:bg-white/80 transition-all hover:scale-[1.02] shadow-sm flex-1 md:flex-none justify-center`}
            >
              <span className="text-sm font-medium text-slate-500 whitespace-nowrap">Quarter Grade:</span>
              <span className={`text-xl font-bold ${getGradeColor(studentDetailData.overallGrade)}`}>
                {studentDetailData.overallGrade !== null ? `${studentDetailData.overallGrade}%` : 'N/A'}
              </span>
              {studentDetailData.overallGrade !== null && studentDetailData.overallGrade > 100 && (
                <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ml-1">
                  <Star size={10} className="fill-amber-500 text-amber-500" />
                  Extra
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportStudentCSV}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-medium text-sm shadow-sm shrink-0"
                title="Export to CSV"
              >
                <Download size={16} /> <span className="hidden sm:inline">Export CSV</span>
              </button>
              <button
                onClick={exportStudentPDF}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-medium text-sm shadow-sm shrink-0"
                title="Export to PDF"
              >
                <Printer size={16} /> <span className="hidden sm:inline">Export PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex border-b border-slate-200 mb-6">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
              activeSubTab === 'overview'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-indigo-600 hover:bg-slate-50'
            }`}
          >
            Overview & History
          </button>
          <button
            onClick={() => setActiveSubTab('anecdotal')}
            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
              activeSubTab === 'anecdotal'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-indigo-600 hover:bg-slate-50'
            }`}
          >
            Anecdotal Records
          </button>
        </div>

        {activeSubTab === 'overview' ? (
          <>
            {/* Detail Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {config.participation.enabled && (
                <div 
                  onClick={scrollToTimeline}
                  className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 transition-all hover:scale-[1.02] group"
                >
                  <MessageCircle size={24} className="text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
                  <div className="text-sm font-medium text-slate-500 mb-1">Avg Participation</div>
                  <div className="text-2xl font-bold text-indigo-900">{studentDetailData.avgPart !== null ? `${studentDetailData.avgPart}%` : '--'}</div>
                </div>
              )}
              {config.behavior.enabled && (
                <div 
                  onClick={scrollToTimeline}
                  className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 transition-all hover:scale-[1.02] group"
                >
                  <Star size={24} className="text-yellow-400 mb-2 group-hover:scale-110 transition-transform" />
                  <div className="text-sm font-medium text-slate-500 mb-1">Avg Behavior</div>
                  <div className="text-2xl font-bold text-yellow-600">{studentDetailData.avgBehav !== null ? `${studentDetailData.avgBehav}%` : '--'}</div>
                </div>
              )}
              {config.classwork.enabled && (
                <div 
                  onClick={scrollToTimeline}
                  className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 transition-all hover:scale-[1.02] group"
                >
                  <CheckSquare size={24} className="text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
                  <div className="text-sm font-medium text-slate-500 mb-1">Avg Class Work</div>
                  <div className="text-2xl font-bold text-blue-600">{studentDetailData.avgClasswork !== null ? `${studentDetailData.avgClasswork}%` : '--'}</div>
                </div>
              )}
              {config.homework.enabled && (
                <div 
                  onClick={scrollToTimeline}
                  className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 transition-all hover:scale-[1.02] group"
                >
                  <BookOpen size={24} className="text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                  <div className="text-sm font-medium text-slate-500 mb-1">HW Completion</div>
                  <div className="text-2xl font-bold text-emerald-600">{studentDetailData.hwRate !== null ? `${studentDetailData.hwRate}%` : '--'}</div>
                </div>
              )}
              {config.quiz.enabled && (
                <div 
                  onClick={scrollToTimeline}
                  className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 transition-all hover:scale-[1.02] group"
                >
                  <GraduationCap size={24} className="text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
                  <div className="text-sm font-medium text-slate-500 mb-1">Quiz Average</div>
                  <div className="text-2xl font-bold text-purple-600">{studentDetailData.avgQuiz !== null ? `${studentDetailData.avgQuiz}%` : '--'}</div>
                </div>
              )}
            </div>

            {/* Timeline */}
            <div id="topic-history" className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mt-6">
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-bold text-lg text-indigo-950">Topic History</h3>
                <button 
                  onClick={() => setShowTopicHistoryModal(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-50 transition-colors"
                  title="Expand Topic History"
                >
                  <Maximize2 size={16} />
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {studentDetailData.timeline.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">No records found for this quarter.</div>
                ) : (
                  studentDetailData.timeline.map((t, idx) => {
                    const isExpanded = expandedTopics[t.topic.id] !== false; // Default to expanded
                    return (
                      <div key={idx} className="p-6">
                        <div 
                          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4 cursor-pointer hover:bg-slate-50/50 -mx-6 px-6 py-3 transition-colors group"
                          onClick={() => toggleTopic(t.topic.id)}
                        >
                          <div className="flex items-start md:items-center gap-3 w-full md:w-auto flex-1 min-w-0 pr-0 md:pr-4">
                            <div className="pt-0.5 md:pt-0 shrink-0">
                              {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                            </div>
                            <h4 className="text-lg font-bold text-indigo-950 group-hover:text-indigo-600 transition-colors leading-tight break-words">{t.topic.title}</h4>
                          </div>
                          <div className={`px-3 py-1.5 rounded-lg text-sm ${getGradeBg(t.topicScore)} ${getGradeColor(t.topicScore)} flex items-center gap-2 shadow-sm self-start md:self-auto ml-8 md:ml-0 whitespace-nowrap shrink-0 mt-1 md:mt-0`}>
                            <span className="font-semibold">Topic Score: {t.topicScore !== null ? `${t.topicScore}%` : 'N/A'}</span>
                            {t.topicScore !== null && t.topicScore > 100 && (
                              <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                                <Star size={10} className="fill-amber-500 text-amber-500" />
                                Extra
                              </span>
                            )}
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="overflow-hidden animate-in slide-in-from-top-2 duration-200">
                            <div className="hidden md:block overflow-x-auto">
                              <table className="w-full text-left text-sm">
                                <thead>
                                  <tr className="text-slate-500 border-b border-slate-100">
                                    <th className="pb-3 font-semibold">Date</th>
                                    <th className="pb-3 font-semibold">Session Code</th>
                                    <th className="pb-3 font-semibold text-center">Present</th>
                                    <th className="pb-3 font-semibold text-center">Part.</th>
                                    <th className="pb-3 font-semibold text-center">Behav.</th>
                                    <th className="pb-3 font-semibold text-center">C.W.</th>
                                    <th className="pb-3 font-semibold">Homework</th>
                                    <th className="pb-3 font-semibold text-center">Quiz</th>
                                    <th className="pb-3 font-semibold text-center">Adj.</th>
                                    <th className="pb-3 font-semibold text-center">Total</th>
                                    <th className="pb-3 font-semibold text-center">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {t.sessions.map((s, sIdx) => (
                                    <tr 
                                      key={sIdx} 
                                      onClick={() => onNavigate('tracker', selectedStudentId!, s.session.id)}
                                      className={`group cursor-pointer hover:bg-indigo-50/50 transition-colors ${!s.record.present ? 'bg-red-50/30' : ''}`}
                                      title="Click to edit this session in Record Log"
                                    >
                                      <td 
                                        className="py-3 text-slate-900 font-medium group-hover:text-indigo-600 transition-colors cursor-pointer hover:underline"
                                        onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'edit-header'); }}
                                        title="Click to edit session header"
                                      >
                                        {formatLocalDate(s.session.date)}
                                      </td>
                                      <td className="py-3 text-slate-500 font-mono text-xs select-all">{s.session.topicId}_{s.session.date}</td>
                                      <td className="py-3 text-center">
                                        {s.record.present ? (
                                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                                        ) : (
                                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                                        )}
                                      </td>
                                      <td 
                                        className="py-3 text-center text-slate-600 hover:bg-indigo-100/50 transition-colors rounded-lg font-medium"
                                        onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'participation'); }}
                                        title={s.record.comments?.participation || "Edit Participation"}
                                      >
                                        {s.record.present ? (s.record.participation ?? '-') : '-'}
                                      </td>
                                      <td 
                                        className="py-3 text-center text-slate-600 hover:bg-indigo-100/50 transition-colors rounded-lg font-medium"
                                        onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'behavior'); }}
                                        title={s.record.comments?.behavior || "Edit Behavior"}
                                      >
                                        {s.record.present ? (s.record.behavior ?? '-') : '-'}
                                      </td>
                                      <td 
                                        className="py-3 text-center text-slate-600 hover:bg-indigo-100/50 transition-colors rounded-lg font-medium"
                                        onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'classwork'); }}
                                        title={s.record.comments?.classwork || "Edit Class Work"}
                                      >
                                        {s.record.present ? (s.record.classwork ?? '-') : '-'}
                                      </td>
                                      <td 
                                        className="py-3 hover:bg-indigo-100/50 transition-colors rounded-lg"
                                        onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'homework'); }}
                                        title={s.record.comments?.homework || "Edit Homework"}
                                      >
                                        {s.record.present ? (
                                          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider
                                            ${s.record.homework === 'Submitted' || s.record.homework === 'Completed' ? 'bg-emerald-100 text-emerald-700' : ''}
                                            ${s.record.homework === 'Late' ? 'bg-amber-100 text-amber-700' : ''}
                                            ${s.record.homework === 'Incompleted' || s.record.homework === 'Incomplete' ? 'bg-orange-100 text-orange-700' : ''}
                                            ${s.record.homework === 'Not Submitted' ? 'bg-rose-100 text-rose-700' : ''}
                                            ${s.record.homework === 'None Assigned' || s.record.homework === 'N/A' ? 'text-slate-400 bg-slate-50' : ''}
                                          `}>
                                            {s.record.homework === 'None Assigned' ? 'N/A' : s.record.homework}
                                          </span>
                                        ) : '-'}
                                      </td>
                                      <td 
                                        className="py-3 text-center hover:bg-indigo-100/50 transition-colors rounded-lg"
                                        onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'quiz'); }}
                                        title={s.record.comments?.quiz || "Edit Quiz"}
                                      >
                                        {s.record.present ? (
                                          s.record.quizStatus === 'Graded' || (!s.record.quizStatus && s.record.quiz !== undefined) ? (
                                            <span className="font-bold text-indigo-600 text-base">{s.record.quiz}%</span>
                                          ) : (
                                            <span className="text-xs font-medium text-slate-500 bg-slate-50 px-2 py-1 rounded-md">{s.record.quizStatus || 'None'}</span>
                                          )
                                        ) : '-'}
                                      </td>
                                      <td 
                                        className="py-3 text-center text-sm hover:bg-indigo-100/50 transition-colors rounded-lg"
                                        onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'adjustments'); }}
                                        title={s.record.comments?.extra || "Edit Adjustments"}
                                      >
                                        {s.record.present ? (
                                          <>
                                            {s.record.extraPoints ? <span className="text-emerald-600 font-bold">+{s.record.extraPoints} </span> : ''}
                                            {s.record.punishment ? <span className="text-rose-600 font-bold">-{s.record.punishment}</span> : ''}
                                            {!s.record.extraPoints && !s.record.punishment && <span className="text-slate-300">-</span>}
                                          </>
                                        ) : '-'}
                                      </td>
                                      <td className="py-3 text-center font-bold text-indigo-900">
                                        {s.record.present ? (
                                          <>{calculateSessionScore(s.record, s.session.records, settings)} <span className="text-xs text-indigo-400">/ {getTotalSessionWeight(settings)}</span></>
                                        ) : '-'}
                                      </td>
                                      <td className="py-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id); }}
                                            className="text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors !cursor-pointer pointer-events-auto"
                                          >
                                            Record Log
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (!onRemoveStudentFromSession) return;
                                              setConfirmModal({
                                                isOpen: true,
                                                title: 'Exclude Student from Session',
                                                message: 'Are you sure you want to exclude this student from this session? Their grade will no longer be affected by this session.',
                                                onConfirm: async () => {
                                                  try {
                                                    await onRemoveStudentFromSession(s.session.id, selectedStudentId!);
                                                  } catch (err) {
                                                    console.error(err);
                                                  }
                                                }
                                              });
                                            }}
                                            className="text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 p-1.5 rounded-lg transition-colors !cursor-pointer pointer-events-auto"
                                            title="Exclude Student from Session"
                                          >
                                            <UserMinus size={16} />
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (!onDeleteSession) return;
                                              setConfirmModal({
                                                isOpen: true,
                                                title: 'Delete Session',
                                                message: 'Are you sure you want to delete this session? This will remove records for all students.',
                                                onConfirm: async () => {
                                                  try {
                                                    await onDeleteSession(s.session.id);
                                                  } catch (err) {
                                                    console.error(err);
                                                  }
                                                }
                                              });
                                            }}
                                            className="text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 p-1.5 rounded-lg transition-colors !cursor-pointer pointer-events-auto"
                                            title="Remove Session"
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            
                            {/* Mobile Card View for Topic History */}
                            <div className="md:hidden space-y-3 mt-4">
                              {t.sessions.map((s, sIdx) => (
                                <div 
                                  key={sIdx} 
                                  onClick={() => onNavigate('tracker', selectedStudentId!, s.session.id)}
                                  className={`p-4 rounded-2xl border border-slate-100 cursor-pointer active:scale-[0.98] transition-all ${!s.record.present ? 'bg-rose-50/50' : 'bg-slate-50 hover:bg-slate-100/50'}`}
                                >
                                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                                    <div className="flex flex-col">
                                      <span 
                                        className="font-semibold text-slate-800 text-lg cursor-pointer hover:text-indigo-600 hover:underline"
                                        onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'edit-header'); }}
                                        title="Click to edit session header"
                                      >
                                        {formatLocalDate(s.session.date)}
                                      </span>
                                      <span className="text-xs font-mono text-slate-500 select-all">{s.session.topicId}_{s.session.date}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      {s.record.present ? (
                                        <span className="text-xs font-medium px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full shrink-0">Present</span>
                                      ) : (
                                        <span className="text-xs font-medium px-2 py-1 bg-rose-100 text-rose-700 rounded-full shrink-0">Absent</span>
                                      )}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!onDeleteSession) return;
                                          setConfirmModal({
                                            isOpen: true,
                                            title: 'Delete Session',
                                            message: 'Are you sure you want to delete this session? This will remove records for all students.',
                                            onConfirm: async () => {
                                              try {
                                                await onDeleteSession(s.session.id);
                                              } catch (err) {
                                                console.error(err);
                                              }
                                            }
                                          });
                                        }}
                                        className="text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 p-1.5 rounded-lg transition-colors shrink-0 !cursor-pointer pointer-events-auto"
                                        title="Remove Session"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </div>
                                  {s.record.present && (
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                      <div 
                                        className="p-1 hover:bg-indigo-50 rounded transition-colors"
                                        onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'participation'); }}
                                      >
                                        <span className="text-slate-500">Part:</span> {s.record.participation ?? '-'}
                                      </div>
                                      <div 
                                        className="p-1 hover:bg-indigo-50 rounded transition-colors"
                                        onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'behavior'); }}
                                      >
                                        <span className="text-slate-500">Behav:</span> {s.record.behavior ?? '-'}
                                      </div>
                                      <div 
                                        className="p-1 hover:bg-indigo-50 rounded transition-colors"
                                        onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'classwork'); }}
                                      >
                                        <span className="text-slate-500">C.W.:</span> {s.record.classwork ?? '-'}
                                      </div>
                                      <div 
                                        className="p-1 hover:bg-indigo-50 rounded transition-colors"
                                        onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'homework'); }}
                                      >
                                        <span className="text-slate-500">HW:</span>{' '}
                                        <span className={`text-xs font-medium
                                          ${s.record.homework === 'Submitted' || s.record.homework === 'Completed' ? 'text-green-700' : ''}
                                          ${s.record.homework === 'Late' ? 'text-yellow-700' : ''}
                                          ${s.record.homework === 'Incompleted' || s.record.homework === 'Incomplete' ? 'text-orange-700' : ''}
                                          ${s.record.homework === 'Not Submitted' ? 'text-red-700' : ''}
                                          ${s.record.homework === 'None Assigned' || s.record.homework === 'N/A' ? 'text-gray-400' : ''}
                                        `}>
                                          {s.record.homework === 'None Assigned' ? 'N/A' : s.record.homework}
                                        </span>
                                      </div>
                                      <div 
                                        className="p-1 hover:bg-indigo-50 rounded transition-colors"
                                        onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'quiz'); }}
                                      >
                                        <span className="text-slate-500">Quiz:</span>{' '}
                                        {s.record.quizStatus === 'Graded' || (!s.record.quizStatus && s.record.quiz !== undefined) ? (
                                          <span className="font-bold text-indigo-600">{s.record.quiz}%</span>
                                        ) : (
                                          <span className="text-xs text-gray-500">{s.record.quizStatus || 'None'}</span>
                                        )}
                                      </div>
                                      {(s.record.extraPoints || s.record.punishment) ? (
                                        <div 
                                          className="col-span-2 p-1 hover:bg-indigo-50 rounded transition-colors"
                                          onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'adjustments'); }}
                                        >
                                          <span className="text-slate-500">Adj:</span>{' '}
                                          {s.record.extraPoints ? <span className="text-green-600 font-bold">+{s.record.extraPoints} </span> : ''}
                                          {s.record.punishment ? <span className="text-red-600 font-bold">-{s.record.punishment}</span> : ''}
                                        </div>
                                      ) : null}
                                      <div className="col-span-2 p-1 bg-indigo-50 rounded font-bold text-indigo-900 text-center mt-1">
                                        Total: {calculateSessionScore(s.record, s.session.records, settings)} / {getTotalSessionWeight(settings)} pts
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        ) : activeSubTab === 'anecdotal' ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-lg text-indigo-950 flex items-center gap-2">
                <FileText size={20} className="text-indigo-600" />
                Anecdotal Records
              </h3>
              <button
                onClick={exportAnecdoticPDF}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium shadow-sm"
              >
                <Printer size={16} /> Print PDF
              </button>
            </div>
            <div className="p-6">
              {studentDetailData.timeline.every(t => t.sessions.every(s => {
                const hasComments = s.record.comments && Object.values(s.record.comments).some(v => v.trim() !== '');
                const hasAnnotation = !!s.record.annotation?.trim();
                return !hasComments && !hasAnnotation && !s.session.annotation && !s.session.objective;
              })) ? (
                <div className="text-center py-16 text-slate-500">
                  <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageCircle size={32} className="text-slate-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-indigo-950 mb-1">No Records Found</h3>
                  <p>No anecdotal records found for this student.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {studentDetailData.timeline.map((t, idx) => {
                    const sessionsWithNotes = t.sessions.filter(s => {
                      const hasComments = s.record.comments && Object.values(s.record.comments).some(v => v.trim() !== '');
                      const hasAnnotation = !!s.record.annotation?.trim();
                      return hasComments || hasAnnotation || s.session.annotation || s.session.objective;
                    });
                    if (sessionsWithNotes.length === 0) return null;

                    return (
                      <div key={idx} className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                        <div className="px-5 py-3 bg-white border-b border-slate-100 font-semibold text-slate-800">
                          {t.topic.title}
                        </div>
                        <div className="divide-y divide-slate-100 bg-white">
                          {sessionsWithNotes.map((s, sIdx) => (
                            <div key={sIdx} className="p-5">
                              <div className="text-sm font-bold text-indigo-600 mb-3">{formatLocalDate(s.session.date)}</div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(s.record.comments && Object.values(s.record.comments).some(v => v.trim() !== '') || s.record.annotation) && (
                                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Student Comment</div>
                                    <div className="text-slate-700 text-sm whitespace-pre-wrap space-y-1">
                                      {s.record.annotation && (
                                        <div className="mb-2">
                                          <span className="font-semibold capitalize text-slate-600">General:</span> {s.record.annotation}
                                        </div>
                                      )}
                                      {s.record.comments && Object.entries(s.record.comments).filter(([_, v]) => v.trim() !== '').map(([key, value]) => (
                                        <div key={key}>
                                          <span className="font-semibold capitalize text-slate-600">{key}:</span> {value}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {s.session.objective && (
                                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Session Objective</div>
                                    <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{s.session.objective}</p>
                                  </div>
                                )}
                                {s.session.annotation && (
                                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Session Annotation</div>
                                    <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{s.session.annotation}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {showTopicHistoryModal && (
          <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="px-6 py-4 border-b border-slate-100 bg-white flex justify-between items-start sm:items-center sticky top-0 z-10 gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 hidden sm:flex">
                    <BookOpen size={24} />
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-xl font-bold text-slate-800 leading-tight">
                      Topic History
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-sm font-semibold text-slate-700">
                        {studentDetailData.student.lastName}, {studentDetailData.student.firstName}
                      </span>
                      <span className="text-slate-300 hidden sm:inline">•</span>
                      <span className="text-sm text-slate-500">{selectedSection}</span>
                      <span className="text-slate-300 hidden sm:inline">•</span>
                      <div className={`px-2 py-0.5 rounded-md text-xs font-bold border ${getGradeBg(studentDetailData.overallGrade)} ${getGradeColor(studentDetailData.overallGrade)}`}>
                        {studentDetailData.overallGrade !== null ? `${studentDetailData.overallGrade}%` : 'N/A'} AVG
                      </div>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setShowTopicHistoryModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50 custom-scrollbar">
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden min-h-full">
                  <div className="divide-y divide-slate-100">
                    {studentDetailData.timeline.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">No records found for this quarter.</div>
                    ) : (
                      studentDetailData.timeline.map((t, idx) => {
                        const isExpanded = expandedTopics[t.topic.id] !== false; // Default to expanded
                        return (
                          <div key={idx} className="p-6">
                            <div 
                              className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4 cursor-pointer hover:bg-slate-50/50 -mx-6 px-6 py-3 transition-colors group"
                              onClick={() => toggleTopic(t.topic.id)}
                            >
                              <div className="flex items-start md:items-center gap-3 w-full md:w-auto flex-1 min-w-0 pr-0 md:pr-4">
                                <div className="pt-0.5 md:pt-0 shrink-0">
                                  {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                                </div>
                                <h4 className="text-lg font-bold text-indigo-950 group-hover:text-indigo-600 transition-colors leading-tight break-words">{t.topic.title}</h4>
                              </div>
                              <div className={`px-3 py-1.5 rounded-lg text-sm ${getGradeBg(t.topicScore)} ${getGradeColor(t.topicScore)} flex items-center gap-2 shadow-sm self-start md:self-auto ml-8 md:ml-0 whitespace-nowrap shrink-0 mt-1 md:mt-0`}>
                                <span className="font-semibold">Topic Score: {t.topicScore !== null ? `${t.topicScore}%` : 'N/A'}</span>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="overflow-hidden animate-in slide-in-from-top-2 duration-200">
                                <div className="hidden md:block overflow-x-auto">
                                  <table className="w-full text-left text-sm">
                                    <thead>
                                      <tr className="text-slate-500 border-b border-slate-100">
                                        <th className="pb-3 font-semibold">Date</th>
                                        <th className="pb-3 font-semibold text-center">Present</th>
                                        <th className="pb-3 font-semibold text-center">Part.</th>
                                        <th className="pb-3 font-semibold text-center">Behav.</th>
                                        <th className="pb-3 font-semibold text-center">C.W.</th>
                                        <th className="pb-3 font-semibold">Homework</th>
                                        <th className="pb-3 font-semibold text-center">Quiz</th>
                                        <th className="pb-3 font-semibold text-center">Adj.</th>
                                        <th className="pb-3 font-semibold text-center">Total</th>
                                        <th className="pb-3 font-semibold text-center">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                      {t.sessions.map((s, sIdx) => (
                                        <tr 
                                          key={sIdx} 
                                          onClick={() => onNavigate('tracker', selectedStudentId!, s.session.id)}
                                          className={`group cursor-pointer hover:bg-indigo-50/50 transition-colors ${!s.record.present ? 'bg-red-50/30' : ''}`}
                                          title="Click to edit this session in Record Log"
                                        >
                                          <td 
                                            className="py-3 text-slate-900 font-medium group-hover:text-indigo-600 transition-colors cursor-pointer hover:underline"
                                            onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'edit-header'); }}
                                            title="Click to edit session header"
                                          >
                                            {formatLocalDate(s.session.date)}
                                          </td>
                                          <td className="py-3 text-center">
                                            {s.record.present ? (
                                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                                            ) : (
                                              <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                                            )}
                                          </td>
                                          <td 
                                            className="py-3 text-center text-slate-600 hover:bg-indigo-100/50 transition-colors rounded-lg font-medium"
                                            onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'participation'); }}
                                            title={s.record.comments?.participation || "Edit Participation"}
                                          >
                                            {s.record.present ? (s.record.participation ?? '-') : '-'}
                                          </td>
                                          <td 
                                            className="py-3 text-center text-slate-600 hover:bg-indigo-100/50 transition-colors rounded-lg font-medium"
                                            onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'behavior'); }}
                                            title={s.record.comments?.behavior || "Edit Behavior"}
                                          >
                                            {s.record.present ? (s.record.behavior ?? '-') : '-'}
                                          </td>
                                          <td 
                                            className="py-3 text-center text-slate-600 hover:bg-indigo-100/50 transition-colors rounded-lg font-medium"
                                            onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'classwork'); }}
                                            title={s.record.comments?.classwork || "Edit Class Work"}
                                          >
                                            {s.record.present ? (s.record.classwork ?? '-') : '-'}
                                          </td>
                                          <td 
                                            className="py-3 hover:bg-indigo-100/50 transition-colors rounded-lg"
                                            onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'homework'); }}
                                            title={s.record.comments?.homework || "Edit Homework"}
                                          >
                                            {s.record.present ? s.record.homework : '-'}
                                          </td>
                                          <td 
                                            className="py-3 text-center hover:bg-indigo-100/50 transition-colors rounded-lg"
                                            onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'quiz'); }}
                                            title={s.record.comments?.quiz || "Edit Quiz"}
                                          >
                                            {s.record.present ? (
                                              s.record.quizStatus === 'Graded' || (!s.record.quizStatus && s.record.quiz !== undefined) ? (
                                                <span className="font-bold text-indigo-600">{s.record.quiz}%</span>
                                              ) : (
                                                <span className="text-xs text-gray-500">{s.record.quizStatus || 'None'}</span>
                                              )
                                            ) : '-'}
                                          </td>
                                          <td 
                                            className="py-3 text-center text-sm hover:bg-indigo-100/50 transition-colors rounded-lg"
                                            onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id, 'adjustments'); }}
                                            title={s.record.comments?.extra || "Edit Adjustments"}
                                          >
                                            {s.record.present ? (
                                              <>
                                                {s.record.extraPoints ? <span className="text-emerald-600 font-bold">+{s.record.extraPoints} </span> : ''}
                                                {s.record.punishment ? <span className="text-rose-600 font-bold">-{s.record.punishment}</span> : ''}
                                                {!s.record.extraPoints && !s.record.punishment && <span className="text-slate-300">-</span>}
                                              </>
                                            ) : '-'}
                                          </td>
                                          <td className="py-3 text-center font-bold text-indigo-900">
                                            {s.record.present ? (
                                              <>{calculateSessionScore(s.record, s.session.records, settings)} <span className="text-xs text-indigo-400">/ {getTotalSessionWeight(settings)}</span></>
                                            ) : '-'}
                                          </td>
                                          <td className="py-3 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                              <button
                                                onClick={(e) => { e.stopPropagation(); onNavigate('tracker', selectedStudentId!, s.session.id); }}
                                                className="text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors !cursor-pointer pointer-events-auto"
                                              >
                                                Record Log
                                              </button>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (!onRemoveStudentFromSession) return;
                                                  setConfirmModal({
                                                    isOpen: true,
                                                    title: 'Exclude Student from Session',
                                                    message: 'Are you sure you want to exclude this student from this session? Their grade will no longer be affected by this session.',
                                                    onConfirm: async () => {
                                                      try {
                                                        await onRemoveStudentFromSession(s.session.id, selectedStudentId!);
                                                      } catch (err) {
                                                        console.error(err);
                                                      }
                                                    }
                                                  });
                                                }}
                                                className="text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 p-1.5 rounded-lg transition-colors !cursor-pointer pointer-events-auto"
                                                title="Exclude Student from Session"
                                              >
                                                <UserMinus size={16} />
                                              </button>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (!onDeleteSession) return;
                                                  setConfirmModal({
                                                    isOpen: true,
                                                    title: 'Delete Session',
                                                    message: 'Are you sure you want to delete this session? This will remove records for all students.',
                                                    onConfirm: async () => {
                                                      try {
                                                        await onDeleteSession(s.session.id);
                                                      } catch (err) {
                                                        console.error(err);
                                                      }
                                                    }
                                                  });
                                                }}
                                                className="text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 p-1.5 rounded-lg transition-colors !cursor-pointer pointer-events-auto"
                                                title="Remove Session"
                                              >
                                                <Trash2 size={16} />
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </>
    );
  }

  // Render Class Overview View
  return (
    <>
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] shadow-sm p-6 md:p-8">
        {/* Main Tabs */}
        <div className="flex border-b border-slate-100 mb-8">
          <button
            onClick={() => setMainTab('grades')}
            className={`px-6 py-3 font-semibold text-sm transition-colors border-b-2 ${
              mainTab === 'grades'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-indigo-600 hover:bg-slate-50'
            }`}
          >
            Grades & Topics
          </button>
          <button
            onClick={() => setMainTab('comments_reminders')}
            className={`px-6 py-3 font-semibold text-sm transition-colors border-b-2 ${
              mainTab === 'comments_reminders'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-indigo-600 hover:bg-slate-50'
            }`}
          >
            Comments & Reminders
          </button>
        </div>

        {mainTab === 'grades' ? (
          <>
            {/* File Explorer Tree */}
            <div className="bg-slate-50/80 p-6 rounded-3xl border border-slate-100 mb-8 flex flex-col gap-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-lg text-indigo-950 flex items-center gap-2">
                  <span className="text-amber-400">📁</span> Class Explorer
                </h3>
                <div className="flex gap-3">
                  <button
                    onClick={exportClassCSV}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-semibold text-sm shadow-sm"
                    title="Export Gradebook CSV"
                  >
                    <Download size={16} /> <span>CSV</span>
                  </button>
                  <button
                    onClick={exportClassPDF}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-semibold text-sm shadow-sm"
                    title="Export Gradebook PDF"
                  >
                    <Printer size={16} /> <span>PDF</span>
                  </button>
                </div>
              </div>
              
              <div className="bg-white rounded-2xl border border-slate-200 p-4 max-h-96 overflow-y-auto">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2">
                  Navigate Class Hierarchy
                </div>
                <div className="-ml-4">
                  {renderExplorerTree(explorerTree, '')}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2 px-2">
                Select a Section (📁) to view its Quarter Gradebook below. Click a Session (🕒) to view its Record Log.
              </p>
            </div>

            {/* Class Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div 
              onClick={() => setFilterMode(null)}
              className={`p-1.5 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] ${filterMode === null ? 'bg-indigo-100/80 shadow-md shadow-indigo-200/50' : 'bg-slate-100/50 hover:bg-indigo-50/80'}`}
            >
              <div className="bg-white rounded-xl p-4 h-full flex flex-col items-center justify-center text-center shadow-sm border border-slate-100">
                <div className="text-sm font-medium text-slate-500 mb-2 flex items-center gap-1.5"><TrendingUp size={16} className="text-slate-400"/> <span>Class Average</span></div>
                <div className={`text-4xl font-bold ${getGradeColor(classMetrics.average)}`}>
                  {classMetrics.average !== null ? `${classMetrics.average}%` : '--'}
                </div>
              </div>
            </div>
            <div 
              onClick={() => setFilterMode(null)}
              className={`p-1.5 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] ${filterMode === null ? 'bg-indigo-100/80 shadow-md shadow-indigo-200/50' : 'bg-slate-100/50 hover:bg-indigo-50/80'}`}
            >
              <div className="bg-white rounded-xl p-4 h-full flex flex-col items-center justify-center text-center shadow-sm border border-slate-100">
                <div className="text-sm font-medium text-slate-500 mb-2 flex items-center gap-1.5"><User size={16} className="text-slate-400"/> <span>Total Students</span></div>
                <div className="text-4xl font-bold text-indigo-950">{classMetrics.totalStudents}</div>
              </div>
            </div>
            <div 
              onClick={() => setFilterMode('topPerformers')}
              className={`p-1.5 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] ${filterMode === 'topPerformers' ? 'bg-emerald-100/80 shadow-md shadow-emerald-200/50' : 'bg-slate-100/50 hover:bg-emerald-50/80'}`}
            >
              <div className="bg-white rounded-xl p-4 h-full flex flex-col items-center justify-center text-center shadow-sm border border-slate-100">
                <div className="text-sm font-medium text-slate-500 mb-2 flex items-center gap-1.5"><CheckCircle size={16} className="text-slate-400"/> <span>Top Performers</span></div>
                <div className="text-4xl font-bold text-emerald-600">{classMetrics.topPerformers}</div>
              </div>
            </div>
            <div 
              onClick={() => setFilterMode('atRisk')}
              className={`p-1.5 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] ${filterMode === 'atRisk' ? 'bg-rose-100/80 shadow-md shadow-rose-200/50' : 'bg-slate-100/50 hover:bg-rose-50/80'}`}
            >
              <div className="bg-white rounded-xl p-4 h-full flex flex-col items-center justify-center text-center shadow-sm border border-slate-100">
                <div className="text-sm font-medium text-slate-500 mb-2 flex items-center gap-1.5"><AlertCircle size={16} className="text-slate-400"/> <span>At Risk</span></div>
                <div className="text-4xl font-bold text-rose-600">{classMetrics.atRisk}</div>
              </div>
            </div>
          </div>

      {/* Gradebook Table */}
      <div className={`${isFullScreen ? 'fixed inset-0 z-50 bg-slate-50/95 backdrop-blur-xl p-4 md:p-8 overflow-y-auto' : 'bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden'}`}>
        <div className={`px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${isFullScreen ? 'rounded-t-3xl bg-white' : ''}`}>
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-lg text-indigo-950">Quarter Gradebook</h3>
            {filterMode === 'atRisk' && (
              <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
                <AlertCircle size={12} /> At Risk Filter Active
                <button onClick={() => setFilterMode(null)} className="ml-1 hover:text-rose-900">
                  &times;
                </button>
              </span>
            )}
            {filterMode === 'topPerformers' && (
              <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
                <CheckCircle size={12} /> Top Performers Filter Active
                <button onClick={() => setFilterMode(null)} className="ml-1 hover:text-emerald-900">
                  &times;
                </button>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-lg">Click a row for details</span>
            <button 
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-colors"
              title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
            >
              {isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>
        </div>
        
        {sortedGradebookData.length === 0 ? (
          <div className="p-16 text-center">
            <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <User size={32} className="text-slate-300" />
            </div>
            <h3 className="text-lg font-semibold text-indigo-950 mb-1">No Students Found</h3>
            <p className="text-slate-500">
              {filterMode === 'atRisk' ? 'No students are currently at risk in this cohort.' : 'There are no students registered in this cohort.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden pb-4">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th 
                      className="px-5 py-4 font-semibold text-slate-600 text-xs uppercase tracking-wider sticky left-0 bg-slate-50/80 backdrop-blur-md z-10 shadow-[1px_0_0_0_rgba(241,245,249,1)] cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => requestSort('student')}
                    >
                      <div className="flex items-center gap-1">
                        Student {sortConfig?.key === 'student' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                    </th>
                    <th 
                      className="px-5 py-4 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center border-r border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => requestSort('qGrade')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Q. Grade {sortConfig?.key === 'qGrade' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                    </th>
                    <th 
                      className="px-5 py-4 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center border-r border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => requestSort('qExam')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Q. Exam {sortConfig?.key === 'qExam' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                    </th>
                    <th 
                      className="px-5 py-4 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center border-r border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => requestSort('absences')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Absences {sortConfig?.key === 'absences' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                    </th>
                    {filteredTopics.length === 0 ? (
                      <th className="px-5 py-4 font-semibold text-slate-400 text-xs uppercase tracking-wider italic text-center">No topics yet</th>
                    ) : (
                      filteredTopics.map(t => (
                        <th 
                          key={t.id} 
                          className="px-5 py-4 font-semibold text-slate-600 text-xs uppercase tracking-wider text-center cursor-pointer hover:bg-slate-100 hover:text-indigo-600 transition-colors" 
                          title={`Sort by ${t.title}`}
                          onClick={() => requestSort(t.id)}
                        >
                          <div className="flex flex-col items-center justify-center gap-1 min-w-[80px] max-w-[120px] break-words">
                            <div>{t.title} {sortConfig?.key === t.id && (sortConfig.direction === 'asc' ? '↑' : '↓')}</div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setSelectedTopicId(t.id); }}
                                className="text-[10px] text-indigo-500 hover:text-indigo-700 underline"
                              >
                                Details
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!onDeleteTopic) return;
                                  setConfirmModal({
                                    isOpen: true,
                                    title: 'Delete Topic',
                                    message: `Are you sure you want to delete topic "${t.title}"? This will permanently remove all related sessions and grades.`,
                                    onConfirm: async () => {
                                      try {
                                        await onDeleteTopic(t.id);
                                      } catch (err) {
                                        console.error(err);
                                      }
                                    }
                                  });
                                }}
                                className="text-[10px] text-rose-500 hover:text-rose-700 underline"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedGradebookData.map((data, idx) => (
                    <tr 
                      key={data.student.id} 
                      onClick={() => setSelectedStudentId(data.student.id)}
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-4 sticky left-0 bg-white group-hover:bg-slate-50/50 z-10 shadow-[1px_0_0_0_rgba(241,245,249,1)] transition-colors">
                        <div className="font-semibold text-slate-800 break-words max-w-[150px]">{data.student.lastName}, {data.student.firstName}</div>
                        <div className="text-xs text-slate-500">{data.student.id}</div>
                      </td>
                      <td className="px-5 py-4 text-center border-r border-slate-100">
                        <div 
                          className="flex flex-col items-center justify-center gap-1 cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => setSelectedStudentId(data.student.id)}
                          title="Click to view student details"
                        >
                          <span className={`inline-flex items-center justify-center px-3 py-1 rounded-xl font-bold text-lg ${getGradeBg(data.quarterGrade)} ${getGradeColor(data.quarterGrade)}`}>
                            {data.quarterGrade !== null ? `${data.quarterGrade}%` : '--'}
                          </span>
                          {data.quarterGrade !== null && data.quarterGrade > 100 && (
                            <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-0.5">
                              <Star size={8} className="fill-amber-500 text-amber-500" />
                              Extra
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center border-r border-slate-100">
                        <span 
                          onClick={(e) => {
                            if (data.quarterExamSessionId) {
                              e.stopPropagation();
                              onNavigate('tracker', data.student.id, data.quarterExamSessionId, 'quiz');
                            }
                          }}
                          className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-semibold ${getGradeBg(data.quarterExamScore)} ${getGradeColor(data.quarterExamScore)} shadow-sm border border-slate-100/50 ${data.quarterExamSessionId ? 'cursor-pointer hover:ring-2 hover:ring-indigo-400 hover:scale-110 transition-all' : ''}`}
                          title={data.quarterExamSessionId ? "Click to edit Quarter Exam score" : ""}
                        >
                          {data.quarterExamScore !== null ? `${data.quarterExamScore}%` : '-'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center border-r border-slate-100">
                        <span className={`font-semibold text-lg ${data.totalAbsences > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {data.totalAbsences}
                        </span>
                      </td>
                      {filteredTopics.length === 0 ? (
                        <td className="px-5 py-4 text-center text-slate-300">-</td>
                      ) : (
                        filteredTopics.map(t => {
                          const score = data.topicScores[t.id];
                          return (
                            <td 
                              key={t.id} 
                              className="px-5 py-4 text-center hover:bg-indigo-50/50 transition-colors cursor-pointer"
                              onClick={(e) => handleGradeClick(e, data.student.id, t.id)}
                              title="Click to view details"
                            >
                              <span className={`font-semibold text-lg ${getGradeColor(score)}`}>
                                {score !== null ? `${score}%` : '-'}
                              </span>
                            </td>
                          );
                        })
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View for Gradebook */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredGradebookData.map((data) => (
                <div 
                  key={data.student.id}
                  onClick={() => setSelectedStudentId(data.student.id)}
                  className="p-5 hover:bg-slate-50/50 transition-colors cursor-pointer"
                >
                  <div className="flex justify-between items-start gap-3 mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-lg truncate">{data.student.lastName}, {data.student.firstName}</div>
                      <div className="text-sm text-slate-500 truncate">{data.student.id}</div>
                    </div>
                    <div 
                      className={`px-3 py-1.5 rounded-xl text-center flex flex-col items-center justify-center shrink-0 ${getGradeBg(data.quarterGrade)} cursor-pointer hover:scale-105 transition-transform`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedStudentId(data.student.id);
                      }}
                      title="Click to view student details"
                    >
                      <div className="text-[10px] font-bold uppercase text-slate-500 mb-0.5">Q. Grade</div>
                      <div className={`text-xl font-bold ${getGradeColor(data.quarterGrade)}`}>
                        {data.quarterGrade !== null ? `${data.quarterGrade}%` : '--'}
                      </div>
                      {data.quarterGrade !== null && data.quarterGrade > 100 && (
                        <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-0.5 mt-1">
                          <Star size={8} className="fill-amber-500 text-amber-500" />
                          Extra
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-500 block text-xs font-medium mb-1">Absences</span>
                      <span className={`font-semibold text-lg ${data.totalAbsences > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                        {data.totalAbsences}
                      </span>
                    </div>
                    {filteredTopics.slice(0, 3).map(t => {
                      const score = data.topicScores[t.id];
                      return (
                        <div 
                          key={t.id} 
                          className="bg-slate-50 p-3 rounded-xl border border-slate-100 hover:bg-indigo-50/50 transition-colors cursor-pointer"
                          onClick={(e) => handleGradeClick(e, data.student.id, t.id)}
                          title="Click to view details"
                        >
                          <span className="text-slate-500 block text-xs font-medium mb-1 truncate" title={t.title}>{t.title}</span>
                          <span className={`font-semibold text-lg ${getGradeColor(score)}`}>
                            {score !== null ? `${score}%` : '-'}
                          </span>
                        </div>
                      );
                    })}
                    {filteredTopics.length > 3 && (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-center text-slate-400 text-xs font-medium">
                        +{filteredTopics.length - 3} more topics
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </>
      ) : mainTab === 'comments_reminders' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Notes Section */}
            <div className="bg-slate-50/80 p-6 rounded-3xl border border-slate-100">
              <h3 className="text-lg font-bold text-indigo-950 mb-4 flex items-center gap-2">
                <FileText className="text-indigo-500" size={20} />
                Saved Notes
              </h3>
              {reminders.filter(r => r.type === 'note').length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-100 border-dashed">
                  <FileText size={48} className="mx-auto text-slate-300 mb-4" />
                  <h4 className="text-lg font-medium text-indigo-950 mb-1">No Notes Yet</h4>
                  <p className="text-sm text-slate-500">You can add notes using the floating button.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {[...reminders].filter(r => r.type === 'note').sort((a, b) => b.createdAt - a.createdAt).map(note => (
                    <div key={note.id} className="p-5 rounded-2xl border shadow-sm transition-all bg-white border-slate-100">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className="font-semibold text-lg text-indigo-950">
                              {note.title}
                            </h4>
                            <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100">
                              {new Date(note.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          {note.context && (
                            <div className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md inline-block mb-2">
                              {note.context}
                            </div>
                          )}
                          {note.description && (
                            <p className="text-sm mt-2 text-slate-600">
                              {note.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Delete Note',
                                message: 'Are you sure you want to delete this note?',
                                onConfirm: () => {
                                  if (onDeleteReminder) onDeleteReminder(note.id);
                                }
                              });
                            }}
                            className="p-2.5 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-xl transition-colors"
                            title="Delete note"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reminders Section */}
            <div className="bg-slate-50/80 p-6 rounded-3xl border border-slate-100">
              <h3 className="text-lg font-bold text-indigo-950 mb-4 flex items-center gap-2">
                <CalendarCheck className="text-indigo-500" size={20} />
                Stored Reminders
              </h3>
              {reminders.filter(r => r.type !== 'note').length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-100 border-dashed">
                  <CalendarCheck size={48} className="mx-auto text-slate-300 mb-4" />
                  <h4 className="text-lg font-medium text-indigo-950 mb-1">No Reminders Yet</h4>
                  <p className="text-sm text-slate-500">You can add reminders using the floating button.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {[...reminders].filter(r => r.type !== 'note').sort((a, b) => b.createdAt - a.createdAt).map(reminder => (
                    <div key={reminder.id} className={`p-5 rounded-2xl border shadow-sm transition-all ${reminder.completed ? 'bg-slate-50/50 border-slate-200/50 opacity-75' : 'bg-white border-slate-100'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className={`font-semibold text-lg ${reminder.completed ? 'text-slate-500 line-through' : 'text-indigo-950'}`}>
                              {reminder.title}
                            </h4>
                            {reminder.date && (
                              <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100">
                                {formatLocalDate(reminder.date)}
                              </span>
                            )}
                          </div>
                          {reminder.context && (
                            <div className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md inline-block mb-2">
                              {reminder.context}
                            </div>
                          )}
                          {reminder.description && (
                            <p className={`text-sm mt-2 ${reminder.completed ? 'text-slate-400' : 'text-slate-600'}`}>
                              {reminder.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => onSaveReminder && onSaveReminder({ ...reminder, completed: !reminder.completed })}
                            className={`p-2.5 rounded-xl transition-colors ${reminder.completed ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-indigo-600'}`}
                            title={reminder.completed ? "Mark as incomplete" : "Mark as complete"}
                          >
                            <CalendarCheck size={18} />
                          </button>
                          <button
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Delete Reminder',
                                message: 'Are you sure you want to delete this reminder?',
                                onConfirm: () => {
                                  if (onDeleteReminder) onDeleteReminder(reminder.id);
                                }
                              });
                            }}
                            className="p-2.5 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-xl transition-colors"
                            title="Delete reminder"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Comments Section */}
          <div className="bg-slate-50/80 p-6 rounded-3xl border border-slate-100">
            <h3 className="text-lg font-bold text-indigo-950 mb-4 flex items-center gap-2">
              <MessageCircle className="text-indigo-500" size={20} />
              Session Comments
            </h3>
            <div className="space-y-4">
              {sessions
                .filter(s => {
                  const topic = topics.find(t => t.id === s.topicId);
                  return topic && topic.quarter === selectedQuarter && topic.section === selectedSection;
                })
                .sort((a, b) => {
                  const [aYear, aMonth, aDay] = a.date.split('-');
                  const [bYear, bMonth, bDay] = b.date.split('-');
                  return new Date(Number(bYear), Number(bMonth) - 1, Number(bDay)).getTime() - new Date(Number(aYear), Number(aMonth) - 1, Number(aDay)).getTime();
                })
                .map(session => {
                  const topic = topics.find(t => t.id === session.topicId);
                  const comments = session.records.filter(r => (r.comments && Object.values(r.comments).some(c => c && c.trim().length > 0)) || (r.annotation && r.annotation.trim().length > 0));
                  
                  if (comments.length === 0 && !session.annotation && !session.objective) return null;

                  return (
                    <div 
                      key={session.id} 
                      onClick={() => onNavigate('tracker', undefined, session.id)}
                      className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                        <div className="font-semibold text-lg text-indigo-950 group-hover:text-indigo-600 transition-colors">
                          {topic?.title || 'Unknown Topic'}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-medium text-slate-500 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                            {formatLocalDate(session.date)}
                          </div>
                          <ChevronRight size={18} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                        </div>
                      </div>
                      <div className="space-y-3">
                        {session.objective && (
                          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Session Objective</div>
                            <p className="text-blue-900 text-sm whitespace-pre-wrap leading-relaxed">{session.objective}</p>
                          </div>
                        )}
                        {session.annotation && (
                          <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                            <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Session Annotation</div>
                            <p className="text-amber-900 text-sm whitespace-pre-wrap leading-relaxed">{session.annotation}</p>
                          </div>
                        )}
                        {comments.map(record => {
                          const student = students.find(s => s.id === record.studentId);
                          if (!student) return null;
                          return (
                            <div 
                              key={record.studentId} 
                              onClick={(e) => { e.stopPropagation(); onNavigate('tracker', record.studentId, session.id); }}
                              className="bg-slate-50 p-4 rounded-xl border border-slate-100 cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-200 transition-colors group/comment"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="font-semibold text-slate-800 group-hover/comment:text-indigo-700 transition-colors">
                                  {student.lastName}, {student.firstName}
                                </div>
                                <ChevronRight size={16} className="text-slate-400 group-hover/comment:text-indigo-500 transition-colors opacity-0 group-hover/comment:opacity-100" />
                              </div>
                              <div className="space-y-1.5">
                                {record.annotation && (
                                  <div className="text-sm flex gap-3">
                                    <span className="font-medium text-slate-500 capitalize w-24 shrink-0">General:</span>
                                    <span className="text-slate-700">{record.annotation}</span>
                                  </div>
                                )}
                                {Object.entries(record.comments || {}).map(([key, value]) => {
                                  if (!value || !value.trim()) return null;
                                  return (
                                    <div key={key} className="text-sm flex gap-3">
                                      <span className="font-medium text-slate-500 capitalize w-24 shrink-0">{key}:</span>
                                      <span className="text-slate-700">{value}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              {!sessions.some(s => {
                const topic = topics.find(t => t.id === s.topicId);
                if (!topic || topic.quarter !== selectedQuarter || topic.section !== selectedSection) return false;
                return s.annotation || s.objective || s.records.some(r => (r.comments && Object.values(r.comments).some(c => c && c.trim().length > 0)) || (r.annotation && r.annotation.trim().length > 0));
              }) && (
                <div className="p-8 text-center bg-white/40 rounded-xl border border-white/50 border-dashed">
                  <MessageCircle size={48} className="mx-auto text-slate-300 mb-4" />
                  <h4 className="text-lg font-medium text-indigo-950 mb-1">No Comments Yet</h4>
                  <p className="text-sm text-slate-500">Comments recorded during sessions will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>

    {selectedTopicId && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-white/50 bg-slate-50/50 flex justify-between items-center sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100/80 text-indigo-600 flex items-center justify-center border border-indigo-200 shadow-sm">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-indigo-950 text-lg">
                    {topics.find(t => t.id === selectedTopicId)?.title || 'Topic Overview'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {selectedQuarter} • {selectedSection}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onDeleteTopic && (
                  <button 
                    onClick={() => {
                      setConfirmModal({
                        isOpen: true,
                        title: 'Delete Topic',
                        message: 'Are you sure you want to delete this topic and all its sessions?',
                        onConfirm: async () => {
                          if (onDeleteTopic) {
                            await onDeleteTopic(selectedTopicId);
                            setSelectedTopicId(null);
                          }
                        }
                      });
                    }}
                    className="flex flex-col items-center justify-center px-3 py-1.5 text-rose-500 bg-white border border-rose-200 shadow-sm hover:text-white hover:bg-rose-500 rounded-xl transition-all h-10"
                    title="Remove Topic"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <button 
                  onClick={() => setSelectedTopicId(null)}
                  className="flex items-center justify-center w-10 h-10 text-slate-400 bg-white border border-slate-200 shadow-sm hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 rounded-xl transition-all"
                  title="Close Details"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Class Average</div>
                  <div className="text-3xl font-bold text-indigo-600">
                    {(() => {
                      const topicScores = filteredGradebookData
                        .map(d => d.topicScores[selectedTopicId])
                        .filter(s => s !== null) as number[];
                      if (topicScores.length === 0) return '--';
                      const avg = Math.round(topicScores.reduce((a, b) => a + b, 0) / topicScores.length);
                      return `${avg}%`;
                    })()}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
                  <div className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Students Graded</div>
                  <div className="text-3xl font-bold text-slate-700">
                    {filteredGradebookData.filter(d => d.topicScores[selectedTopicId] !== null).length}
                    <span className="text-sm text-slate-400 font-normal"> / {filteredGradebookData.length}</span>
                  </div>
                </div>
              </div>

              <h4 className="font-semibold text-indigo-950 mb-3 flex items-center gap-2">
                <CalendarCheck size={18} className="text-indigo-500" /> All Sessions Explorer
              </h4>
              <div className="space-y-3">
                {(() => {
                  const topicSessions = sessions.filter(s => s.topicId === selectedTopicId).sort((a,b) => b.date.localeCompare(a.date));
                  if (topicSessions.length === 0) {
                     return (
                       <div className="p-8 text-center bg-white rounded-xl border border-slate-200 border-dashed text-slate-500 text-sm">
                         No sessions recorded for this lesson yet.
                       </div>
                     );
                  }

                  return topicSessions.map(session => {
                    const isExpanded = expandedSessionInModal === session.id;
                    const records = Object.values(session.records || {});
                    let hasQuiz = false;
                    let totalQuizScore = 0;
                    let quizCount = 0;
                    let totalScore = 0;
                    let scoreCount = 0;

                    records.forEach(r => {
                      if (r.present) {
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
                      <div key={session.id} className={`bg-white border rounded-xl overflow-hidden transition-all shadow-sm ${isExpanded ? 'border-indigo-300 ring-4 ring-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
                        <div 
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors gap-3"
                          onClick={() => setExpandedSessionInModal(isExpanded ? null : session.id)}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <ChevronRight size={18} className={`text-slate-400 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                            <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <FileText size={16} className="text-indigo-500 shrink-0" />
                                  <span className="font-bold text-slate-800">{session.date}</span>
                                </div>
                                {session.objective && (
                                  <span className="text-xs text-slate-500 truncate mt-1 max-w-[250px]">{session.objective}</span>
                                )}
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4 ml-7 sm:ml-0">
                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
                              <div className="flex flex-col items-center">
                                <span className="text-[10px] uppercase font-bold text-slate-400">Avg</span>
                                <span className="text-sm font-bold text-emerald-600">{avgScore}</span>
                              </div>
                              <div className="w-px h-6 bg-slate-200"></div>
                              <div className="flex flex-col items-center">
                                <span className="text-[10px] uppercase font-bold text-slate-400">Quiz</span>
                                <span className="text-sm font-bold text-amber-600">{hasQuiz ? quizAvg : '--'}</span>
                              </div>
                            </div>
                            
                            {onDeleteSession && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmModal({
                                    isOpen: true,
                                    title: 'Remove Session',
                                    message: 'Are you sure you want to remove this session?',
                                    onConfirm: async () => {
                                      if (onDeleteSession) {
                                        await onDeleteSession(session.id);
                                        if (expandedSessionInModal === session.id) setExpandedSessionInModal(null);
                                      }
                                    }
                                  });
                                }}
                                className="p-2 text-rose-400 hover:text-white hover:bg-rose-500 rounded-lg transition-colors border border-transparent hover:border-rose-600 ml-auto sm:ml-0 shadow-sm"
                                title="Remove Session"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                 e.stopPropagation();
                                 const mode = session.type === 'quiz' || session.type === 'exam' || hasQuiz ? 'quiz' : undefined;
                                 onNavigate('tracker', undefined, session.id, mode);
                                 setSelectedTopicId(null);
                              }}
                              className="p-2 text-indigo-400 hover:text-white hover:bg-indigo-500 rounded-lg transition-colors border border-transparent hover:border-indigo-600 shadow-sm ml-auto sm:ml-2"
                              title="Edit in Record Log"
                            >
                               <FileText size={16} />
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                           <div className="bg-slate-50/80 border-t border-slate-100 p-4">
                              <h5 className="text-xs font-semibold text-slate-500 uppercase mb-3 px-1">Student Performance</h5>
                              
                              {records.length === 0 ? (
                                <div className="text-sm text-slate-500 italic p-2 border border-slate-200 border-dashed rounded-xl bg-white text-center">No student grades recorded in this session.</div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {records
                                    .sort((a, b) => {
                                      const s1 = students.find(s => s.id === a.studentId);
                                      const s2 = students.find(s => s.id === b.studentId);
                                      return (s1?.lastName || '').localeCompare(s2?.lastName || '');
                                    })
                                    .map(r => {
                                      const student = students.find(s => s.id === r.studentId);
                                      if (!student) return null;
                                      
                                      const score = calculateSessionScore(r, records, settings);
                                      
                                      return (
                                        <div 
                                          key={r.studentId}
                                          onClick={() => {
                                             const mode = session.type === 'quiz' || session.type === 'exam' || (r.quiz !== undefined && r.quiz !== null && !r.classwork) ? 'quiz' : undefined;
                                             onNavigate('tracker', r.studentId, session.id, mode);
                                             setSelectedTopicId(null);
                                          }}
                                          className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all group"
                                          title={`Click to edit ${student.firstName}'s grade`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                                              {student.firstName[0]}{student.lastName[0]}
                                            </div>
                                            <span className="text-sm font-medium text-slate-700 truncate group-hover:text-indigo-700 transition-colors">
                                              {student.lastName}, {student.firstName}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            {r.quiz !== undefined && r.quiz !== null && (
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
                                                Q: {r.quiz}
                                              </span>
                                            )}
                                            <span className={`text-sm font-bold bg-slate-50 px-2 py-0.5 rounded border border-slate-100 ${getGradeColor(score)}`}>
                                              {score}%
                                            </span>
                                          </div>
                                        </div>
                                      );
                                  })}
                                </div>
                              )}
                           </div>
                        )}
                      </div>
                    );
                  });
                })()}

              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </>
  );
}
