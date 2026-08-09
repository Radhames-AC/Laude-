import React, { useMemo, useState } from 'react';
import { Student, Session, Topic, Reminder, TeacherSettings } from '../types';
import { calculateTopicScore, calculateSessionScore, calculateQuarterGrade, getTotalSessionWeight, DEFAULT_GRADING_CONFIG } from '../gradingUtils';
import { Users, CalendarCheck, BarChart3, AlertTriangle, Star, Activity, BookOpen, Database, LayoutDashboard, ArrowRight, CheckCircle2, Plus, Edit2, Trash2, Calendar, Save, X, Maximize2, Search } from 'lucide-react';

type Tab = 'dashboard' | 'tracker' | 'analytics' | 'settings' | 'planner';

interface Props {
  students: Student[];
  topics: Topic[];
  sessions: Session[];
  reminders?: Reminder[];
  onSaveReminder?: (reminder: Reminder) => void;
  onDeleteReminder?: (id: string) => void;
  onNavigate: (tab: Tab, studentId?: string, sessionId?: string, mode?: string) => void;
  settings?: TeacherSettings | null;
  onSaveSettings?: (settings: TeacherSettings) => void;
  isNewUser?: boolean;
}

export default function DashboardTab({ students, topics, sessions, reminders = [], onSaveReminder, onDeleteReminder, onNavigate, settings, onSaveSettings, isNewUser }: Props) {
  const [wizardStep, setWizardStep] = useState(1);
  const [recentSessionsSectionFilter, setRecentSessionsSectionFilter] = useState<string>('All');
  const [wizardData, setWizardData] = useState<TeacherSettings>({
    schoolYears: ['2026-2027'],
    gradingPeriods: ['Q1', 'Q2', 'Q3', 'Q4'],
    sections: [],
    subjects: [],
    cohorts: [],
    cohortSubjects: {}
  });
  const [newInput, setNewInput] = useState('');
  const [selectedCohort, setSelectedCohort] = React.useState<string>(() => {
    return localStorage.getItem('dashboard_selected_cohort') || 'All';
  });
  const [selectedQuarter, setSelectedQuarter] = React.useState<string>(() => {
    return localStorage.getItem('dashboard_selected_quarter') || 'All';
  });

  // Save to localStorage when they change
  React.useEffect(() => {
    localStorage.setItem('dashboard_selected_cohort', selectedCohort);
  }, [selectedCohort]);

  React.useEffect(() => {
    localStorage.setItem('dashboard_selected_quarter', selectedQuarter);
  }, [selectedQuarter]);

  const [showWelcomeBanner, setShowWelcomeBanner] = React.useState<boolean>(() => {
    return localStorage.getItem('dashboard_dismissed_welcome') !== 'true';
  });

  const dismissWelcomeBanner = () => {
    setShowWelcomeBanner(false);
    localStorage.setItem('dashboard_dismissed_welcome', 'true');
  };

  const [expandedReminder, setExpandedReminder] = useState<string | null>(null);
  const [editingReminder, setEditingReminder] = useState<string | null>(null);
  const [editReminderData, setEditReminderData] = useState<Partial<Reminder>>({});

  const [showAllRemindersModal, setShowAllRemindersModal] = useState(false);
  const [showAllSessionsModal, setShowAllSessionsModal] = useState(false);
  const [showHonorWallModal, setShowHonorWallModal] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionFilterQuarter, setSessionFilterQuarter] = useState<string>('All');
  const [sessionFilterSection, setSessionFilterSection] = useState<string>('All');

  const getDaysRemainingText = (dateString?: string) => {
    if (!dateString) return null;
    const due = new Date(dateString);
    due.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return { text: 'Due today', col: 'text-amber-600 bg-amber-50 border-amber-200' };
    if (diffDays === 1) return { text: 'Due tomorrow', col: 'text-amber-600 bg-amber-50 border-amber-200' };
    if (diffDays < 0) return { text: `${Math.abs(diffDays)} days overdue`, col: 'text-rose-600 bg-rose-50 border-rose-200' };
    return { text: `${diffDays} days left`, col: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
  };

  // Identify outstanding and concerning students based on their average grades
  const studentStats = useMemo(() => {
    return students.map(student => {
      let totalAbsences = 0;
      
      // Group topics by quarter and section
      const topicsByQuarterSection: Record<string, Topic[]> = {};
      topics.forEach(t => {
        const key = `${t.quarter}_${t.section}`;
        if (!topicsByQuarterSection[key]) topicsByQuarterSection[key] = [];
        topicsByQuarterSection[key].push(t);
      });

      const quarterGrades: number[] = [];

      Object.entries(topicsByQuarterSection).forEach(([key, qsTopics]) => {
        const [quarter, section] = key.split('_');
        
        // Skip this quarter if a specific quarter is selected and it doesn't match
        if (selectedQuarter !== 'All' && quarter !== selectedQuarter) {
          return;
        }

        const topicScores: number[] = [];

        qsTopics.forEach(topic => {
          const topicScore = calculateTopicScore(student.id, topic.id, sessions, settings);
          if (topicScore !== null) {
            topicScores.push(topicScore);
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
        const examSession = sessions.find(s => s.topicId === `QUARTER_EXAM_${quarter}_${section}`);
        if (examSession) {
          const examRecord = examSession.records.find(r => r.studentId === student.id);
          if (examRecord && examRecord.present && examRecord.quiz !== undefined) {
            quarterExamScore = examRecord.quiz;
          }
        }

        const quarterGrade = calculateQuarterGrade(topicScores, quarterExamScore, settings);

        if (quarterGrade !== null) {
          quarterGrades.push(quarterGrade);
        }
      });

      let average = null;
      if (quarterGrades.length > 0) {
        const sum = quarterGrades.reduce((a, b) => a + b, 0);
        average = Math.min(105, Math.round(sum / quarterGrades.length));
      }

      return {
        ...student,
        average,
        absences: totalAbsences
      };
    });
  }, [students, topics, sessions, selectedQuarter]);

  const flaggedRecords = useMemo(() => {
    const flags: { student: Student, session: Session, topic: Topic, mode: string }[] = [];
    sessions.forEach(session => {
      const topic = topics.find(t => t.id === session.topicId);
      if (!topic) return;
      session.records.forEach(record => {
        if (record.alerts && record.alerts.length > 0) {
          const student = students.find(s => s.id === record.studentId);
          if (student) {
            record.alerts.forEach(mode => {
              flags.push({ student, session, topic, mode });
            });
          }
        }
      });
    });
    return flags.sort((a, b) => new Date(b.session.date).getTime() - new Date(a.session.date).getTime());
  }, [sessions, topics, students]);

  const allCohorts = useMemo(() => {
    return Array.from(new Set(students.map(s => s.cohort))).sort();
  }, [students]);

  const handleFinishWizard = () => {
    if (onSaveSettings) {
      const cohortSubjects: Record<string, string[]> = {};
      wizardData.cohorts?.forEach(c => {
        cohortSubjects[c] = wizardData.subjects;
      });
      const sections = (wizardData.cohorts || []).flatMap(c => wizardData.subjects.map(s => `${c} ${s}`));

      onSaveSettings({
        ...wizardData,
        cohortSubjects,
        sections
      });
    }
  };

  if (isNewUser) {
    return (
      <div className="max-w-3xl mx-auto bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-blue-500 p-8 text-white">
          <h2 className="text-3xl font-bold mb-2">Welcome to Teacher's app! 👋</h2>
          <p className="text-indigo-100">Let's set up your classroom environment. This will only take a minute.</p>
        </div>
        
        <div className="p-8">
          {/* Progress Bar */}
          <div className="flex items-center justify-between mb-8 relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 -z-10 rounded-full"></div>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-indigo-500 -z-10 rounded-full transition-all duration-300" style={{ width: `${((wizardStep - 1) / 2) * 100}%` }}></div>
            
            {[1, 2, 3].map(step => (
              <div key={step} className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-300 ${wizardStep >= step ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border-2 border-slate-200 text-slate-400'}`}>
                {wizardStep > step ? <CheckCircle2 size={20} /> : step}
              </div>
            ))}
          </div>

          {/* Step 1: School Year & Grading Periods */}
          {wizardStep === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xl font-bold text-indigo-950">Basic Configuration</h3>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Current School Year</label>
                <input 
                  type="text" 
                  value={wizardData.schoolYears[0] || ''}
                  onChange={(e) => setWizardData({...wizardData, schoolYears: [e.target.value]})}
                  placeholder="e.g., 2026-2027"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Grading Periods</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {wizardData.gradingPeriods.map((period, idx) => (
                    <span key={idx} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium flex items-center gap-2 border border-indigo-100">
                      {period}
                      <button onClick={() => setWizardData({...wizardData, gradingPeriods: wizardData.gradingPeriods.filter((_, i) => i !== idx)})} className="hover:text-rose-500">&times;</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newInput}
                    onChange={(e) => setNewInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newInput.trim()) {
                        setWizardData({...wizardData, gradingPeriods: [...wizardData.gradingPeriods, newInput.trim()]});
                        setNewInput('');
                      }
                    }}
                    placeholder="Add period (e.g., Trimester 1)"
                    className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button 
                    onClick={() => {
                      if (newInput.trim()) {
                        setWizardData({...wizardData, gradingPeriods: [...wizardData.gradingPeriods, newInput.trim()]});
                        setNewInput('');
                      }
                    }}
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 font-medium"
                  >
                    Add
                  </button>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setWizardData({...wizardData, gradingPeriods: ['Q1', 'Q2', 'Q3', 'Q4']})} className="text-xs px-3 py-1 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200">Use Quarters</button>
                  <button onClick={() => setWizardData({...wizardData, gradingPeriods: ['Semester 1', 'Semester 2']})} className="text-xs px-3 py-1 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200">Use Semesters</button>
                  <button onClick={() => setWizardData({...wizardData, gradingPeriods: ['Trimester 1', 'Trimester 2', 'Trimester 3']})} className="text-xs px-3 py-1 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200">Use Trimesters</button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Subjects & Sections */}
          {wizardStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xl font-bold text-indigo-950">Classes & Subjects</h3>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Subjects you teach</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {wizardData.subjects.map((subject, idx) => (
                    <span key={idx} className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium flex items-center gap-2 border border-emerald-100">
                      {subject}
                      <button onClick={() => setWizardData({...wizardData, subjects: wizardData.subjects.filter((_, i) => i !== idx)})} className="hover:text-rose-500">&times;</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newInput}
                    onChange={(e) => setNewInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newInput.trim()) {
                        setWizardData({...wizardData, subjects: [...wizardData.subjects, newInput.trim()]});
                        setNewInput('');
                      }
                    }}
                    placeholder="e.g., Math, Science, Language"
                    className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  <button 
                    onClick={() => {
                      if (newInput.trim()) {
                        setWizardData({...wizardData, subjects: [...wizardData.subjects, newInput.trim()]});
                        setNewInput('');
                      }
                    }}
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Cohorts</label>
                <p className="text-xs text-slate-500 mb-3">Add cohorts (e.g. 5a, 5b). Subjects will automatically be assigned to them in Settings.</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(wizardData.cohorts || []).map((cohort, idx) => (
                    <span key={idx} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium flex items-center gap-2 border border-blue-100">
                      {cohort}
                      <button onClick={() => setWizardData({...wizardData, cohorts: wizardData.cohorts!.filter((_, i) => i !== idx)})} className="hover:text-rose-500">&times;</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newInput}
                    onChange={(e) => setNewInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newInput.trim()) {
                        setWizardData({...wizardData, cohorts: [...(wizardData.cohorts || []), newInput.trim()]});
                        setNewInput('');
                      }
                    }}
                    placeholder="e.g., 7a, 8b, 10th Grade"
                    className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button 
                    onClick={() => {
                      if (newInput.trim()) {
                        setWizardData({...wizardData, cohorts: [...(wizardData.cohorts || []), newInput.trim()]});
                        setNewInput('');
                      }
                    }}
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: All Set */}
          {wizardStep === 3 && (
            <div className="text-center py-8 animate-in fade-in zoom-in-95 duration-300">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={40} />
              </div>
              <h3 className="text-2xl font-bold text-indigo-950 mb-2">You're all set!</h3>
              <p className="text-slate-600 mb-8 max-w-md mx-auto">Your classroom environment is configured. Next, you can head over to Settings to import your student roster.</p>
              
              <button 
                onClick={handleFinishWizard}
                className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all flex items-center gap-2 mx-auto"
              >
                Go to Dashboard <ArrowRight size={18} />
              </button>
            </div>
          )}

          {/* Navigation Buttons */}
          {wizardStep < 3 && (
            <div className="mt-10 flex justify-between pt-6 border-t border-slate-100">
              <button 
                onClick={() => setWizardStep(prev => Math.max(1, prev - 1))}
                className={`px-6 py-2 rounded-xl font-medium transition-colors ${wizardStep === 1 ? 'invisible' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                Back
              </button>
              <button 
                onClick={() => {
                  setNewInput('');
                  setWizardStep(prev => Math.min(3, prev + 1));
                }}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 shadow-sm flex items-center gap-2"
              >
                Continue <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Calculate some basic stats
  const totalStudents = students.length;
  const totalTopics = topics.length;
  const totalSessions = sessions.length;

  const allOutstandingStudents = studentStats
    .filter(s => (selectedCohort === 'All' || s.cohort === selectedCohort) && s.average !== null && s.average >= 90)
    .sort((a, b) => (b.average || 0) - (a.average || 0));
    
  const outstandingStudents = allOutstandingStudents.slice(0, 5);
    
  const concerningStudents = studentStats
    .filter(s => (selectedCohort === 'All' || s.cohort === selectedCohort) && ((s.average !== null && s.average < 70) || s.absences >= 3))
    .sort((a, b) => (a.average || 100) - (b.average || 100))
    .slice(0, 5);

  const alerts = [];
  const totalConcerning = studentStats.filter(s => (s.average !== null && s.average < 70) || s.absences >= 3).length;
  if (totalConcerning > 0) {
    alerts.push(`${totalConcerning} students are currently at risk due to low grades or high absences.`);
  }
  if (totalStudents === 0) {
    alerts.push("Your roster is empty. Go to Roster Management to add students.");
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 relative pb-20">
      {/* Welcome Banner */}
      {showWelcomeBanner && (
        <div className="bg-gradient-to-r from-indigo-600 to-teal-500 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200/50 relative overflow-hidden">
          <button 
            onClick={dismissWelcomeBanner}
            title="Dismiss welcome message"
            className="absolute top-4 right-4 z-20 text-white/70 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
          <div className="relative z-10 pr-8">
            <h2 className="text-2xl font-bold mb-2">Welcome!</h2>
            <p className="text-indigo-50 max-w-3xl leading-relaxed">
              Use this app as your Teacher Record Book. Easily share your records with your Principal or Coordinator using the app's export capabilities. Enjoy the app!
            </p>
          </div>
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl"></div>
          <div className="absolute bottom-0 right-20 -mb-10 w-32 h-32 bg-teal-300 opacity-20 rounded-full blur-xl"></div>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div 
          onClick={() => onNavigate('settings')}
          className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50 flex items-center gap-4 cursor-pointer hover:bg-white/80 transition-colors"
        >
          <div className="w-12 h-12 bg-indigo-100/80 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
            <Users size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Students</p>
            <p className="text-2xl font-bold text-indigo-950">{totalStudents}</p>
          </div>
        </div>
        <div 
          onClick={() => onNavigate('settings')}
          className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50 flex items-center gap-4 cursor-pointer hover:bg-white/80 transition-colors"
        >
          <div className="w-12 h-12 bg-emerald-100/80 text-emerald-600 rounded-xl flex items-center justify-center shadow-inner">
            <BookOpen size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Topics</p>
            <p className="text-2xl font-bold text-indigo-950">{totalTopics}</p>
          </div>
        </div>
        <div 
          onClick={() => onNavigate('analytics')}
          className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50 flex items-center gap-4 cursor-pointer hover:bg-white/80 transition-colors"
        >
          <div className="w-12 h-12 bg-blue-100/80 text-blue-600 rounded-xl flex items-center justify-center shadow-inner">
            <CalendarCheck size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Recorded Sessions</p>
            <p className="text-2xl font-bold text-indigo-950">{totalSessions}</p>
          </div>
        </div>
        <div 
          onClick={() => onNavigate('analytics')}
          className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50 flex items-center gap-4 cursor-pointer hover:bg-white/80 transition-colors"
        >
          <div className="w-12 h-12 bg-rose-100/80 text-rose-600 rounded-xl flex items-center justify-center shadow-inner">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Active Alerts</p>
            <p className="text-2xl font-bold text-indigo-950">{alerts.length}</p>
          </div>
        </div>
      </div>

      {/* Quick Access Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button 
          onClick={() => onNavigate('tracker')} 
          className="group bg-indigo-50 border border-indigo-100 hover:border-indigo-300 hover:bg-indigo-100 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md"
        >
          <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
            <CalendarCheck size={20} />
          </div>
          <span className="text-sm font-bold text-indigo-950">Record Log</span>
        </button>
        <button 
          onClick={() => onNavigate('planner')} 
          className="group bg-emerald-50 border border-emerald-100 hover:border-emerald-300 hover:bg-emerald-100 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md"
        >
          <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
            <BookOpen size={20} />
          </div>
          <span className="text-sm font-bold text-emerald-950">Lesson Planner</span>
        </button>
        <button 
          onClick={() => onNavigate('analytics')} 
          className="group bg-blue-50 border border-blue-100 hover:border-blue-300 hover:bg-blue-100 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md"
        >
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
            <BarChart3 size={20} />
          </div>
          <span className="text-sm font-bold text-blue-950">Record Book</span>
        </button>
        <button 
          onClick={() => onNavigate('settings')} 
          className="group bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md"
        >
          <div className="w-10 h-10 rounded-full bg-slate-700 text-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
            <Database size={20} />
          </div>
          <span className="text-sm font-bold text-slate-800">Settings</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts & Agenda Panel */}
        <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50 lg:col-span-2 flex flex-col gap-6">
          
          {/* Alerts Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-rose-500" size={20} />
                <h3 className="text-lg font-bold text-indigo-950">Attention Required</h3>
              </div>
            </div>
            <div className="space-y-3">
              {alerts.length === 0 && flaggedRecords.length === 0 ? (
                <div className="p-4 bg-emerald-50/50 border border-emerald-100/50 rounded-xl text-emerald-700 text-sm">
                  No active alerts. Everything is running smoothly!
                </div>
              ) : (
                <>
                  {alerts.map((alert, idx) => (
                    <div 
                      key={`global-${idx}`} 
                      onClick={() => onNavigate('analytics', undefined, undefined, 'atRisk')}
                      className="p-4 bg-rose-50/80 border border-rose-200/50 rounded-xl flex items-start gap-3 shadow-sm cursor-pointer hover:bg-rose-100/80 transition-colors"
                    >
                      <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={18} />
                      <p className="text-rose-800 text-sm">{alert}</p>
                    </div>
                  ))}
                  {flaggedRecords.map((flag, idx) => (
                    <div 
                      key={`flag-${idx}`} 
                      onClick={() => onNavigate('tracker', flag.student.id, flag.session.id, flag.mode)}
                      className="p-3 bg-rose-50/80 border border-rose-200/50 rounded-xl flex items-start justify-between gap-3 shadow-sm cursor-pointer hover:bg-rose-100/80 transition-colors group"
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={16} />
                        <div>
                          <p className="text-rose-900 text-sm font-semibold">
                            {flag.student.lastName}, {flag.student.firstName}
                          </p>
                          <p className="text-rose-700 text-xs mt-0.5">
                            Flagged for <span className="font-semibold capitalize">{flag.mode}</span> • {flag.topic.title} ({flag.session.date})
                          </p>
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex-shrink-0" />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="h-px bg-white/50 w-full" />

          {/* Anecdotic & Reminders Agenda */}
          <div className="flex-1 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CalendarCheck className="text-blue-500" size={20} />
                <h3 className="text-lg font-bold text-indigo-950">Agenda & Reminders</h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 transition-colors shrink-0"
                  title="Add Reminder"
                  onClick={() => {
                    const newReminder = {
                      id: `rem_${Date.now()}`,
                      title: 'New Agenda Item',
                      description: '',
                      date: new Date().toISOString(),
                      completed: false,
                      createdAt: Date.now(),
                      type: 'reminder' as const
                    };
                    if (onSaveReminder) {
                       onSaveReminder(newReminder);
                    }
                    setExpandedReminder(newReminder.id);
                    setEditingReminder(newReminder.id);
                    setEditReminderData(newReminder);
                  }}
                >
                  <Plus size={18} />
                </button>
                <button 
                  onClick={() => setShowAllRemindersModal(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
                  title="Expand Agenda & Reminders"
                >
                  <Maximize2 size={16} />
                </button>
              </div>
            </div>
            <div className="space-y-2 overflow-y-auto flex-1 pr-2 no-scrollbar" style={{ maxHeight: 'calc(100vh - 450px)', minHeight: '200px' }}>
              {reminders && reminders.length > 0 ? (
                reminders.sort((a,b) => b.createdAt - a.createdAt).map(r => {
                  const isExpanded = expandedReminder === r.id;
                  const isEditing = editingReminder === r.id;
                  const daysRemaining = getDaysRemainingText(r.date);

                  return (
                    <div 
                      key={r.id} 
                      className={`bg-white/50 p-3 rounded-xl border shadow-sm group transition-all cursor-pointer ${isExpanded ? 'border-indigo-300' : 'border-white/80 hover:border-indigo-200'}`}
                      onClick={() => !isEditing && setExpandedReminder(isExpanded ? null : r.id)}
                    >
                      {/* View Mode */}
                      {!isEditing && (
                        <div className="flex gap-3 items-start">
                          <button 
                            className={`w-5 h-5 rounded-md border flex items-center justify-center mt-0.5 shrink-0 ${r.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-slate-300 group-hover:border-emerald-500'}`}
                            onClick={(e) => { e.stopPropagation(); onSaveReminder && onSaveReminder({...r, completed: !r.completed}); }}
                          >
                            <CheckCircle2 size={14} className={r.completed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 text-emerald-500'} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-2">
                              <p className={`text-sm font-medium truncate transition-all ${r.completed ? 'text-slate-400 line-through' : 'text-slate-700'} ${isExpanded ? 'whitespace-normal break-words' : ''}`}>
                                {r.title}
                              </p>
                              {!isExpanded && daysRemaining && !r.completed && (
                                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${daysRemaining.col}`}>
                                  {daysRemaining.text}
                                </span>
                              )}
                            </div>
                            
                            {/* Expanded Details */}
                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-3 animate-in slide-in-from-top-1 fade-in duration-200">
                                {r.description ? (
                                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{r.description}</p>
                                ) : (
                                  <p className="text-xs text-slate-400 italic">No additional details.</p>
                                )}
                                <div className="flex items-center gap-2 flex-wrap">
                                  {daysRemaining && !r.completed && (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${daysRemaining.col}`}>
                                      {daysRemaining.text}
                                    </span>
                                  )}
                                  {r.date && (
                                    <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-full border border-slate-200">
                                      <Calendar size={10} />
                                      {new Date(r.date).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setEditingReminder(r.id); setEditReminderData(r); }}
                                    className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-100 flex items-center gap-1.5 transition-colors border border-indigo-100"
                                  >
                                    <Edit2 size={12} /> Edit Note
                                  </button>
                                  {onDeleteReminder && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); onDeleteReminder(r.id); }}
                                      className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-semibold hover:bg-rose-100 flex items-center gap-1.5 transition-colors border border-rose-100"
                                    >
                                      <Trash2 size={12} /> Delete
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                            {/* Short preview if not expanded */}
                            {!isExpanded && r.description && <p className="text-xs text-slate-500 truncate mt-0.5">{r.description}</p>}
                          </div>
                        </div>
                      )}

                      {/* Edit Mode */}
                      {isEditing && (
                        <div className="flex flex-col gap-3 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Title</label>
                            <input 
                              type="text" 
                              value={editReminderData.title || ''}
                              onChange={(e) => setEditReminderData({...editReminderData, title: e.target.value})}
                              className="w-full text-sm font-medium border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm outline-none transition-all"
                              placeholder="Title..."
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Details / Notes</label>
                            <textarea 
                              value={editReminderData.description || ''}
                              onChange={(e) => setEditReminderData({...editReminderData, description: e.target.value})}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 h-20 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm outline-none resize-none transition-all"
                              placeholder="Add more details, tasks or anecdotal notes here..."
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Due Date</label>
                            <div className="relative">
                              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input 
                                type="date"
                                value={editReminderData.date ? editReminderData.date.split('T')[0] : ''}
                                onChange={(e) => {
                                  // Ensure time isn't completely lost or defaulted if handled properly, but standard YYYY-MM-DD works
                                  const dateStr = e.target.value;
                                  if (dateStr) {
                                    setEditReminderData({...editReminderData, date: new Date(dateStr).toISOString()});
                                  } else {
                                    setEditReminderData({...editReminderData, date: ''});
                                  }
                                }}
                                className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm outline-none transition-all appearance-none"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-slate-100">
                            <button 
                              onClick={() => setEditingReminder(null)}
                              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-200 flex items-center gap-1.5 transition-colors"
                            >
                              <X size={14} /> Cancel
                            </button>
                            <button 
                              onClick={() => {
                                if (onSaveReminder && editReminderData.title) {
                                  onSaveReminder(editReminderData as Reminder);
                                  setEditingReminder(null);
                                }
                              }}
                              disabled={!editReminderData.title}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-sm"
                            >
                              <Save size={14} /> Save Changes
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-6 bg-slate-50/50 border border-slate-100 rounded-xl text-center flex flex-col items-center justify-center h-full">
                   <p className="text-sm font-medium text-slate-500">Your agenda is clear.</p>
                   <p className="text-xs text-slate-400 mt-1">Click the + button to add a note or reminder.</p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Last Opened Sessions */}
        <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="text-indigo-500" size={20} />
              <h3 className="text-lg font-bold text-indigo-950">Recent Sessions</h3>
            </div>
            
            <div className="flex items-center gap-2">
              <select
                value={recentSessionsSectionFilter}
                onChange={(e) => setRecentSessionsSectionFilter(e.target.value)}
                className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-300 transition-colors cursor-pointer"
                title="Filter by section"
              >
                <option value="All">All Sections</option>
                {(settings?.sections && settings.sections.length > 0 
                    ? Array.from(new Set(settings.sections)).sort() 
                    : Array.from(new Set(topics.map(t => t.section))).filter(Boolean).sort()
                ).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button 
                onClick={() => setShowAllSessionsModal(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
                title="Expand all sessions"
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-4 -mt-2">Quick access to your last 10 opened record logs{recentSessionsSectionFilter !== 'All' ? ` for ${recentSessionsSectionFilter}` : ''}.</p>
          
          <div className="space-y-2 flex-1 overflow-y-auto pr-2 no-scrollbar" style={{ maxHeight: 'calc(100vh - 400px)', minHeight: '250px' }}>
            {sessions.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500 bg-slate-50/50 rounded-xl border border-slate-100">
                No sessions available yet.
              </div>
            ) : (
              // Display the 10 most recent sessions filtered by section
              [...sessions]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .filter(session => {
                  if (recentSessionsSectionFilter === 'All') return true;
                  const topic = topics.find(t => t.id === session.topicId);
                  return topic?.section === recentSessionsSectionFilter;
                })
                .slice(0, 10)
                .map((session, idx) => {
                  const topic = topics.find(t => t.id === session.topicId);
                
                // Average calculation
                let sessionAvg = 0;
                let numGrades = 0;
                if (session.records) {
                  const maxSessionScore = getTotalSessionWeight(settings);
                  session.records.forEach(rec => {
                    if (rec.present) {
                       const s = calculateSessionScore(rec, session.records, settings);
                       if (s !== null) {
                         sessionAvg += s;
                         numGrades++;
                       }
                    }
                  });
                  // If numGrades > 0, avg is sessionAvg / numGrades. Then we map this out of maxSessionScore -> 100
                  if (numGrades > 0 && maxSessionScore > 0) {
                     sessionAvg = (sessionAvg / numGrades) / maxSessionScore * 100;
                  }
                }
                const avgDisplay = numGrades > 0 ? Math.round(sessionAvg) : 0;

                return (
                  <div 
                    key={session.id || idx}
                    onClick={() => onNavigate('tracker', undefined, session.id)}
                    className="group bg-white p-3 rounded-xl border border-slate-100 shadow-sm cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-[13px] font-bold text-slate-700 truncate group-hover:text-indigo-600 transition-colors">
                        {topic?.title || 'Unknown Lesson'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                          {topic?.section || 'No Section'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {session.date}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0 gap-1">
                      {avgDisplay > 0 && (
                        <div className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                          <BarChart3 size={10} />
                          {avgDisplay}%
                        </div>
                      )}
                      <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center shrink-0 group-hover:bg-indigo-50 transition-colors">
                        <ArrowRight size={12} className="text-slate-400 group-hover:text-indigo-500" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outstanding Students */}
        <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Star className="text-amber-500" size={24} />
              <h3 className="text-lg font-bold text-indigo-950">Honor Wall</h3>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value)}
                className="px-3 py-1.5 bg-white/50 border border-white/50 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="All">All Qtrs</option>
                {Array.from(new Set(topics.map(t => t.quarter))).filter(Boolean).map(q => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
              <select
                value={selectedCohort}
                onChange={(e) => setSelectedCohort(e.target.value)}
                className="px-3 py-1.5 bg-white/50 border border-white/50 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="All">All Sections</option>
                {allCohorts.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button 
                onClick={() => setShowHonorWallModal(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
                title="Expand Honor Wall"
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
          {outstandingStudents.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6 bg-white/40 rounded-xl border border-white/50 border-dashed" style={{ maxHeight: 'calc(100vh - 400px)', minHeight: '250px' }}>
              <p className="text-sm text-slate-500 italic text-center">Not enough data to highlight outstanding students yet.</p>
            </div>
          ) : (
            <div className="space-y-3 flex-1 overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 400px)', minHeight: '250px' }}>
              {outstandingStudents.map(student => (
                <div 
                  key={student.id} 
                  onClick={() => onNavigate('analytics', student.id)}
                  className="flex items-center justify-between p-3 bg-white/50 border border-white/50 rounded-xl shadow-sm cursor-pointer hover:bg-white/80 hover:shadow-md transition-all group"
                >
                  <div>
                    <p className="text-sm font-medium text-indigo-950 group-hover:text-indigo-700 transition-colors">{student.firstName} {student.lastName}</p>
                    <p className="text-xs text-slate-500">Cohort {student.cohort}</p>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <div className="flex items-center gap-2">
                      {student.average !== null && student.average > 100 && (
                        <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                          <Star size={10} className="fill-amber-500 text-amber-500" />
                          Extra
                        </span>
                      )}
                      <p className={`text-sm font-bold ${student.average !== null && student.average > 100 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {student.average}%
                      </p>
                    </div>
                    <p className="text-xs text-slate-500">Average</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Concerning Students */}
        <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Activity className="text-rose-500" size={24} />
              <h3 className="text-lg font-bold text-indigo-950">Students at Risk</h3>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value)}
                className="px-3 py-1.5 bg-white/50 border border-white/50 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="All">All Qtrs</option>
                {Array.from(new Set(topics.map(t => t.quarter))).filter(Boolean).map(q => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
              <select
                value={selectedCohort}
                onChange={(e) => setSelectedCohort(e.target.value)}
                className="px-3 py-1.5 bg-white/50 border border-white/50 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="All">All Sections</option>
                {allCohorts.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          {concerningStudents.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6 bg-white/40 rounded-xl border border-white/50 border-dashed" style={{ maxHeight: 'calc(100vh - 400px)', minHeight: '250px' }}>
              <p className="text-sm text-slate-500 italic text-center">No students are currently flagged as at risk.</p>
            </div>
          ) : (
            <div className="space-y-3 flex-1 overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 400px)', minHeight: '250px' }}>
              {concerningStudents.map(student => (
                <div 
                  key={student.id} 
                  onClick={() => onNavigate('analytics', student.id)}
                  className="flex items-center justify-between p-3 bg-white/50 border border-white/50 rounded-xl shadow-sm cursor-pointer hover:bg-white/80 hover:shadow-md transition-all group"
                >
                  <div>
                    <p className="text-sm font-medium text-indigo-950 group-hover:text-indigo-700 transition-colors">{student.firstName} {student.lastName}</p>
                    <p className="text-xs text-slate-500">Cohort {student.cohort}</p>
                  </div>
                  <div className="text-right">
                    {student.average !== null && student.average < 70 && (
                      <p className="text-sm font-bold text-rose-600">{student.average}% Avg</p>
                    )}
                    {student.absences >= 3 && (
                      <p className="text-xs font-medium text-orange-600">{student.absences} Absences</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showHonorWallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowHonorWallModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-slate-100 gap-4">
              <div className="flex items-center gap-3">
                <Star className="text-amber-500" size={24} />
                <h2 className="text-xl font-bold text-slate-800">Honor Wall Explorer</h2>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedQuarter}
                  onChange={(e) => setSelectedQuarter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="All">All Qtrs</option>
                  {Array.from(new Set(topics.map(t => t.quarter))).filter(Boolean).map(q => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
                <select
                  value={selectedCohort}
                  onChange={(e) => setSelectedCohort(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="All">All Sections</option>
                  {allCohorts.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button 
                  onClick={() => setShowHonorWallModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors ml-2"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {allOutstandingStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                  <Star size={48} className="text-slate-300 mb-4" />
                  <p>Not enough data to highlight outstanding students yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allOutstandingStudents.map((student, idx) => (
                    <div 
                      key={student.id} 
                      onClick={() => onNavigate('analytics', student.id)}
                      className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group"
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-200 text-slate-700' : idx === 2 ? 'bg-orange-100 text-orange-800' : 'bg-indigo-50 text-indigo-600'}`}>
                        #{idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">{student.firstName} {student.lastName}</p>
                        <p className="text-xs text-slate-500 truncate">Cohort {student.cohort}</p>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end">
                        <div className="flex items-center gap-2">
                          {student.average !== null && student.average > 100 && (
                            <Star size={12} className="fill-amber-500 text-amber-500" />
                          )}
                          <p className={`text-base font-black ${student.average !== null && student.average > 100 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {student.average}%
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAllRemindersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAllRemindersModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-slate-100 gap-4">
              <div className="flex items-center gap-3">
                <CalendarCheck className="text-indigo-500" size={24} />
                <h2 className="text-xl font-bold text-slate-800">All Reminders Explorer</h2>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowAllRemindersModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors ml-2"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50">
              {reminders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white rounded-xl border border-slate-200 border-dashed">
                  <Calendar size={48} className="text-slate-300 mb-4" />
                  <p>No reminders yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...reminders].sort((a,b) => b.createdAt - a.createdAt).map(r => {
                    const isExpanded = expandedReminder === r.id;
                    const isEditing = editingReminder === r.id;
                    const daysRemaining = getDaysRemainingText(r.date);

                    return (
                      <div 
                        key={`modal_${r.id}`} 
                        className={`bg-white p-4 rounded-xl border shadow-sm group transition-all cursor-pointer ${isExpanded ? 'border-indigo-300 ring-2 ring-indigo-50/50' : 'border-slate-200 hover:border-indigo-200'}`}
                        onClick={() => !isEditing && setExpandedReminder(isExpanded ? null : r.id)}
                      >
                        {/* View Mode */}
                        {!isEditing && (
                          <div className="flex gap-3 items-start">
                            <button 
                              className={`w-5 h-5 rounded-md border flex items-center justify-center mt-0.5 shrink-0 ${r.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-slate-300 group-hover:border-emerald-500'}`}
                              onClick={(e) => { e.stopPropagation(); onSaveReminder && onSaveReminder({...r, completed: !r.completed}); }}
                            >
                              <CheckCircle2 size={14} className={r.completed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 text-emerald-500'} />
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start gap-2">
                                <p className={`text-sm font-medium truncate transition-all ${r.completed ? 'text-slate-400 line-through' : 'text-slate-700'} ${isExpanded ? 'whitespace-normal break-words' : ''}`}>
                                  {r.title}
                                </p>
                                {!isExpanded && daysRemaining && !r.completed && (
                                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${daysRemaining.col}`}>
                                    {daysRemaining.text}
                                  </span>
                                )}
                              </div>
                              
                              {/* Expanded Details */}
                              {isExpanded && (
                                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-3 animate-in slide-in-from-top-1 fade-in duration-200">
                                  {r.description ? (
                                    <p className="text-xs text-slate-600 whitespace-pre-wrap">{r.description}</p>
                                  ) : (
                                    <p className="text-xs text-slate-400 italic">No additional details.</p>
                                  )}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {daysRemaining && !r.completed && (
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${daysRemaining.col}`}>
                                        {daysRemaining.text}
                                      </span>
                                    )}
                                    {r.date && (
                                      <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded-full border border-slate-200">
                                        <Calendar size={10} />
                                        {new Date(r.date).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setEditingReminder(r.id); setEditReminderData(r); }}
                                      className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-100 flex items-center gap-1.5 transition-colors border border-indigo-100"
                                    >
                                      <Edit2 size={12} /> Edit
                                    </button>
                                    {onDeleteReminder && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); onDeleteReminder(r.id); }}
                                        className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-semibold hover:bg-rose-100 flex items-center gap-1.5 transition-colors border border-rose-100"
                                      >
                                        <Trash2 size={12} /> Delete
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                              {/* Short preview if not expanded */}
                              {!isExpanded && r.description && <p className="text-xs text-slate-500 truncate mt-0.5">{r.description}</p>}
                            </div>
                          </div>
                        )}

                        {/* Edit Mode */}
                        {isEditing && (
                          <div className="flex flex-col gap-3 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                            <div>
                              <input 
                                type="text" 
                                value={editReminderData.title || ''}
                                onChange={(e) => setEditReminderData({...editReminderData, title: e.target.value})}
                                className="w-full text-sm font-medium border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm outline-none transition-all"
                                placeholder="Title..."
                                autoFocus
                              />
                            </div>
                            <div>
                              <textarea 
                                value={editReminderData.description || ''}
                                onChange={(e) => setEditReminderData({...editReminderData, description: e.target.value})}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 h-20 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm outline-none resize-none transition-all"
                                placeholder="Add more details, tasks or anecdotal notes here..."
                              />
                            </div>
                            <div>
                              <div className="relative">
                                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                  type="date"
                                  value={editReminderData.date ? editReminderData.date.split('T')[0] : ''}
                                  onChange={(e) => {
                                    const dateStr = e.target.value;
                                    if (dateStr) {
                                      setEditReminderData({...editReminderData, date: new Date(dateStr).toISOString()});
                                    } else {
                                      setEditReminderData({...editReminderData, date: ''});
                                    }
                                  }}
                                  className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm outline-none transition-all appearance-none"
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-slate-100">
                              <button 
                                onClick={() => setEditingReminder(null)}
                                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-200 flex items-center gap-1.5 transition-colors"
                              >
                                <X size={16} /> Cancel
                              </button>
                              <button 
                                onClick={() => {
                                  if (onSaveReminder && editReminderData.id && editReminderData.title) {
                                    onSaveReminder(editReminderData as Reminder);
                                    setEditingReminder(null);
                                    // Expand it automatically after saving
                                    setExpandedReminder(editReminderData.id);
                                  }
                                }}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 hover:shadow-md hover:shadow-indigo-600/20 active:scale-95 flex items-center gap-1.5 transition-all outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                              >
                                <Save size={16} /> Save
                              </button>
                            </div>
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
      )}

      {showAllSessionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAllSessionsModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <LayoutDashboard className="text-indigo-500" size={24} />
                <h2 className="text-xl font-bold text-slate-800">All Sessions Explorer</h2>
              </div>
              <button 
                onClick={() => setShowAllSessionsModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  placeholder="Search by lesson, section, or code..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-3">
                <select 
                  value={sessionFilterQuarter}
                  onChange={(e) => setSessionFilterQuarter(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-32"
                >
                  <option value="All">All Quarters</option>
                  {(settings?.gradingPeriods && settings.gradingPeriods.length > 0 
                      ? Array.from(new Set(settings.gradingPeriods))
                      : Array.from(new Set(topics.map(t => t.quarter))).filter(Boolean)
                  ).map(q => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
                <select 
                  value={sessionFilterSection}
                  onChange={(e) => setSessionFilterSection(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40"
                >
                  <option value="All">All Sections</option>
                  {(settings?.sections && settings.sections.length > 0
                      ? Array.from(new Set(settings.sections)).sort()
                      : Array.from(new Set(topics.map(t => t.section))).filter(Boolean).sort()
                  ).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...sessions]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .filter(s => {
                    const topic = topics.find(t => t.id === s.topicId);
                    
                    if (sessionFilterQuarter !== 'All' && topic?.quarter !== sessionFilterQuarter) return false;
                    if (sessionFilterSection !== 'All' && topic?.section !== sessionFilterSection) return false;

                    if (!sessionSearch) return true;
                    
                    const term = sessionSearch.toLowerCase();
                    return topic?.title.toLowerCase().includes(term) || 
                           topic?.section.toLowerCase().includes(term);
                  })
                  .map(session => {
                    const topic = topics.find(t => t.id === session.topicId);
                    
                    // Simple average calculation for preview
                    let sessionAvg = 0;
                    let numGrades = 0;
                    if (session.records) {
                      const maxSessionScore = getTotalSessionWeight(settings);
                      session.records.forEach(rec => {
                        if (rec.present) {
                           const s = calculateSessionScore(rec, session.records, settings);
                           if (s !== null) {
                             sessionAvg += s;
                             numGrades++;
                           }
                        }
                      });
                      if (numGrades > 0 && maxSessionScore > 0) {
                         sessionAvg = (sessionAvg / numGrades) / maxSessionScore * 100;
                      }
                    }
                    const avgDisplay = numGrades > 0 ? Math.round(sessionAvg) : 0;

                    return (
                      <div 
                        key={session.id}
                        onClick={() => {
                          setShowAllSessionsModal(false);
                          onNavigate('tracker', undefined, session.id);
                        }}
                        className="bg-white border text-left border-slate-200 p-4 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group flex flex-col"
                      >
                         <div className="flex justify-between items-start mb-2">
                           <span className="text-[10px] font-bold tracking-wider uppercase bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md">
                             {topic?.section || 'No Section'}
                           </span>
                         </div>
                         <h4 className="text-sm font-bold text-slate-800 line-clamp-2 mt-1 mb-3 group-hover:text-indigo-600 transition-colors">
                           {topic?.title || 'Unknown Lesson'}
                         </h4>
                         
                         <div className="mt-auto flex items-center justify-between pt-3 border-t border-slate-50">
                            <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                              <Calendar size={12} />
                              {session.date}
                            </span>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                              <BarChart3 size={12} />
                              {avgDisplay > 0 ? `${avgDisplay}% Avg` : 'N/A'}
                            </div>
                         </div>
                      </div>
                    )
                  })
                }
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
