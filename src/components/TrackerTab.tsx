import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Student, Session, StudentRecord, HomeworkStatus, DEFAULT_SECTIONS, DEFAULT_QUARTERS, Quarter, Topic, LessonPlan, Reminder, TeacherSettings } from '../types';
import { CheckSquare, FileText, FileX, Plus, Minus, Loader2, UserCheck, MessageCircle, BookOpen, GraduationCap, X, Star, Sliders, CalendarCheck, Trash2, MinusCircle, Calendar, Users, Clock, Search, AlertTriangle, Folder, AlertCircle, Cloud } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { calculateSessionScore, calculateTopicScore, DEFAULT_GRADING_CONFIG, getTotalSessionWeight, getSessionCode } from '../gradingUtils';

import StudentViewPanel from './StudentViewPanel';
import { ConfirmModal } from './ConfirmModal';
import FolderExplorerModal from './FolderExplorerModal';
import { VisualInspector } from './VisualInspector';

interface Props {
  students: Student[];
  topics: Topic[];
  sessions: Session[];
  lessonPlans: LessonPlan[];
  reminders?: Reminder[];
  onSaveTopic: (t: Topic) => Promise<void>;
  onSaveSession: (s: Session) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onDeleteTopic: (topicId: string) => Promise<void>;
  onSaveReminder?: (reminder: Reminder) => void;
  onDeleteReminder?: (id: string) => void;
  showToast: (msg: string) => void;
  activePeriod: string;
  initialSessionId?: string | null;
  initialStudentId?: string | null;
  initialMode?: InputMode | null;
  settings?: TeacherSettings | null;
  onNavigate?: (tab: string, studentId?: string, sessionId?: string, mode?: string) => void;
}

type InputMode = 'attendance' | 'participation' | 'homework' | 'behavior' | 'quiz' | 'adjustments' | 'annotations' | 'edit-header';

const getLocalDateString = (d: Date = new Date()) => {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const formatLocalDate = (dateStr: string) => {
  if (!dateStr || !dateStr.includes('-')) return dateStr;
  const [year, month, day] = dateStr.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();
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
  const [localValue, setLocalValue] = useState(value);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      setLocalValue(value);
    }
  }, [value]);

  useEffect(() => {
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

const DebouncedInput = ({ 
  value, 
  onChange, 
  placeholder, 
  className,
  disabled,
  type = "text"
}: { 
  value: string; 
  onChange: (val: string) => void; 
  placeholder?: string; 
  className?: string; 
  disabled?: boolean;
  type?: string;
}) => {
  const [localValue, setLocalValue] = useState(value);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      setLocalValue(value);
    }
  }, [value]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [localValue, value, onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleBlur = () => {
    isFocused.current = false;
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type={type}
      value={localValue}
      onChange={handleChange}
      onFocus={() => isFocused.current = true}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
    />
  );
};

export default function TrackerTab({ 
  students, 
  topics, 
  sessions, 
  lessonPlans,
  reminders = [],
  onSaveTopic, 
  onSaveSession, 
  onDeleteSession,
  onDeleteTopic,
  onSaveReminder,
  onDeleteReminder,
  showToast, 
  activePeriod,
  initialSessionId,
  initialStudentId,
  initialMode,
  settings,
  onNavigate
}: Props) {
  const [customQuarters, setCustomQuarters] = useState<string[]>([]);
  const [customSections, setCustomSections] = useState<string[]>([]);

  const allQuarters = useMemo(() => {
    return Array.from(new Set([...DEFAULT_QUARTERS, ...topics.map(t => t.quarter), ...customQuarters])).sort();
  }, [topics, customQuarters]);

  const allSections = useMemo(() => {
    return Array.from(new Set([...DEFAULT_SECTIONS, ...topics.map(t => t.section), ...customSections])).sort();
  }, [topics, customSections]);

  const [quarter, setQuarter] = useState<Quarter>(() => {
    const saved = localStorage.getItem('tracker_quarter');
    if (saved && allQuarters.includes(saved as Quarter)) {
      return saved as Quarter;
    }
    return allQuarters[0] || 'Q1';
  });

  useEffect(() => {
    localStorage.setItem('tracker_quarter', quarter);
  }, [quarter]);

  const [section, setSection] = useState<string>(() => {
    const saved = localStorage.getItem('tracker_section');
    if (saved && allSections.includes(saved)) {
      return saved;
    }
    return allSections[0] || '7a Language';
  });

  useEffect(() => {
    localStorage.setItem('tracker_section', section);
  }, [section]);
  const [topicId, setTopicId] = useState<string>('NOT_DEFINED');
  const [sessionMode, setSessionMode] = useState<'class' | 'quiz' | 'exam'>('class');

  useEffect(() => {
    // We no longer sync sessionMode to localStorage
  }, [sessionMode]);
  const [filteredTopics, setFilteredTopics] = useState<Topic[]>([]);
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isFolderExplorerOpen, setIsFolderExplorerOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean; title: string; message: string; onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});
  
  const [date, setDate] = useState('NOT_DEFINED');

  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [editHeaderData, setEditHeaderData] = useState<{
    quarter: Quarter;
    section: string;
    topicId: string;
    date: string;
    sessionMode: 'class' | 'quiz' | 'exam';
  } | null>(null);

  useEffect(() => {
    // We no longer sync topicId to localStorage
  }, [topicId]);

  // Save previous state to restore when exiting Quarter Exam Mode
  const prevTopicState = React.useRef({ topicId: '', date: '' });
  const prevSessionMode = React.useRef<'class' | 'quiz' | 'exam'>(sessionMode);
  const isFirstRun = React.useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    if (isNavigatingRef.current) {
      return;
    }

    if (sessionMode === 'exam' && prevSessionMode.current !== 'exam') {
      prevTopicState.current = { topicId, date };
      setTopicId(`QUARTER_EXAM_${quarter}_${section}`);
      setDate(quarter); // Use quarter as date to keep it unique per quarter
      setActiveMode('quiz'); // Force quiz mode for quarter exam
    } else if (prevSessionMode.current === 'exam' && sessionMode !== 'exam') {
      if (prevTopicState.current.topicId && prevTopicState.current.topicId !== `QUARTER_EXAM_${quarter}_${section}`) {
        setTopicId(prevTopicState.current.topicId);
        setDate(prevTopicState.current.date);
      } else {
        // Fallback if no previous state
        const filtered = topics.filter(t => t.quarter === quarter && t.section === section);
        if (filtered.length > 0) {
          setTopicId(filtered[0].id);
        } else {
          setTopicId('');
        }
        setDate(getLocalDateString());
      }
    }
    
    if (sessionMode === 'quiz' || sessionMode === 'exam') {
      setActiveMode('quiz');
    }
    
    prevSessionMode.current = sessionMode;
  }, [sessionMode]); // Only run when mode changes

  // Keep topicId and date synced if quarter/section changes while in exam mode
  useEffect(() => {
    if (sessionMode === 'exam') {
      setTopicId(`QUARTER_EXAM_${quarter}_${section}`);
      setDate(quarter);
    }
  }, [quarter, section, sessionMode]);
  const [records, setRecords] = useState<Record<string, StudentRecord>>({});
  const [annotation, setAnnotation] = useState('');
  const [objective, setObjective] = useState('');
  
  const [activeMode, setActiveMode] = useState<InputMode>('attendance');
  const [isDirty, setIsDirty] = useState(false);
  const appliedNavRef = React.useRef<{ session?: string | null, mode?: string | null }>({});
  const isNavigatingRef = React.useRef(false);
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  const [isFloating, setIsFloating] = useState(false);
  const tabsRef = React.useRef<HTMLDivElement>(null);
  
  const topControlsRef = React.useRef<HTMLDivElement>(null);
  const [isTopControlsVisible, setIsTopControlsVisible] = useState(true);
  const [showFloatingControls, setShowFloatingControls] = useState(false);
  const [isScrollingDown, setIsScrollingDown] = useState(false);

  // New states for Student View
  const [viewMode, setViewMode] = useState<'session' | 'student'>('session');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
  const [newSessionType, setNewSessionType] = useState<'class' | 'quiz' | 'exam'>('class');

  useEffect(() => {
    const mainElement = document.querySelector('main');
    if (!mainElement) return;

    let lastScrollY = mainElement.scrollTop;
    
    const handleScroll = () => {
      const currentScrollY = mainElement.scrollTop;
      const delta = currentScrollY - lastScrollY;
      
      // Ignore very small scroll movements to prevent jitter
      if (Math.abs(delta) < 8) return;

      // Only hide if we've scrolled down a bit, to avoid hiding immediately at top
      if (delta > 0 && currentScrollY > 120) {
        setIsScrollingDown(true);
      } else if (delta < 0) {
        setIsScrollingDown(false);
      }
      lastScrollY = currentScrollY;
    };

    mainElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainElement.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsTopControlsVisible(entry.isIntersecting);
        if (entry.isIntersecting) {
          setShowFloatingControls(false);
        }
      },
      { threshold: 0, rootMargin: '-60px 0px 0px 0px' }
    );

    if (topControlsRef.current) {
      observer.observe(topControlsRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Handle initial session/student/mode from navigation
  useEffect(() => {
    if (initialSessionId) {
      if (appliedNavRef.current.session !== initialSessionId) {
        const session = sessions.find(s => s.id === initialSessionId);
        if (session) {
          let targetQuarter = '';
          let targetSection = '';
          let isExam = false;

          if (session.topicId.startsWith('QUARTER_EXAM_')) {
            const parts = session.topicId.replace('QUARTER_EXAM_', '').split('_');
            targetQuarter = parts[0];
            targetSection = parts[1];
            isExam = true;
          } else {
            const topic = topics.find(t => t.id === session.topicId);
            if (topic) {
              targetQuarter = topic.quarter;
              targetSection = topic.section;
            }
          }

          if (targetQuarter && targetSection) {
            isNavigatingRef.current = true;
            setQuarter(targetQuarter as Quarter);
            setSection(targetSection);
            setTopicId(session.topicId);
            setDate(session.date);
            setIsCreatingTopic(false);
            if (isExam) {
              setSessionMode('exam');
            } else if (session.type === 'quiz' || initialMode === 'quiz') {
              setSessionMode('quiz');
            } else {
              setSessionMode('class');
            }
            appliedNavRef.current.session = initialSessionId;
            
            setTimeout(() => {
              isNavigatingRef.current = false;
            }, 100);
          }
        }
      }
    } else {
      appliedNavRef.current.session = null;
    }

    if (initialMode) {
      if (initialMode === 'edit-header') {
        if (appliedNavRef.current.mode !== 'edit-header') {
          setIsEditingHeader(true);
          // We need to use the session data from the initialSessionId if it exists,
          // otherwise fallback to current state
          const session = sessions.find(s => s.id === initialSessionId);
          if (session) {
            const topic = topics.find(t => t.id === session.topicId);
            setEditHeaderData({ 
              quarter: topic?.quarter || quarter, 
              section: topic?.section || section, 
              topicId: session.topicId, 
              date: session.date, 
              sessionMode: session.type || 'class' 
            });
          } else {
            setEditHeaderData({ quarter, section, topicId, date, sessionMode });
          }
          appliedNavRef.current.mode = 'edit-header';
        }
      } else {
        if (appliedNavRef.current.mode !== initialMode) {
          setActiveMode(initialMode as InputMode);
          appliedNavRef.current.mode = initialMode;
        }
      }
    } else {
      appliedNavRef.current.mode = null;
      if (initialSessionId) {
        const session = sessions.find(s => s.id === initialSessionId);
        if (session && (session.type === 'quiz' || session.type === 'exam' || session.records.some(r => r.quiz !== undefined && r.quiz !== null && !r.classwork))) {
          if (activeMode !== 'quiz') setActiveMode('quiz');
        } else if (activeMode === 'quiz') {
          setActiveMode('attendance');
        }
      }
    }
  }, [initialSessionId, initialMode, sessions, topics]);

  useEffect(() => {
    if (initialStudentId && Object.keys(records).length > 0) {
      // Small delay to ensure DOM is ready after records update
      const timer = setTimeout(() => {
        const element = document.getElementById(`student-row-${initialStudentId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2');
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2');
          }, 3000);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [initialStudentId, records]);

  // Filter students by cohort based on selected section
  const sectionStudents = useMemo(() => {
    let matchingCohort = section.split(' ')[0];
    if (settings?.cohorts && settings.cohorts.length > 0) {
      const sortedCohorts = [...settings.cohorts].sort((a,b) => b.length - a.length);
      const found = sortedCohorts.find(c => section === c || section.startsWith(c + ' '));
      if (found) matchingCohort = found;
    }
    return students.filter(s => s.cohort === matchingCohort);
  }, [students, section, settings?.cohorts]);

  const displayQuarter = isEditingHeader ? editHeaderData?.quarter || quarter : quarter;
  const displaySection = isEditingHeader ? editHeaderData?.section || section : section;

  const displayTopics = useMemo(() => {
    return topics.filter(t => t.quarter === displayQuarter && t.section === displaySection);
  }, [topics, displayQuarter, displaySection]);

  const displayAvailableLessonPlans = useMemo(() => {
    const existingTitles = new Set(displayTopics.map(t => t.title.toLowerCase()));
    return lessonPlans
      .filter(lp => lp.section === displaySection && (lp.period || '2025-2026') === activePeriod)
      .filter(lp => {
        if (!lp.sectionLesson) return false;
        const title = lp.chapterUnit ? `${lp.chapterUnit} - ${lp.sectionLesson}` : lp.sectionLesson;
        return !existingTitles.has(title.toLowerCase());
      })
      .filter((lp, index, self) => 
        index === self.findIndex((t) => {
          const tTitle = t.chapterUnit ? `${t.chapterUnit} - ${t.sectionLesson}` : t.sectionLesson;
          const lpTitle = lp.chapterUnit ? `${lp.chapterUnit} - ${lp.sectionLesson}` : lp.sectionLesson;
          return tTitle === lpTitle;
        })
      );
  }, [lessonPlans, displaySection, activePeriod, displayTopics]);

  // Load topics when quarter or section changes
  useEffect(() => {
    const filtered = topics.filter(t => t.quarter === quarter && t.section === section);
    setFilteredTopics(filtered);
    
    // Only auto-select if we aren't creating a topic and current topic isn't in the new list
    if (filtered.length > 0) {
      if (!isNavigatingRef.current && sessionMode !== 'exam' && !filtered.find(t => t.id === topicId) && topicId !== 'NOT_DEFINED') {
        setTopicId('NOT_DEFINED');
      }
      setIsCreatingTopic(false);
    } else {
      if (!isNavigatingRef.current && sessionMode !== 'exam') {
        setTopicId('NOT_DEFINED');
      }
      setIsCreatingTopic(false);
    }
  }, [quarter, section, topics, sessionMode]); // Removed topicId and isCreatingTopic from dependencies to prevent loops

  // Filter lesson plans that match the current section and period
  // but are NOT already in the filteredTopics list (by title)
  const availableLessonPlans = useMemo(() => {
    const existingTitles = new Set(filteredTopics.map(t => t.title.toLowerCase()));
    
    return lessonPlans
      .filter(lp => lp.section === section && (lp.period || '2025-2026') === activePeriod)
      .filter(lp => {
        if (!lp.sectionLesson) return false;
        const title = lp.chapterUnit ? `${lp.chapterUnit} - ${lp.sectionLesson}` : lp.sectionLesson;
        return !existingTitles.has(title.toLowerCase());
      })
      // Deduplicate by title
      .filter((lp, index, self) => 
        index === self.findIndex((t) => {
          const tTitle = t.chapterUnit ? `${t.chapterUnit} - ${t.sectionLesson}` : t.sectionLesson;
          const lpTitle = lp.chapterUnit ? `${lp.chapterUnit} - ${lp.sectionLesson}` : lp.sectionLesson;
          return tTitle === lpTitle;
        })
      );
  }, [lessonPlans, section, activePeriod, filteredTopics]);

  const lastLoadedRef = React.useRef<{topicId: string, date: string, isCreatingTopic: boolean, sessionDataStr: string | null} | null>(null);

  const latestSessionRef = React.useRef<Session | null>(null);
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const onSaveSessionRef = React.useRef(onSaveSession);

  useEffect(() => {
    onSaveSessionRef.current = onSaveSession;
  }, [onSaveSession]);

  // Load session when topic or date changes
  useEffect(() => {
    let existingSession = sessions.find(s => s.topicId === topicId && s.date === date);
    
    // If we're explicitly navigating to a specific session, or we already have a loaded session 
    // that matches this topicId and date (like a duplicate), prefer the exact ID match.
    if (appliedNavRef.current.session) {
       const sessionById = sessions.find(s => s.id === appliedNavRef.current.session);
       if (sessionById && sessionById.topicId === topicId && sessionById.date === date) {
           existingSession = sessionById;
       }
    } else if (latestSessionRef.current) {
       const sessionById = sessions.find(s => s.id === latestSessionRef.current!.id);
       if (sessionById && sessionById.topicId === topicId && sessionById.date === date) {
           existingSession = sessionById;
       }
    }

    const currentSessionId = existingSession?.id || `${topicId}_${date}`;
    const existingSessionStr = existingSession ? JSON.stringify(existingSession) : null;

    const isTopicChange = lastLoadedRef.current?.topicId !== topicId || 
                          lastLoadedRef.current?.date !== date ||
                          lastLoadedRef.current?.isCreatingTopic !== isCreatingTopic;

    // If it's not a topic change, and the session data hasn't changed from what we last loaded, do nothing.
    if (!isTopicChange && lastLoadedRef.current?.sessionDataStr === existingSessionStr) {
      return;
    }

    // If it's not a topic change, but we have local unsaved changes, we shouldn't overwrite them
    if (!isTopicChange && isDirty) {
      return;
    }

    // Flush pending save before loading new session IF it's a topic change
    if (isTopicChange && latestSessionRef.current) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      onSaveSessionRef.current(latestSessionRef.current).catch(console.error);
      latestSessionRef.current = null;
    }

    if (!topicId || isCreatingTopic) {
      const recs: Record<string, StudentRecord> = {};
      sectionStudents.forEach(s => {
        recs[s.id] = { studentId: s.id, present: false, participation: null, rawParticipation: null, classwork: null, homework: 'None Assigned', behavior: null, quizStatus: 'None', extraPoints: 0, punishment: 0 };
      });
      setRecords(recs);
      setAnnotation('');
      setObjective('');
      setIsDirty(false);
      lastLoadedRef.current = { topicId, date, isCreatingTopic, sessionDataStr: null };
      return;
    }

    if (existingSession) {
      let typeToSet = existingSession.type;
      if (!typeToSet) {
        if (existingSession.records.some(r => r.quiz !== undefined)) {
          typeToSet = 'quiz';
        } else {
          typeToSet = 'class';
        }
      }
      
      // If we explicitly navigated to this session requesting quiz mode,
      // override a 'class' state to ensure the user actually sees the quiz tab.
      if ((initialMode === 'quiz' || sessionMode === 'quiz') && typeToSet === 'class') {
        typeToSet = 'quiz';
      }

      if (typeToSet !== sessionMode) {
        setSessionMode(typeToSet);
      }
      const recs: Record<string, StudentRecord> = {};
      existingSession.records.forEach(r => {
        recs[r.studentId] = {
          ...r,
          rawParticipation: r.rawParticipation !== undefined ? r.rawParticipation : r.participation
        };
      });
      sectionStudents.forEach(s => {
        if (!recs[s.id]) {
          recs[s.id] = { studentId: s.id, present: false, participation: null, rawParticipation: null, classwork: null, homework: 'None Assigned', behavior: null, quizStatus: 'None', extraPoints: 0, punishment: 0 };
        }
      });
      setRecords(recs);
      setAnnotation(existingSession.annotation || '');
      setObjective(existingSession.objective || '');
    } else {
      const recs: Record<string, StudentRecord> = {};
      sectionStudents.forEach(s => {
        recs[s.id] = { studentId: s.id, present: false, participation: null, rawParticipation: null, classwork: null, homework: 'None Assigned', behavior: null, quizStatus: 'None', extraPoints: 0, punishment: 0 };
      });
      setRecords(recs);
      setAnnotation('');
      setObjective('');
    }
    setIsDirty(false);
    lastLoadedRef.current = { topicId, date, isCreatingTopic, sessionDataStr: existingSessionStr };
  }, [topicId, date, isCreatingTopic, sectionStudents, sessions, onSaveSession, isDirty]);

  // Sync records when sectionStudents changes (e.g., student added to roster)
  useEffect(() => {
    if (!topicId || isCreatingTopic) return;
    
    setRecords(prev => {
      let needsUpdate = false;
      const updatedRecords = { ...prev };
      
      sectionStudents.forEach(s => {
        if (!updatedRecords[s.id]) {
          updatedRecords[s.id] = { studentId: s.id, present: false, participation: null, rawParticipation: null, classwork: null, homework: 'None Assigned', behavior: null, quizStatus: 'None', extraPoints: 0, punishment: 0 };
          needsUpdate = true;
        }
      });
      
      if (needsUpdate) {
        setTimeout(() => setIsDirty(true), 0);
        return updatedRecords;
      }
      return prev;
    });
  }, [sectionStudents, topicId, isCreatingTopic]);

  // Auto-set date to today if user starts grading while date is NOT_DEFINED
  useEffect(() => {
    if (isDirty && date === 'NOT_DEFINED') {
      setDate(getLocalDateString());
    }
  }, [isDirty, date]);

  // Auto-save effect
  useEffect(() => {
    if (!isDirty || !topicId || isCreatingTopic || date === 'NOT_DEFINED') return;

    // Find existing session to keep its ID if it exists
    const existingSession = sessions.find(s => s.topicId === topicId && s.date === date);
    // Generate a unique ID based on current timestamp if it's a new session
    const sessionId = existingSession?.id || `${topicId}_${date}_${Date.now()}`;

    latestSessionRef.current = {
      id: sessionId,
      topicId,
      date,
      type: sessionMode,
      records: Object.values(records),
      period: activePeriod,
      annotation,
      objective
    };

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (!latestSessionRef.current) return;
      
      const hasAnyGrade = latestSessionRef.current.records.some(r => 
        r.participation !== null || 
        r.classwork !== null || 
        (r.homework !== 'None Assigned' && r.homework !== 'N/A') || 
        r.behavior !== null || 
        (r.quiz !== undefined && r.quiz !== null) || 
        r.extraPoints !== 0 || 
        r.punishment !== 0 ||
        (r.annotation && r.annotation.trim() !== '') ||
        (r.comments && Object.values(r.comments).some(c => c && c.trim() !== ''))
      );
      const hasAnnotations = latestSessionRef.current.annotation.trim() !== '' || latestSessionRef.current.objective.trim() !== '';

      if (!hasAnyGrade && !hasAnnotations) {
        return; // Do not auto-save empty sessions
      }

      const sessionToSave = latestSessionRef.current;
      latestSessionRef.current = null;

      try {
        setIsSaving(true);
        await onSaveSessionRef.current(sessionToSave);
        if (!latestSessionRef.current) {
          setIsDirty(false);
        }
      } catch (error) {
        console.error("Auto-save failed", error);
      } finally {
        setIsSaving(false);
      }
    }, 1000); // 1 second debounce

  }, [records, annotation, objective, isDirty, topicId, date, activePeriod, isCreatingTopic]);

  const handleManualSave = async () => {
    if (!latestSessionRef.current || isSaving) return;
    
    const hasAnyGrade = latestSessionRef.current.records.some(r => 
      r.participation !== null || 
      r.classwork !== null || 
      (r.homework !== 'None Assigned' && r.homework !== 'N/A') || 
      r.behavior !== null || 
      (r.quiz !== undefined && r.quiz !== null) || 
      r.extraPoints !== 0 || 
      r.punishment !== 0 ||
      (r.annotation && r.annotation.trim() !== '') ||
      (r.comments && Object.values(r.comments).some(c => c && c.trim() !== ''))
    );
    const hasAnnotations = latestSessionRef.current.annotation.trim() !== '' || latestSessionRef.current.objective.trim() !== '';

    if (!hasAnyGrade && !hasAnnotations) {
      showToast('A session must have at least one grade, objective or annotation to be saved.');
      setIsDirty(false); // Clear dirty state so the unsaved flag goes away for empty sessions
      return; 
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    const sessionToSave = latestSessionRef.current;
    latestSessionRef.current = null;

    try {
      setIsSaving(true);
      await onSaveSessionRef.current(sessionToSave);
      if (!latestSessionRef.current) {
        setIsDirty(false);
      }
      showToast('Session synced manually');
    } catch (error) {
      console.error("Manual save failed", error);
      showToast('Failed to sync session');
    } finally {
      setIsSaving(false);
    }
  };

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (latestSessionRef.current) {
        const hasAnyGrade = latestSessionRef.current.records.some(r => 
          r.participation !== null || 
          r.classwork !== null || 
          (r.homework !== 'None Assigned' && r.homework !== 'N/A') || 
          r.behavior !== null || 
          (r.quiz !== undefined && r.quiz !== null) || 
          r.extraPoints !== 0 || 
          r.punishment !== 0 ||
          (r.annotation && r.annotation.trim() !== '') ||
          (r.comments && Object.values(r.comments).some(c => c && c.trim() !== ''))
        );
        const hasAnnotations = latestSessionRef.current.annotation.trim() !== '' || latestSessionRef.current.objective.trim() !== '';

        if (hasAnyGrade || hasAnnotations) {
          onSaveSessionRef.current(latestSessionRef.current).catch(console.error);
        }
        latestSessionRef.current = null;
      }
    };
  }, []);

  // Flush save when switching to student view
  useEffect(() => {
    if (viewMode === 'student' && isDirty && latestSessionRef.current) {
      const hasAnyGrade = latestSessionRef.current.records.some(r => 
        r.participation !== null || 
        r.classwork !== null || 
        (r.homework !== 'None Assigned' && r.homework !== 'N/A') || 
        r.behavior !== null || 
        (r.quiz !== undefined && r.quiz !== null) || 
        r.extraPoints !== 0 || 
        r.punishment !== 0 ||
        (r.annotation && r.annotation.trim() !== '') ||
        (r.comments && Object.values(r.comments).some(c => c && c.trim() !== ''))
      );
      const hasAnnotations = latestSessionRef.current.annotation.trim() !== '' || latestSessionRef.current.objective.trim() !== '';

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      
      if (hasAnyGrade || hasAnnotations) {
        onSaveSessionRef.current(latestSessionRef.current).catch(console.error);
      }
      latestSessionRef.current = null;
      setIsDirty(false);
    }
  }, [viewMode, isDirty]);

  // Calculate accumulated average for the selected topic
  const studentAverages = useMemo(() => {
    if (!topicId) return {};

    const averages: Record<string, string> = {};

    sectionStudents.forEach(student => {
      const topicScore = calculateTopicScore(student.id, topicId, sessions, settings);
      if (topicScore !== null) {
        averages[student.id] = topicScore.toString() + '%';
      } else {
        averages[student.id] = '--';
      }
    });

    return averages;
  }, [topicId, sessions, sectionStudents]);

  const handleCreateTopic = async () => {
    if (!newTopicTitle.trim()) {
      showToast('Error: Topic title is required.');
      return;
    }
    
    setIsSaving(true);
    const newTopic: Topic = {
      id: `topic_${Date.now()}`,
      title: newTopicTitle.trim(),
      quarter,
      section,
      period: activePeriod
    };
    
    try {
      await onSaveTopic(newTopic);
      
      if (topicId === 'NOT_DEFINED' && isDirty && latestSessionRef.current) {
        const oldSessionId = `NOT_DEFINED_${date}`;
        const newSessionId = `${newTopic.id}_${date}`;
        const sessionToMove = {
          ...latestSessionRef.current,
          id: newSessionId,
          topicId: newTopic.id,
        } as Session;
        
        await onSaveSession(sessionToMove);
        if (sessions.some(s => s.id === oldSessionId)) {
          await onDeleteSession(oldSessionId);
        }
        
        setTopicId(newTopic.id);
        setIsCreatingTopic(false);
        setIsDirty(false);
        lastLoadedRef.current = { topicId: newTopic.id, date, isCreatingTopic: false, sessionDataStr: JSON.stringify(sessionToMove) };
        latestSessionRef.current = sessionToMove;
        showToast('Session moved to new topic');
      } else {
        setTopicId(newTopic.id);
        setIsCreatingTopic(false);
      }
      
      setNewTopicTitle('');
    } finally {
      setIsSaving(false);
    }
  };

  const updateRecord = useCallback((studentId: string, field: keyof StudentRecord, value: any) => {
    setRecords(prev => {
      const newRecords = { ...prev };

      // If we are updating participation to a number (not null), and it's the first one
      if (field === 'participation' && value !== null && value !== undefined) {
        const isFirstParticipation = Object.values(prev).every(r => r.participation === null || r.participation === undefined);
        if (isFirstParticipation) {
          // Set all present students to 0
          Object.keys(newRecords).forEach(id => {
            if (newRecords[id].present) {
              newRecords[id] = { ...newRecords[id], participation: 0 };
            }
          });
        }
      }

      newRecords[studentId] = {
        ...newRecords[studentId],
        [field]: value
      };

      return newRecords;
    });
    setIsDirty(true);
  }, []);

  const markAllPresent = () => {
    setRecords(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        next[id] = { ...next[id], present: true };
      });
      return next;
    });
    setIsDirty(true);
    showToast('All marked present');
  };

  const markAllF = () => {
    setRecords(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        next[id] = { ...next[id], classwork: 'F' };
      });
      return next;
    });
    setIsDirty(true);
    showToast('All marked F for classwork');
  };

  const setAllHwSubmitted = () => {
    setRecords(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        next[id] = { ...next[id], homework: 'Submitted' };
      });
      return next;
    });
    setIsDirty(true);
    showToast('All homework marked submitted');
  };

  const setAllHwNotSubmitted = () => {
    setRecords(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        next[id] = { ...next[id], homework: 'Not Submitted' };
      });
      return next;
    });
    setIsDirty(true);
    showToast('All homework marked not submitted');
  };

  const markAllNA = () => {
    setRecords(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        if (activeMode === 'attendance') {
          next[id] = { ...next[id], classwork: 'N/A' };
        } else if (activeMode === 'participation') {
          next[id] = { ...next[id], participation: null };
        } else if (activeMode === 'behavior') {
          next[id] = { ...next[id], behavior: null };
        } else if (activeMode === 'homework') {
          next[id] = { ...next[id], homework: 'N/A' };
        }
      });
      return next;
    });
    setIsDirty(true);
    showToast(`All marked N/A`);
  };

  const handleAddReminder = async () => {
    if (!topicId) {
      showToast('Please select a topic first');
      return;
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (!token) {
        showToast('Failed to get Google access token');
        return;
      }

      const topicTitle = filteredTopics.find(t => t.id === topicId)?.title || 'Session';
      const task = {
        title: `Review ${section} - ${topicTitle}`,
        notes: annotation || 'No annotations',
        due: new Date(date).toISOString(),
      };

      const response = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(task),
      });

      if (!response.ok) {
        throw new Error('Failed to create task');
      }

      showToast('Reminder added to Google Tasks!');
    } catch (error) {
      console.error(error);
      showToast('Error adding reminder to Google Tasks');
    }
  };

  const config = settings?.gradingConfig || DEFAULT_GRADING_CONFIG;

  const modes = useMemo(() => {
    const baseModes: { id: InputMode; label: string; icon: React.ElementType }[] = [
      { id: 'attendance', label: config.classwork.enabled && sessionMode === 'class' ? 'Attendance & Class Work' : 'Attendance', icon: UserCheck },
    ];
    
    if (sessionMode === 'class') {
      if (config.participation.enabled) baseModes.push({ id: 'participation', label: 'Participation', icon: MessageCircle });
      if (config.behavior.enabled) baseModes.push({ id: 'behavior', label: 'Behavior', icon: Star });
      if (config.homework.enabled) baseModes.push({ id: 'homework', label: 'Homework', icon: BookOpen });
      if (config.adjustments.enabled) baseModes.push({ id: 'adjustments', label: 'Adjustments', icon: Sliders });
    } else if (sessionMode === 'quiz') {
      if (config.quiz.enabled) baseModes.push({ id: 'quiz', label: 'Quiz', icon: GraduationCap });
      if (config.adjustments.enabled) baseModes.push({ id: 'adjustments', label: 'Adjustments', icon: Sliders });
    } else if (sessionMode === 'exam') {
      baseModes.push({ id: 'quiz', label: 'Exam', icon: GraduationCap });
      if (config.adjustments.enabled) baseModes.push({ id: 'adjustments', label: 'Adjustments', icon: Sliders });
    }
    
    baseModes.push({ id: 'annotations', label: 'Annotations', icon: FileText });
    
    return baseModes;
  }, [config, sessionMode]);

  useEffect(() => {
    if (!modes.find(m => m.id === activeMode)) {
      setActiveMode('attendance');
    }
  }, [modes, activeMode]);

  const averageSessionGrade = useMemo(() => {
    const presentStudents = Object.values(records).filter(r => r.present);
    if (presentStudents.length === 0) return null;
    const recordsArray = Object.values(records);
    const totalScore = presentStudents.reduce((sum, record) => {
      return sum + calculateSessionScore(record, recordsArray, settings);
    }, 0);
    return (totalScore / presentStudents.length).toFixed(1);
  }, [records, settings]);

  const handleSaveHeaderChanges = async () => {
    if (!editHeaderData || !latestSessionRef.current) {
      setIsEditingHeader(false);
      return;
    }

    const { quarter: newQuarter, section: newSection, topicId: newTopicId, date: newDate, sessionMode: newSessionMode } = editHeaderData;
    
    // Check if anything actually changed
    if (newTopicId === topicId && newDate === date && newSessionMode === sessionMode) {
      setIsEditingHeader(false);
      return;
    }

    const oldSessionId = latestSessionRef.current.id;
    
    // Check for collisions
    const collision = sessions.find(s => s.id !== oldSessionId && s.topicId === newTopicId && s.date === newDate);
    if (collision) {
      showToast('A session already exists for this topic and date. Please choose a different date.');
      return;
    }

    // Keep the old ID if we're only changing the sessionMode, or if the new ID format would conflict 
    // with something unexpectedly. Actually, if topicId and date changes, it's safer to generate a new ID.
    const newSessionId = `${newTopicId}_${newDate}_${Date.now()}`;
    
    const updatedSession: Session = {
      ...latestSessionRef.current,
      id: newSessionId,
      topicId: newTopicId,
      date: newDate,
      type: newSessionMode
    };

    try {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      
      // Save the new session
      await onSaveSession(updatedSession);
      
      // If the ID changed, delete the old one
      if (oldSessionId !== newSessionId && sessions.some(s => s.id === oldSessionId)) {
        await onDeleteSession(oldSessionId);
      }

      // Update local state to point to the new session
      setQuarter(newQuarter);
      setSection(newSection);
      setTopicId(newTopicId);
      setDate(newDate);
      setSessionMode(newSessionMode);
      
      latestSessionRef.current = updatedSession;
      lastLoadedRef.current = { topicId: newTopicId, date: newDate, isCreatingTopic: false, sessionDataStr: JSON.stringify(updatedSession) };
      setIsDirty(false);
      
      showToast('Session header updated successfully');
    } catch (error) {
      console.error("Failed to update session header", error);
      showToast('Failed to update session header');
    } finally {
      setIsEditingHeader(false);
      setEditHeaderData(null);
    }
  };

  const renderSaveStatusButton = () => (
    <>
      {isSaving ? (
        <button disabled className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-1.5 sm:py-2 rounded-lg border border-indigo-100 cursor-wait">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Saving...</span>
        </button>
      ) : isDirty ? (
        <button 
          onClick={handleManualSave}
          className="flex items-center gap-2 text-amber-600 bg-amber-50 hover:bg-amber-100 transition-colors px-3 py-1.5 sm:py-2 rounded-lg border border-amber-100 active:scale-[0.98] cursor-pointer"
          title="Click to force save"
        >
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Unsaved Changes</span>
        </button>
      ) : (
        <button 
          disabled
          className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 sm:py-2 rounded-lg border border-emerald-100 opacity-90 cursor-default"
          title="All changes have been successfully saved to the cloud"
        >
          <Cloud size={14} className="text-emerald-500" />
          <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Saved to Cloud</span>
        </button>
      )}
    </>
  );

  const renderTopControls = () => (
    <div className="bg-white/70 backdrop-blur-md p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col gap-4 relative">
      {/* Session Code & Actions */}
      <div className="flex flex-wrap md:flex-nowrap items-center justify-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
        {/* Left: Code & Avg */}
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 w-full sm:w-auto">
          <div className="flex items-center justify-center sm:justify-start gap-2 max-w-full">
            <span className="text-sm font-semibold text-slate-700 shrink-0">Session Code:</span>
            <div className="bg-slate-100/80 px-2.5 py-1 rounded-md text-sm text-slate-600 font-mono select-all truncate max-w-[150px] sm:max-w-[250px] border border-slate-200/50 text-center font-bold tracking-wide">
              {topicId && topicId !== 'NOT_DEFINED' && date !== 'NOT_DEFINED' ? getSessionCode(section, date, sessions, `${topicId}_${date}`, settings) : 'None selected'}
            </div>
          </div>
          {averageSessionGrade !== null && (
            <div className="flex items-center gap-2 bg-indigo-50/50 px-3 py-1 rounded-md border border-indigo-100/50 shrink-0">
              <span className="text-sm font-semibold text-indigo-900">Avg:</span>
              <span className="text-sm font-bold text-indigo-700">{averageSessionGrade} <span className="font-medium text-indigo-400 text-xs text-opacity-70">/ {getTotalSessionWeight(settings)}</span></span>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
          {renderSaveStatusButton()}
          {viewMode === 'session' && topicId !== 'NOT_DEFINED' && date !== 'NOT_DEFINED' && (
            <button
              onClick={() => {
                if (isEditingHeader) {
                  handleSaveHeaderChanges();
                } else {
                  setEditHeaderData({ quarter, section, topicId, date, sessionMode });
                  setIsEditingHeader(true);
                }
              }}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border ${
                isEditingHeader 
                  ? 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200' 
                  : 'bg-amber-50 text-amber-700 border-amber-200/50 hover:bg-amber-100'
              }`}
            >
              {isEditingHeader ? 'Save Header' : 'Edit Header'}
            </button>
          )}
          <button
            onClick={() => setIsFolderExplorerOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-sm shadow-indigo-600/20 border border-indigo-600"
          >
            <Folder size={16} /> Explorer
          </button>
          {viewMode === 'student' && selectedStudentId && onNavigate && (
            <button
              onClick={() => onNavigate('analytics', selectedStudentId)}
              className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20 border border-emerald-600"
            >
              Record Book
            </button>
          )}
        </div>
      </div>

      {/* Top Header: View Switcher & Session Mode */}
      <div className="flex flex-wrap items-center justify-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="bg-slate-100/80 p-1 rounded-lg border border-slate-200/60 flex items-center w-full sm:w-auto">
          <button
            onClick={() => setViewMode('session')}
            className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'session' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700 border border-transparent'}`}
          >
            Session View
          </button>
          <button
            onClick={() => setViewMode('student')}
            className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'student' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700 border border-transparent'}`}
          >
            Student View
          </button>
        </div>

        {viewMode === 'session' && (
          <div className={`p-1 rounded-lg border flex items-center transition-colors w-full sm:w-auto ${isEditingHeader ? 'bg-amber-50/50 border-amber-200/50' : 'bg-slate-100/80 border-slate-200/60'}`}>
            <button
              onClick={() => isEditingHeader ? setEditHeaderData(prev => ({ ...prev!, sessionMode: 'class' })) : setSessionMode('class')}
              className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-all ${(isEditingHeader ? editHeaderData?.sessionMode : sessionMode) === 'class' ? (isEditingHeader ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200' : 'bg-white text-indigo-700 shadow-sm border border-slate-200/50') : 'text-slate-500 hover:text-slate-700 border border-transparent'}`}
            >
              Class
            </button>
            <button
              onClick={() => isEditingHeader ? setEditHeaderData(prev => ({ ...prev!, sessionMode: 'quiz' })) : setSessionMode('quiz')}
              className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-all ${(isEditingHeader ? editHeaderData?.sessionMode : sessionMode) === 'quiz' ? (isEditingHeader ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200' : 'bg-white text-indigo-700 shadow-sm border border-slate-200/50') : 'text-slate-500 hover:text-slate-700 border border-transparent'}`}
            >
              Quiz
            </button>
            <button
              onClick={() => isEditingHeader ? setEditHeaderData(prev => ({ ...prev!, sessionMode: 'exam' })) : setSessionMode('exam')}
              className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-all ${(isEditingHeader ? editHeaderData?.sessionMode : sessionMode) === 'exam' ? (isEditingHeader ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200' : 'bg-white text-indigo-700 shadow-sm border border-slate-200/50') : 'text-slate-500 hover:text-slate-700 border border-transparent'}`}
            >
              Exam
            </button>
          </div>
        )}
      </div>

      {/* Selectors Grid with VisualInspector */}
      <VisualInspector minWidth={500}>
        {(isConstrained) => (
          <div className={`flex ${isConstrained ? 'flex-col' : 'flex-col lg:flex-row'} gap-4 min-w-0 w-full`}>
            {/* Left side: Quarter & Section */}
            <div className={`grid ${isConstrained ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:w-[40%]'} gap-4 shrink-0 min-w-0`}>
              <div className="min-w-0 w-full">
                <label className="block text-sm font-semibold text-indigo-950 mb-1.5 truncate">Quarter</label>
                <select
                  value={isEditingHeader ? editHeaderData?.quarter : quarter}
                  onChange={e => {
                    if (isEditingHeader) {
                      if (e.target.value === 'NEW') {
                        const newQ = prompt('Enter new Quarter (e.g., Q5):');
                        if (newQ && newQ.trim()) {
                          setCustomQuarters(prev => [...prev, newQ.trim()]);
                          setEditHeaderData(prev => ({ ...prev!, quarter: newQ.trim() as Quarter }));
                        }
                      } else {
                        setEditHeaderData(prev => ({ ...prev!, quarter: e.target.value as Quarter }));
                      }
                    } else {
                      if (e.target.value === 'NEW') {
                        const newQ = prompt('Enter new Quarter (e.g., Q5):');
                        if (newQ && newQ.trim()) {
                          setCustomQuarters(prev => [...prev, newQ.trim()]);
                          setQuarter(newQ.trim() as Quarter);
                        }
                      } else {
                        setQuarter(e.target.value as Quarter);
                      }
                    }
                  }}
                  className={`w-full max-w-full truncate px-3 py-2 border bg-white/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 shadow-sm transition-colors min-h-[42px] ${isEditingHeader ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200 hover:border-indigo-300'}`}
                >
                  {allQuarters.map(q => <option key={q} value={q}>{q}</option>)}
                  <option disabled>──────────</option>
                  <option value="NEW" className="font-semibold text-indigo-600">+ Add new ...</option>
                </select>
              </div>
              <div className="min-w-0 w-full">
                <label className="block text-sm font-semibold text-indigo-950 mb-1.5 truncate">Section</label>
                <select
                  value={isEditingHeader ? editHeaderData?.section : section}
                  onChange={e => {
                    if (isEditingHeader) {
                      if (e.target.value === 'NEW') {
                        const newS = prompt('Enter new Section (e.g., 10th Math):');
                        if (newS && newS.trim()) {
                          setCustomSections(prev => [...prev, newS.trim()]);
                          setEditHeaderData(prev => ({ ...prev!, section: newS.trim() }));
                        }
                      } else {
                        setEditHeaderData(prev => ({ ...prev!, section: e.target.value }));
                      }
                    } else {
                      if (e.target.value === 'NEW') {
                        const newS = prompt('Enter new Section (e.g., 10th Math):');
                        if (newS && newS.trim()) {
                          setCustomSections(prev => [...prev, newS.trim()]);
                          setSection(newS.trim());
                        }
                      } else {
                        setSection(e.target.value);
                      }
                    }
                  }}
                  className={`w-full max-w-full truncate px-3 py-2 border bg-white/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 shadow-sm transition-colors min-h-[42px] ${isEditingHeader ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200 hover:border-indigo-300'}`}
                >
                  {allSections.map(s => <option key={s} value={s}>{s}</option>)}
                  <option disabled>──────────</option>
                  <option value="NEW" className="font-semibold text-indigo-600">+ Add new ...</option>
                </select>
              </div>
            </div>
            
            {/* Right side: Topic & Session Date */}
            <div className={`flex ${isConstrained ? 'flex-col' : 'flex-col sm:flex-row'} gap-4 lg:w-[60%] flex-1 min-w-0`}>
          {viewMode !== 'student' && (
            <div className="flex-[3] min-w-0">
              <label className="block text-sm font-semibold text-indigo-950 mb-1.5 truncate">Topic / Lesson</label>
              {sessionMode === 'exam' ? (
                <div className="w-full px-4 py-2 border border-indigo-200 bg-indigo-50/50 rounded-lg text-indigo-800 font-medium flex items-center gap-2 shadow-sm truncate">
                  <GraduationCap size={18} className="shrink-0" />
                  <span className="truncate">Entering Quarter Exam Scores</span>
                </div>
              ) : isCreatingTopic ? (
                <div className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g., Introduction to Poetry"
                    value={newTopicTitle}
                    onChange={e => setNewTopicTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateTopic()}
                    className="flex-1 min-w-0 px-3 py-2 border border-indigo-300 bg-white/80 ring-2 ring-indigo-100/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400 text-slate-800 shadow-sm"
                  />
                  <button
                    onClick={handleCreateTopic}
                    className="px-4 py-2 bg-indigo-600/90 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm whitespace-nowrap shadow-sm shrink-0"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setIsCreatingTopic(false);
                      setNewTopicTitle('');
                      if (filteredTopics.length > 0 && (!topicId || topicId === 'NOT_DEFINED')) {
                        setTopicId('NOT_DEFINED');
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white/50 rounded-lg transition-colors shrink-0"
                    title="Cancel"
                  >
                    <X size={20} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 w-full min-w-0">
                  <select
                    value={isEditingHeader ? editHeaderData?.topicId || 'NOT_DEFINED' : topicId || 'NOT_DEFINED'}
                    onChange={async e => {
                      const val = e.target.value;
                      if (isEditingHeader) {
                        if (val === 'CREATE_NEW') {
                          setIsCreatingTopic(true);
                          setEditHeaderData(prev => ({ ...prev!, topicId: 'NOT_DEFINED' }));
                        } else if (val.startsWith('LP_')) {
                          // It's a lesson plan, let's create a topic from it
                          const planId = val.replace('LP_', '');
                          const plan = availableLessonPlans.find(lp => lp.id === planId);
                          
                          if (plan) {
                             setIsSaving(true);
                             const title = plan.chapterUnit ? `${plan.chapterUnit} - ${plan.sectionLesson}` : plan.sectionLesson;
                             const newTopic: Topic = {
                               id: `topic_${Date.now()}`,
                               title: title,
                               quarter: editHeaderData?.quarter || quarter,
                               section: editHeaderData?.section || section,
                               period: activePeriod
                             };
                             try {
                               await onSaveTopic(newTopic);
                               setEditHeaderData(prev => ({ ...prev!, topicId: newTopic.id }));
                               setIsCreatingTopic(false);
                               showToast('Topic created from Lesson Plan');
                             } catch (err) {
                               console.error(err);
                               showToast('Error creating topic');
                             } finally {
                               setIsSaving(false);
                             }
                          }
                        } else {
                          setEditHeaderData(prev => ({ ...prev!, topicId: val }));
                          setIsCreatingTopic(false);
                        }
                      } else {
                        if (val === 'CREATE_NEW') {
                          setIsCreatingTopic(true);
                          setTopicId('NOT_DEFINED');
                        } else if (val.startsWith('LP_')) {
                          // It's a lesson plan, let's create a topic from it
                          const planId = val.replace('LP_', '');
                          const plan = availableLessonPlans.find(lp => lp.id === planId);
                          
                          if (plan) {
                             setIsSaving(true);
                             const title = plan.chapterUnit ? `${plan.chapterUnit} - ${plan.sectionLesson}` : plan.sectionLesson;
                             const newTopic: Topic = {
                               id: `topic_${Date.now()}`,
                               title: title,
                               quarter,
                               section,
                               period: activePeriod
                             };
                             try {
                               await onSaveTopic(newTopic);
                               
                               if (topicId === 'NOT_DEFINED' && isDirty && latestSessionRef.current) {
                                 const oldSessionId = `NOT_DEFINED_${date}`;
                                 const newSessionId = `${newTopic.id}_${date}`;
                                 const sessionToMove = {
                                   ...latestSessionRef.current,
                                   id: newSessionId,
                                   topicId: newTopic.id,
                                 } as Session;
                                 
                                 try {
                                   await onSaveSession(sessionToMove);
                                   if (sessions.some(s => s.id === oldSessionId)) {
                                     await onDeleteSession(oldSessionId);
                                   }
                                   showToast('Session moved to new topic from Lesson Plan');
                                 } catch (e) {
                                   console.error("Error moving session: ", e);
                                   showToast('Failed to save session, but topic created.');
                                 }
                                 
                                 setTopicId(newTopic.id);
                                 setIsCreatingTopic(false);
                                 setIsDirty(false);
                                 lastLoadedRef.current = { topicId: newTopic.id, date, isCreatingTopic: false, sessionDataStr: JSON.stringify(sessionToMove) };
                                 latestSessionRef.current = sessionToMove;
                               } else {
                                 setTopicId(newTopic.id);
                                 showToast('Topic created from Lesson Plan');
                               }
                             } catch (err) {
                               console.error(err);
                               showToast('Error creating topic');
                             } finally {
                               setIsSaving(false);
                             }
                          }
                        } else {
                          if (topicId === 'NOT_DEFINED' && isDirty && latestSessionRef.current) {
                            const oldSessionId = `NOT_DEFINED_${date}`;
                            const newSessionId = `${val}_${date}`;
                            const sessionToMove = {
                              ...latestSessionRef.current,
                              id: newSessionId,
                              topicId: val,
                            } as Session;
                            
                            try {
                              // Save the moved session
                              await onSaveSession(sessionToMove);
                              
                              // Delete the old 'NOT_DEFINED' session if it was saved
                              if (sessions.some(s => s.id === oldSessionId)) {
                                await onDeleteSession(oldSessionId);
                              }
                              showToast('Session moved to selected topic');
                            } catch (e) {
                              console.error("Error moving session: ", e);
                              showToast('Failed to save session, but topic selected.');
                            }
                            
                            // Update state
                            setTopicId(val);
                            setIsCreatingTopic(false);
                            setIsDirty(false); // Reset dirty flag so useEffect doesn't save it again
                            lastLoadedRef.current = { topicId: val, date, isCreatingTopic: false, sessionDataStr: JSON.stringify(sessionToMove) };
                            latestSessionRef.current = sessionToMove;
                          } else {
                            setTopicId(val);
                            setIsCreatingTopic(false);
                          }
                        }
                      }
                    }}
                    className={`flex-1 min-w-0 max-w-full truncate px-3 py-2 border bg-white/80 rounded-lg min-h-[42px] focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm text-slate-800 transition-colors ${isEditingHeader ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200 hover:border-indigo-300'}`}
                  >
                    <option value="NOT_DEFINED">Not defined</option>
                    {displayTopics.length === 0 && displayAvailableLessonPlans.length === 0 && <option value="empty_disabled" disabled>No topics found</option>}
                    {displayTopics.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                    {displayAvailableLessonPlans.length > 0 && (
                      <>
                        <option disabled>── From Lesson Planner ──</option>
                        {displayAvailableLessonPlans.map(lp => (
                          <option key={lp.id} value={`LP_${lp.id}`}>
                            {lp.chapterUnit ? `${lp.chapterUnit} - ${lp.sectionLesson}` : lp.sectionLesson}
                          </option>
                        ))}
                      </>
                    )}
                    <option disabled>──────────</option>
                    <option value="CREATE_NEW" className="font-semibold text-indigo-600">
                      + Add new ...
                    </option>
                  </select>
                  {topicId && topicId !== 'NOT_DEFINED' && (
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'Delete Topic',
                          message: 'Are you sure you want to delete this topic and all its sessions?',
                          onConfirm: async () => {
                            await onDeleteTopic(topicId);
                            setTopicId('NOT_DEFINED');
                          }
                        });
                      }}
                      className="w-[42px] h-[42px] flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors border border-rose-200 bg-white/50 shrink-0 shadow-sm"
                      title="Delete Topic"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {viewMode === 'session' ? (
            <div className="flex-[2] min-w-0">
              <label className="block text-sm font-semibold text-indigo-950 mb-1.5 truncate">Session Date</label>
              <div className="flex gap-2 w-full min-w-0">
                <select
                  value={isEditingHeader ? editHeaderData?.date || 'NOT_DEFINED' : date}
                  onChange={e => {
                    if (isEditingHeader) {
                      if (e.target.value === 'NEW') {
                        let newDate = new Date();
                        let dateStr = getLocalDateString(newDate);
                        let counter = 1;
                        while (sessions.some(s => s.topicId === editHeaderData?.topicId && s.date === dateStr)) {
                          newDate.setDate(newDate.getDate() + 1);
                          dateStr = getLocalDateString(newDate);
                          counter++;
                          if (counter > 30) break;
                        }
                        setEditHeaderData(prev => ({ ...prev!, date: dateStr }));
                      } else {
                        setEditHeaderData(prev => ({ ...prev!, date: e.target.value }));
                      }
                    } else {
                      if (e.target.value === 'NEW') {
                        let newDate = new Date();
                        let dateStr = getLocalDateString(newDate);
                        let counter = 1;
                        while (sessions.some(s => s.topicId === topicId && s.date === dateStr)) {
                          newDate.setDate(newDate.getDate() + 1);
                          dateStr = getLocalDateString(newDate);
                          counter++;
                          if (counter > 30) break;
                        }
                        setDate(dateStr);
                      } else {
                        setDate(e.target.value);
                      }
                    }
                  }}
                  disabled={sessionMode === 'exam' && !isEditingHeader}
                  className={`flex-1 min-w-0 max-w-full truncate px-3 py-2 border bg-white/80 rounded-lg min-h-[42px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 shadow-sm transition-colors ${isEditingHeader ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200 hover:border-indigo-300'} ${(sessionMode === 'exam' && !isEditingHeader) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <option value="NOT_DEFINED">Not defined</option>
                  {Array.from(new Set(sessions.filter(s => s.topicId === (isEditingHeader ? editHeaderData?.topicId : topicId)).map(s => s.date))).sort((a, b) => {
                    const [aYear, aMonth, aDay] = a.split('-');
                    const [bYear, bMonth, bDay] = b.split('-');
                    return new Date(Number(bYear), Number(bMonth) - 1, Number(bDay)).getTime() - new Date(Number(aYear), Number(aMonth) - 1, Number(aDay)).getTime();
                  }).map(d => (
                    <option key={d} value={d}>
                      {formatLocalDate(d)}
                    </option>
                  ))}
                  {(isEditingHeader ? editHeaderData?.date : date) !== 'NOT_DEFINED' && !sessions.some(s => s.topicId === (isEditingHeader ? editHeaderData?.topicId : topicId) && s.date === (isEditingHeader ? editHeaderData?.date : date)) && (
                    <option value={isEditingHeader ? editHeaderData?.date : date}>{formatLocalDate(isEditingHeader ? editHeaderData?.date || '' : date)} (New)</option>
                  )}
                  <option disabled>──────────</option>
                  <option value="NEW" className="font-semibold text-indigo-600">+ Add new session</option>
                </select>
                <div className="relative w-[42px] h-[42px] shrink-0">
                  <input
                    type="date"
                    value={isEditingHeader ? editHeaderData?.date || '' : (date !== 'NOT_DEFINED' ? date : '')}
                    onChange={e => {
                      if (e.target.value) {
                        if (isEditingHeader) {
                          setEditHeaderData(prev => ({ ...prev!, date: e.target.value }));
                        } else {
                          setDate(e.target.value);
                        }
                      }
                    }}
                    disabled={sessionMode === 'exam' && !isEditingHeader}
                    title="Pick custom date"
                    className={`absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer ${(sessionMode === 'exam' && !isEditingHeader) ? 'cursor-not-allowed' : ''}`}
                  />
                  <div className={`w-full h-full flex items-center justify-center border bg-white/80 rounded-lg shadow-sm transition-colors ${isEditingHeader ? 'border-amber-400 text-amber-600' : 'border-slate-200 text-indigo-600 hover:bg-white'} ${(sessionMode === 'exam' && !isEditingHeader) ? 'opacity-50' : ''}`}>
                    <Calendar size={18} />
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (date === 'NOT_DEFINED') return;
                    const session = sessions.find(s => s.topicId === topicId && s.date === date);
                    if (session) {
                      setConfirmModal({
                        isOpen: true,
                        title: 'Delete Session',
                        message: 'Are you sure you want to delete this saved session?',
                        onConfirm: async () => {
                          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                          latestSessionRef.current = null;
                          setIsDirty(false);
                          lastLoadedRef.current = { ...lastLoadedRef.current, date: 'NOT_DEFINED', sessionDataStr: null };
                          
                          // Clear UI state immediately
                          const recs: Record<string, StudentRecord> = {};
                          sectionStudents.forEach(s => {
                            recs[s.id] = { studentId: s.id, present: false, participation: null, rawParticipation: null, classwork: null, homework: 'None Assigned', behavior: null, quizStatus: 'None', extraPoints: 0, punishment: 0 };
                          });
                          setRecords(recs);
                          setAnnotation('');
                          setObjective('');

                          await onDeleteSession(session.id);
                          setDate('NOT_DEFINED');
                        }
                      });
                    } else {
                      // It's an unsaved session, just clear it by picking another date
                      setConfirmModal({
                        isOpen: true,
                        title: 'Discard Session',
                        message: 'Are you sure you want to discard this unsaved session?',
                        onConfirm: () => {
                          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                          latestSessionRef.current = null;
                          setIsDirty(false);
                          lastLoadedRef.current = { ...lastLoadedRef.current, date: 'NOT_DEFINED', sessionDataStr: null };
                          
                          // Clear UI state immediately
                          const recs: Record<string, StudentRecord> = {};
                          sectionStudents.forEach(s => {
                            recs[s.id] = { studentId: s.id, present: false, participation: null, rawParticipation: null, classwork: null, homework: 'None Assigned', behavior: null, quizStatus: 'None', extraPoints: 0, punishment: 0 };
                          });
                          setRecords(recs);
                          setAnnotation('');
                          setObjective('');

                          setDate('NOT_DEFINED');
                        }
                      });
                    }
                  }}
                  disabled={date === 'NOT_DEFINED'}
                  className={`w-[42px] h-[42px] flex items-center justify-center rounded-lg transition-colors border shrink-0 shadow-sm ${date === 'NOT_DEFINED' ? 'text-slate-300 border-slate-200 bg-slate-50 cursor-not-allowed' : 'text-rose-500 hover:text-rose-700 hover:bg-rose-50 border-rose-200 bg-white/50'}`}
                  title="Delete Session"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-[2] min-w-0">
              <label className="block text-sm font-semibold text-indigo-950 mb-1.5 truncate">Student</label>
              <select
                value={selectedStudentId}
                onChange={e => setSelectedStudentId(e.target.value)}
                className="w-full min-w-0 max-w-full truncate px-3 py-2 min-h-[42px] border border-slate-200 bg-white/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 shadow-sm hover:border-indigo-300 transition-colors"
              >
                <option value="" disabled>Select a student...</option>
                {sectionStudents.map(student => (
                  <option key={student.id} value={student.id}>
                    {student.lastName}, {student.firstName}
                  </option>
                ))}
              </select>
            </div>
          )}
          </div>
        </div>
        )}
      </VisualInspector>
    </div>
  );

  const renderCompactTopControls = () => (
    <div className="bg-white/80 backdrop-blur-md px-3 sm:px-5 py-1.5 sm:py-2 rounded-2xl shadow-md shadow-slate-200/50 border border-white/60 ring-1 ring-black/5 flex items-center justify-start md:justify-center gap-2 sm:gap-3 w-[calc(100%-1rem)] sm:w-full max-w-4xl overflow-x-auto no-scrollbar">
      <button onClick={() => setShowFloatingControls(true)} className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 hover:bg-indigo-50/80 rounded-xl text-xs sm:text-sm font-medium text-slate-700 transition-colors shrink-0">
        <Calendar size={14} className="text-indigo-500" />
        <span className="hidden sm:inline">{quarter}</span>
      </button>
      <div className="w-px h-4 bg-slate-200 shrink-0" />
      <button onClick={() => setShowFloatingControls(true)} className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 hover:bg-indigo-50/80 rounded-xl text-xs sm:text-sm font-medium text-slate-700 transition-colors shrink-0">
        <Users size={14} className="text-indigo-500" />
        <span className="hidden sm:inline">{section}</span>
      </button>
      <div className="w-px h-4 bg-slate-200 shrink-0" />
      <button onClick={() => setShowFloatingControls(true)} className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 hover:bg-indigo-50/80 rounded-xl text-xs sm:text-sm font-medium text-slate-700 transition-colors max-w-[120px] sm:max-w-[200px] shrink-0">
        <BookOpen size={14} className="text-indigo-500 shrink-0" />
        <span className="truncate">{filteredTopics.find(t => t.id === topicId)?.title || 'Select Topic'}</span>
      </button>
      <div className="w-px h-4 bg-slate-200 shrink-0" />
      <button onClick={() => setShowFloatingControls(true)} className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 hover:bg-indigo-50/80 rounded-xl text-xs sm:text-sm font-medium text-slate-700 transition-colors shrink-0">
        <Clock size={14} className="text-indigo-500" />
        <span className="hidden sm:inline">{date === 'NOT_DEFINED' ? 'Not defined' : date}</span>
      </button>
      {topicId && topicId !== 'NOT_DEFINED' && (
        <>
          <div className="w-px h-4 bg-slate-200 shrink-0" />
          <button
            onClick={() => {
              setConfirmModal({
                isOpen: true,
                title: 'Delete Topic',
                message: 'Are you sure you want to delete this topic and all its sessions?',
                onConfirm: async () => {
                  await onDeleteTopic(topicId);
                  setTopicId('NOT_DEFINED');
                }
              });
            }}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 hover:bg-rose-50 rounded-xl text-xs sm:text-sm font-medium text-rose-500 hover:text-rose-600 transition-colors shrink-0"
            title="Delete Topic"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </>
      )}
    </div>
  );

  const renderModeTabs = (isFloating: boolean) => (
    <div 
      ref={!isFloating ? tabsRef : undefined}
      className={`bg-white/80 backdrop-blur-md p-1.5 sm:p-2 rounded-2xl shadow-md shadow-slate-200/50 border border-white/60 ring-1 ring-black/5 flex flex-wrap justify-center gap-1.5 sm:gap-2 pointer-events-auto transition-all duration-300 w-[calc(100%-1rem)] sm:w-full mx-auto max-w-4xl`}
    >
      {modes.map(mode => {
        const Icon = mode.icon;
        const isActive = activeMode === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => setActiveMode(mode.id)}
            title={mode.label}
            className={`flex-1 sm:flex-none min-w-[100px] sm:min-w-0 flex items-center justify-center gap-2 px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
              isActive 
                ? 'bg-indigo-600/90 text-white shadow-md' 
                : 'text-slate-600 hover:bg-white/50 hover:text-indigo-600'
            }`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="truncate">{mode.label}</span>
          </button>
        );
      })}
      <div className="w-px h-6 bg-indigo-100 my-auto mx-1 hidden sm:block" />
      <button
        onClick={() => {
          setNewSessionType('class');
          setIsNewSessionModalOpen(true);
        }}
        disabled={!topicId || sessionMode === 'exam'}
        title="Add New Session"
        className={`flex-1 sm:flex-none min-w-[100px] sm:min-w-0 flex items-center justify-center gap-2 px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Plus size={16} className="shrink-0" />
        <span className="truncate">New Session</span>
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div ref={topControlsRef}>
        {renderTopControls()}
      </div>

      <FolderExplorerModal
        isOpen={isFolderExplorerOpen}
        onClose={() => setIsFolderExplorerOpen(false)}
        sessions={sessions}
        topics={topics}
        settings={settings}
        onSelectSession={(tId, d) => {
          const topic = topics.find(t => t.id === tId);
          if (topic) {
            setQuarter(topic.quarter);
            setSection(topic.section);
            setTopicId(tId);
            setDate(d);
          }
        }}
      />

      {/* Floating Controls Modal */}
      {showFloatingControls && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[100px] md:pt-[60px] px-4">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setShowFloatingControls(false)} />
          <div className="relative w-full max-w-4xl animate-in fade-in slide-in-from-top-4 duration-200">
            {renderTopControls()}
            <button 
              onClick={() => setShowFloatingControls(false)}
              className="absolute -top-3 -right-3 p-1.5 bg-white text-slate-500 hover:text-slate-700 rounded-full shadow-md border border-slate-200"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Objective, Annotations & Reminders */}
      <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50 flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-indigo-950 mb-1">Session Objective</label>
          <DebouncedTextarea
            value={objective}
            onChange={val => {
              setObjective(val);
              setIsDirty(true);
            }}
            placeholder="What are the learning objectives for this session?"
            className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 resize-none h-20"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-indigo-950 mb-1">Session Annotations</label>
            <DebouncedTextarea
              value={annotation}
              onChange={val => {
                setAnnotation(val);
                setIsDirty(true);
              }}
              placeholder="Add notes, observations, or reminders for this session..."
              className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 resize-none h-20"
            />
          </div>
          <div className="sm:w-48 flex flex-col justify-end">
            <button
              onClick={handleAddReminder}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600/90 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm h-10"
            >
              <CheckSquare size={18} />
              Add to Tasks
            </button>
          </div>
        </div>
      </div>

      {/* Split Layout Area */}
      {viewMode === 'session' ? (
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* Left Column: Student List */}
        <div className={`w-full lg:w-1/3 flex-shrink-0 ${isRosterOpen ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-white/60 backdrop-blur-md rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50 overflow-hidden flex flex-col max-h-[600px] h-fit">
            <div className="p-4 border-b border-white/50 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-indigo-950">Class Roster</h3>
                <p className="text-xs text-slate-500 mt-1">Showing accumulated avg for this topic</p>
              </div>
              <button 
                className="lg:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-white/50 rounded-lg transition-colors"
                onClick={() => setIsRosterOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-1">
              {sectionStudents.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-sm">No students enrolled.</div>
              ) : (
                sectionStudents.map(student => {
                  const record = records[student.id];
                  const isAbsent = record && !record.present;
                  
                  return (
                    <div 
                      key={student.id} 
                      className={`flex items-center justify-between p-3 rounded-xl border border-transparent transition-colors ${
                        isAbsent ? 'bg-rose-50/50 opacity-75' : 'hover:bg-white/40'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className={`font-medium truncate ${isAbsent ? 'text-rose-900 line-through decoration-rose-300' : 'text-slate-800'}`}>
                          {student.lastName}, {student.firstName}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5 truncate">{student.id}</div>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-sm font-bold text-indigo-600 bg-indigo-50/80 px-2 py-1 rounded-lg border border-indigo-100/50">
                          {studentAverages[student.id] || '--'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Input Area */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          {/* Mobile Roster Toggle */}
          <button 
            className={`lg:hidden w-full py-3 bg-white/60 backdrop-blur-md rounded-2xl border border-white/50 text-indigo-900 font-medium shadow-sm flex items-center justify-center gap-2 transition-all ${isRosterOpen ? 'hidden' : 'flex'}`}
            onClick={() => setIsRosterOpen(true)}
          >
            <UserCheck size={18} />
            Show Class Roster
          </button>

          {/* Static Mode Tabs (in place) - Mobile Only */}
          <div className="mb-4 md:hidden">
            {renderModeTabs(false)}
          </div>

          {/* Floating/Sticky Container */}
          <div className={`fixed md:sticky z-40 top-4 md:top-0 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isScrollingDown ? '-translate-y-[150%] opacity-0 md:translate-y-0 md:opacity-100' : 'translate-y-0 opacity-100'} ${!isTopControlsVisible ? 'opacity-100' : 'opacity-0 md:opacity-100'} ${isFolderExplorerOpen ? '!opacity-0 !pointer-events-none' : ''}`}>
            {/* Compact Floating Top Controls */}
            <div className={`transition-all duration-300 pointer-events-auto flex justify-center w-full ${!isTopControlsVisible ? 'h-auto opacity-100 translate-y-0 mb-2' : 'h-0 opacity-0 -translate-y-4 mb-0 overflow-hidden'} ${isFolderExplorerOpen ? '!h-0' : ''}`}>
              {renderCompactTopControls()}
            </div>

            {/* Floating Mode Tabs */}
            <div className={`transition-all duration-300 pointer-events-auto flex justify-center w-full ${!isTopControlsVisible ? 'h-auto opacity-100 translate-y-0' : 'h-0 opacity-0 -translate-y-4 overflow-hidden md:h-auto md:opacity-100 md:translate-y-0 md:overflow-visible'} ${isFolderExplorerOpen ? '!h-0 md:!h-0' : ''}`}>
              {renderModeTabs(true)}
            </div>
          </div>

          {/* Input Panel */}
          <div className="bg-white/60 backdrop-blur-md rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50 flex-1 flex flex-col relative min-h-[400px]">
            {/* Contextual Header Actions */}
            <div className="p-4 border-b border-white/50 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 rounded-t-2xl">
              <div className="w-full sm:w-auto flex flex-wrap justify-between sm:justify-start items-center gap-2">
                {activeMode === 'attendance' && (
                  <>
                    <button onClick={markAllPresent} disabled={!topicId} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/80 border border-white/50 text-slate-700 rounded-lg hover:bg-white text-sm font-medium disabled:opacity-50 shadow-sm">
                      <CheckSquare size={16} /> Mark All Present
                    </button>
                    <button onClick={markAllF} disabled={!topicId} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/80 border border-white/50 text-slate-700 rounded-lg hover:bg-white text-sm font-medium disabled:opacity-50 shadow-sm">
                      <X size={16} /> Mark All F
                    </button>
                  </>
                )}
                {activeMode === 'homework' && (
                  <>
                    <button onClick={setAllHwSubmitted} disabled={!topicId} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/80 border border-white/50 text-slate-700 rounded-lg hover:bg-white text-sm font-medium disabled:opacity-50 shadow-sm">
                      <FileText size={16} /> All HW Submitted
                    </button>
                    <button onClick={setAllHwNotSubmitted} disabled={!topicId} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/80 border border-white/50 text-slate-700 rounded-lg hover:bg-white text-sm font-medium disabled:opacity-50 shadow-sm">
                      <FileX size={16} /> All HW Not Submitted
                    </button>
                  </>
                )}
                {(activeMode === 'attendance' || activeMode === 'participation' || activeMode === 'behavior' || activeMode === 'homework') && (
                  <button onClick={markAllNA} disabled={!topicId} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/80 border border-white/50 text-slate-700 rounded-lg hover:bg-white text-sm font-medium disabled:opacity-50 shadow-sm">
                    <MinusCircle size={16} /> Mark All N/A
                  </button>
                )}
                {(activeMode === 'quiz' || activeMode === 'adjustments') && (
                  <span className="text-sm text-slate-500 font-medium px-2 flex items-center gap-2">
                    {activeMode === 'quiz' && <><GraduationCap size={16}/> Enter quiz scores</>}
                    {activeMode === 'adjustments' && <><Sliders size={16}/> Add extra points or punishments</>}
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2 self-end sm:self-auto">
                {renderSaveStatusButton()}
              </div>
            </div>

            {/* Input List */}
            <div className="overflow-y-auto overflow-x-auto flex-1 p-4">
              {!topicId || isCreatingTopic ? (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Please select or create a topic to start grading.
                </div>
              ) : sectionStudents.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500">
                  No students to grade.
                </div>
              ) : (
                <div className="space-y-3">
                  {sectionStudents.map(student => {
                    const record = records[student.id];
                    if (!record) return null;
                    const isAbsent = !record.present;

                    return (
                      <div 
                        key={student.id} 
                        id={`student-row-${student.id}`}
                        className={`flex flex-col p-4 rounded-xl border transition-all duration-500 gap-3 ${isAbsent && activeMode !== 'attendance' ? 'bg-slate-50/50 border-white/50 opacity-60' : 'bg-white/80 border-white/50 shadow-sm'}`}
                      >
                        <div className="flex flex-col gap-3 w-full">
                          <div className="flex items-center justify-between w-full border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2 pr-4 min-w-0 flex-1">
                              <button
                                onClick={() => {
                                  let currentAlerts = record.alerts || [];
                                  const newAlerts = currentAlerts.includes(activeMode)
                                    ? currentAlerts.filter(m => m !== activeMode)
                                    : [...currentAlerts, activeMode];
                                  updateRecord(student.id, 'alerts', newAlerts);
                                }}
                                className={`p-1.5 rounded-md transition-colors shrink-0 outline-none ${record.alerts?.includes(activeMode) ? 'text-rose-500 bg-rose-50 hover:bg-rose-100 border border-rose-200' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'}`}
                                title={record.alerts?.includes(activeMode) ? `Remove alert for ${activeMode}` : `Add alert for ${activeMode}`}
                              >
                                <AlertTriangle size={16} />
                              </button>
                              <div className="font-medium text-indigo-950 truncate" title={`${student.lastName}, ${student.firstName}`}>
                                {student.lastName}, {student.firstName}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                                {sessionMode === 'class' ? 'Session Grade:' : (sessionMode === 'quiz' ? 'Quiz Grade:' : 'Exam Grade:')}
                              </span>
                              <span className="text-sm font-bold text-indigo-600 bg-indigo-50/80 px-2 py-1 rounded-lg border border-indigo-100/50">
                                {record.present ? (
                                  sessionMode === 'class' ? (
                                    <>{calculateSessionScore(record, Object.values(records), settings)} <span className="text-xs text-indigo-400">/ {getTotalSessionWeight(settings)}</span></>
                                  ) : (
                                    <>{record.quiz !== undefined ? record.quiz : '--'} <span className="text-xs text-indigo-400">/ 100</span></>
                                  )
                                ) : '--'}
                              </span>
                            </div>
                          </div>
                          
                          <div className="w-full flex justify-start sm:justify-end max-w-full">
                            {/* ATTENDANCE MODE */}
                            {activeMode === 'attendance' && (
                              <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-3 sm:gap-4 w-full sm:w-auto max-w-full">
                                <label className="inline-flex items-center cursor-pointer shrink-0">
                                  <span className={`mr-3 text-sm font-medium ${record.present ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    {record.present ? 'Present' : 'Absent'}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={record.present}
                                    onChange={e => updateRecord(student.id, 'present', e.target.checked)}
                                    className="sr-only peer"
                                  />
                                  <div className="relative w-11 h-6 bg-rose-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                </label>
                                
                                {config.classwork.enabled && sessionMode === 'class' && (
                                  <div className="flex flex-wrap items-center justify-end gap-2 sm:border-l sm:border-slate-200 sm:pl-4">
                                    <span className="text-xs font-medium text-slate-500 mr-1">Class Work:</span>
                                    {['A', 'B', 'C', 'F', 'N/A'].map(pts => (
                                      <button
                                        key={pts}
                                        onClick={() => updateRecord(student.id, 'classwork', record.classwork === pts ? null : pts as any)}
                                        disabled={isAbsent}
                                        className={`h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${pts === 'N/A' ? 'px-2' : 'w-8'} ${
                                          record.classwork === pts 
                                            ? 'bg-indigo-600 text-white shadow-md' 
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        } ${isAbsent ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      >
                                        {pts}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* PARTICIPATION MODE */}
                            {activeMode === 'participation' && config.participation.enabled && (
                              <div className="flex flex-wrap items-center justify-end gap-4 max-w-full">
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    onClick={() => {
                                      const current = record.participation;
                                      if (current === null || current === undefined) {
                                        updateRecord(student.id, 'participation', 0);
                                      } else {
                                        updateRecord(student.id, 'participation', Math.max(0, current - 1));
                                      }
                                    }}
                                    disabled={isAbsent || record.participation === 0}
                                    className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center hover:bg-rose-200 disabled:opacity-50 transition-colors shrink-0"
                                  >
                                    <Minus size={20} />
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    max="10"
                                    value={record.participation === null || record.participation === undefined ? '' : record.participation}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '') {
                                        updateRecord(student.id, 'participation', null);
                                      } else {
                                        const num = parseInt(val, 10);
                                        if (!isNaN(num)) {
                                          updateRecord(student.id, 'participation', Math.min(10, Math.max(0, num)));
                                        }
                                      }
                                    }}
                                    disabled={isAbsent}
                                    className="w-16 h-10 text-center font-bold text-xl text-indigo-600 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="-"
                                  />
                                  <button
                                    onClick={() => {
                                      const current = record.participation;
                                      if (current === null || current === undefined) {
                                        updateRecord(student.id, 'participation', 1);
                                      } else {
                                        updateRecord(student.id, 'participation', Math.min(10, current + 1));
                                      }
                                    }}
                                    disabled={isAbsent || record.participation === 10}
                                    className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center hover:bg-emerald-200 disabled:opacity-50 transition-colors shrink-0"
                                  >
                                    <Plus size={20} />
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* BEHAVIOR MODE */}
                            {activeMode === 'behavior' && config.behavior.enabled && (
                              <div className="flex flex-wrap items-center justify-end gap-4 max-w-full">
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    onClick={() => {
                                      const current = record.behavior;
                                      if (current === null || current === undefined) {
                                        updateRecord(student.id, 'behavior', 0);
                                      } else {
                                        updateRecord(student.id, 'behavior', Math.max(0, current - 1));
                                      }
                                    }}
                                    disabled={isAbsent || record.behavior === 0}
                                    className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center hover:bg-rose-200 disabled:opacity-50 transition-colors shrink-0"
                                  >
                                    <Minus size={20} />
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    max="10"
                                    value={record.behavior === null || record.behavior === undefined ? '' : record.behavior}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '') {
                                        updateRecord(student.id, 'behavior', null);
                                      } else {
                                        const num = parseInt(val, 10);
                                        if (!isNaN(num)) {
                                          updateRecord(student.id, 'behavior', Math.min(10, Math.max(0, num)));
                                        }
                                      }
                                    }}
                                    disabled={isAbsent}
                                    className="w-16 h-10 text-center font-bold text-xl text-indigo-600 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="-"
                                  />
                                  <button
                                    onClick={() => {
                                      const current = record.behavior;
                                      if (current === null || current === undefined) {
                                        updateRecord(student.id, 'behavior', 1);
                                      } else {
                                        updateRecord(student.id, 'behavior', Math.min(10, current + 1));
                                      }
                                    }}
                                    disabled={isAbsent || record.behavior === 10}
                                    className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center hover:bg-emerald-200 disabled:opacity-50 transition-colors shrink-0"
                                  >
                                    <Plus size={20} />
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* HOMEWORK MODE */}
                            {activeMode === 'homework' && config.homework.enabled && (
                              <div className="flex flex-wrap items-center justify-end gap-2 max-w-full">
                                <button
                                  onClick={() => updateRecord(student.id, 'homework', 'Completed')}
                                  disabled={isAbsent}
                                  title={`Completed (${config.homework.statuses.Completed}%)`}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    (record.homework === 'Completed' || record.homework === 'Submitted') && !isAbsent
                                      ? 'bg-green-500 text-white shadow-md ring-2 ring-green-200 ring-offset-1'
                                      : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600'
                                  } ${isAbsent ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  Completed
                                </button>
                                <button
                                  onClick={() => updateRecord(student.id, 'homework', 'Late')}
                                  disabled={isAbsent}
                                  title={`Late (${config.homework.statuses.Late}%)`}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    record.homework === 'Late' && !isAbsent
                                      ? 'bg-blue-500 text-white shadow-md ring-2 ring-blue-200 ring-offset-1'
                                      : 'bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600'
                                  } ${isAbsent ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  Late
                                </button>
                                <button
                                  onClick={() => updateRecord(student.id, 'homework', 'Incomplete')}
                                  disabled={isAbsent}
                                  title={`Incomplete (${config.homework.statuses.Incomplete}%)`}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    (record.homework === 'Incomplete' || record.homework === 'Incompleted') && !isAbsent
                                      ? 'bg-yellow-400 text-white shadow-md ring-2 ring-yellow-200 ring-offset-1'
                                      : 'bg-gray-100 text-gray-500 hover:bg-yellow-50 hover:text-yellow-600'
                                  } ${isAbsent ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  Incomplete
                                </button>
                                <button
                                  onClick={() => updateRecord(student.id, 'homework', 'Not Submitted')}
                                  disabled={isAbsent}
                                  title={`Not Submitted (${config.homework.statuses.NotSubmitted}%)`}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    record.homework === 'Not Submitted' && !isAbsent
                                      ? 'bg-red-500 text-white shadow-md ring-2 ring-red-200 ring-offset-1'
                                      : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600'
                                  } ${isAbsent ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  Not Submitted
                                </button>
                                <button
                                  onClick={() => updateRecord(student.id, 'homework', 'N/A')}
                                  disabled={isAbsent}
                                  title="N/A (Not Graded)"
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    (record.homework === 'N/A' || record.homework === 'None Assigned') && !isAbsent
                                      ? 'bg-gray-600 text-white shadow-md ring-2 ring-gray-200 ring-offset-1'
                                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                                  } ${isAbsent ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  N/A
                                </button>
                              </div>
                            )}

                            {/* QUIZ MODE */}
                            {activeMode === 'quiz' && (
                              <div className="flex flex-wrap items-center justify-end gap-3 max-w-full">
                                <select
                                  value={record.quizStatus || (record.quiz !== undefined ? 'Graded' : 'None')}
                                  onChange={e => updateRecord(student.id, 'quizStatus', e.target.value)}
                                  disabled={isAbsent}
                                  className={`px-3 py-2 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                    isAbsent ? 'bg-transparent text-gray-400 border-transparent' : 'bg-white border-gray-300 text-gray-700'
                                  }`}
                                >
                                  <option value="None">No Quiz</option>
                                  <option value="Graded">Graded</option>
                                  <option value="Exonerated">Exonerated</option>
                                  <option value="Absent">Absent</option>
                                </select>
                                
                                {(record.quizStatus === 'Graded' || (!record.quizStatus && record.quiz !== undefined)) && (
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      placeholder="--"
                                      value={record.quiz === undefined ? '' : record.quiz}
                                      onChange={e => {
                                        const val = e.target.value;
                                        updateRecord(student.id, 'quiz', val === '' ? undefined : parseInt(val));
                                      }}
                                      disabled={isAbsent}
                                      className={`w-20 px-3 py-2 border rounded-xl text-center font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                                        isAbsent ? 'bg-transparent text-gray-400 border-transparent' : 'bg-white border-gray-300 text-indigo-900 focus:border-indigo-500 shadow-sm'
                                      }`}
                                    />
                                  </div>
                                )}
                              </div>
                            )}

                            {/* ADJUSTMENTS MODE */}
                            {activeMode === 'adjustments' && config.adjustments.enabled && (
                              <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-4 max-w-full">
                                <div className="flex items-center gap-2 bg-green-50/50 p-1 rounded-xl border border-green-100 shrink-0">
                                  <label className="text-xs text-green-700 font-medium w-12 text-center">Extra</label>
                                  <button 
                                    onClick={() => updateRecord(student.id, 'extraPoints', Math.max(0, (record.extraPoints || 0) - 1))}
                                    disabled={isAbsent || !record.extraPoints}
                                    className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-green-600 shadow-sm border border-green-200 disabled:opacity-50"
                                  >-</button>
                                  <span className="w-6 text-center font-bold text-green-700">{record.extraPoints || 0}</span>
                                  <button 
                                    onClick={() => updateRecord(student.id, 'extraPoints', Math.min(10, (record.extraPoints || 0) + 1))}
                                    disabled={isAbsent || (record.extraPoints || 0) >= 10}
                                    className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-green-600 shadow-sm border border-green-200 disabled:opacity-50"
                                  >+</button>
                                </div>
                                <div className="flex items-center gap-2 bg-red-50/50 p-1 rounded-xl border border-red-100 shrink-0">
                                  <label className="text-xs text-red-700 font-medium w-12 text-center">Punish</label>
                                  <button 
                                    onClick={() => updateRecord(student.id, 'punishment', Math.max(0, (record.punishment || 0) - 1))}
                                    disabled={isAbsent || !record.punishment}
                                    className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-red-600 shadow-sm border border-red-200 disabled:opacity-50"
                                  >-</button>
                                  <span className="w-6 text-center font-bold text-red-700">{record.punishment || 0}</span>
                                  <button 
                                    onClick={() => updateRecord(student.id, 'punishment', Math.min(10, (record.punishment || 0) + 1))}
                                    disabled={isAbsent || (record.punishment || 0) >= 10}
                                    className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-red-600 shadow-sm border border-red-200 disabled:opacity-50"
                                  >+</button>
                                </div>
                              </div>
                            )}
                            {/* ANNOTATIONS MODE */}
                            {activeMode === 'annotations' && (
                              <div className="w-full">
                                <DebouncedTextarea
                                  value={record.annotation || ''}
                                  onChange={val => updateRecord(student.id, 'annotation', val)}
                                  placeholder="Add general notes for this student..."
                                  className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y min-h-[60px]"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* COMMENT BOX */}
                        {activeMode !== 'annotations' && (
                        <div className="w-full mt-1">
                          <DebouncedInput
                            type="text"
                            placeholder={`Add comment for ${activeMode === 'adjustments' ? 'adjustments' : activeMode}...`}
                            value={record.comments?.[activeMode === 'adjustments' ? 'extra' : activeMode] || ''}
                            onChange={val => {
                              const modeKey = activeMode === 'adjustments' ? 'extra' : activeMode;
                              const newComments = { ...(record.comments || {}), [modeKey]: val };
                              updateRecord(student.id, 'comments', newComments);
                            }}
                            disabled={isAbsent && activeMode !== 'attendance'}
                            className={`w-full text-sm px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors placeholder-slate-400 ${isAbsent && activeMode !== 'attendance' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          />
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      ) : (
        <StudentViewPanel
          studentId={selectedStudentId}
          quarter={quarter}
          section={section}
          students={students}
          topics={topics}
          sessions={sessions}
          settings={settings}
          activePeriod={activePeriod}
          onSaveSession={onSaveSession}
          onDeleteSession={onDeleteSession}
          showToast={showToast}
          onNavigateToSession={(sessionId, topicId) => {
            const session = sessions.find(s => s.id === sessionId);
            if (session) {
              setTopicId(topicId);
              setDate(session.date);
              if (session.type === 'exam') {
                setSessionMode('exam');
                setActiveMode('quiz');
              } else if (session.type === 'quiz' || session.records.some(r => r.quiz !== undefined && r.quiz !== null && !r.classwork)) {
                setSessionMode('quiz');
                setActiveMode('quiz');
              } else {
                setSessionMode('class');
                setActiveMode('attendance');
              }
              setViewMode('session');
            }
          }}
        />
      )}

      {/* New Session Modal */}
      {isNewSessionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Add New Session</h3>
              <button 
                onClick={() => setIsNewSessionModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 mb-4">Select the type of session you want to create:</p>
              
              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${newSessionType === 'class' ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}>
                <div className="pt-0.5">
                  <input 
                    type="checkbox" 
                    checked={newSessionType === 'class'} 
                    onChange={() => setNewSessionType('class')}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 rounded"
                  />
                </div>
                <div>
                  <div className="font-semibold text-slate-800">Class Session</div>
                  <div className="text-sm text-slate-500">Regular class day. Tracks attendance, participation, behavior, and classwork.</div>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${newSessionType === 'quiz' ? 'border-amber-500 bg-amber-50/50' : 'border-slate-200 hover:border-amber-200 hover:bg-slate-50'}`}>
                <div className="pt-0.5">
                  <input 
                    type="checkbox" 
                    checked={newSessionType === 'quiz'} 
                    onChange={() => setNewSessionType('quiz')}
                    className="w-4 h-4 text-amber-600 focus:ring-amber-500 rounded"
                  />
                </div>
                <div>
                  <div className="font-semibold text-slate-800">Lesson Quiz</div>
                  <div className="text-sm text-slate-500">A quiz or assessment for this specific lesson.</div>
                </div>
              </label>

              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${newSessionType === 'exam' ? 'border-rose-500 bg-rose-50/50' : 'border-slate-200 hover:border-rose-200 hover:bg-slate-50'}`}>
                <div className="pt-0.5">
                  <input 
                    type="checkbox" 
                    checked={newSessionType === 'exam'} 
                    onChange={() => setNewSessionType('exam')}
                    className="w-4 h-4 text-rose-600 focus:ring-rose-500 rounded"
                  />
                </div>
                <div>
                  <div className="font-semibold text-slate-800">Quarter Exam</div>
                  <div className="text-sm text-slate-500">Major assessment for the entire quarter.</div>
                </div>
              </label>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setIsNewSessionModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setSessionMode(newSessionType);
                  let newDate = new Date();
                  let dateStr = getLocalDateString(newDate);
                  let counter = 1;
                  while (sessions.some(s => s.topicId === topicId && s.date === dateStr)) {
                    newDate.setDate(newDate.getDate() + 1);
                    dateStr = getLocalDateString(newDate);
                    counter++;
                    if (counter > 30) break;
                  }
                  setDate(dateStr);
                  setIsNewSessionModalOpen(false);
                }}
                className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
              >
                Create Session
              </button>
            </div>
          </div>
        </div>
      )}

      {topicId === 'NOT_DEFINED' && Object.keys(records).length > 0 && (
        <div 
          className="fixed bottom-6 right-24 z-[9000] bg-amber-500 text-white p-3 rounded-full shadow-lg flex items-center justify-center group hover:scale-105 transition-all cursor-help animate-in slide-in-from-bottom-5 fade-in"
          title="Session recorded without a defined lesson."
        >
          <AlertTriangle size={24} />
          <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs group-hover:ml-2 transition-all duration-300 ease-in-out font-medium text-sm">
            Undefined Lesson
          </span>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
