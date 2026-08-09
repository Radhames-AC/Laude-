import React, { useState, useMemo, useEffect } from 'react';
import { Student, Session, Topic, Quarter, Cohort, DEFAULT_SECTIONS, DEFAULT_QUARTERS, DEFAULT_COHORTS, Reminder, TeacherSettings, GradingConfig } from '../types';
import { Trash2, AlertTriangle, UserX, FileX, CalendarX, Loader2, AlertOctagon, FileText, Download, Settings, Users, Database, Edit2, Save, X, Plus, Sliders, Filter } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DEFAULT_GRADING_CONFIG } from '../gradingUtils';
import { auth } from '../firebase';
import { fetchCheckpoints } from '../store';

interface Props {
  students: Student[];
  topics: Topic[];
  sessions: Session[];
  onSaveStudents: (students: Student[]) => Promise<void>;
  onDeleteStudent: (studentId: string) => Promise<void>;
  onDeleteTopic: (topicId: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onRemoveStudentFromTopic: (topicId: string, studentId: string) => Promise<void>;
  onRemoveStudentFromSession: (sessionId: string, studentId: string) => Promise<void>;
  showToast: (msg: string) => void;
  settings?: TeacherSettings | null;
  onSaveSettings?: (settings: TeacherSettings) => void;
  onRestoreCheckpoint?: (checkpointId: string) => Promise<void>;
}

export default function SettingsTab({
  students,
  topics,
  sessions,
  onSaveStudents,
  onDeleteStudent,
  onDeleteTopic,
  onDeleteSession,
  onRemoveStudentFromTopic,
  onRemoveStudentFromSession,
  showToast,
  settings,
  onSaveSettings,
  onRestoreCheckpoint
}: Props) {
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'roster' | 'data' | 'events'>('general');
  const [isDeleting, setIsDeleting] = useState(false);

  // --- General Settings State ---
  
  // Local state for editing settings before saving
  const [localSettings, setLocalSettings] = useState<TeacherSettings>({
    teacherName: settings?.teacherName || '',
    schoolYears: settings?.schoolYears || ['2026-2027'],
    gradingPeriods: settings?.gradingPeriods || ['Q1', 'Q2', 'Q3', 'Q4'],
    sections: settings?.sections || [],
    sectionCodes: settings?.sectionCodes || {},
    subjects: settings?.subjects || [],
    cohorts: settings?.cohorts || [],
    cohortSubjects: settings?.cohortSubjects || {},
    gradingConfig: settings?.gradingConfig || DEFAULT_GRADING_CONFIG
  });
  
  const [newInput, setNewInput] = useState<{
    schoolYear: string;
    gradingPeriod: string;
    cohort: string;
    section: string;
    subject: string;
  }>({ schoolYear: '', gradingPeriod: '', cohort: '', section: '', subject: '' });

  // Sync local settings when props change
  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  useEffect(() => {
    if (activeSubTab === 'data' && auth.currentUser) {
      fetchCheckpoints(auth.currentUser.uid).then(cps => {
        // Sort newest first
        setCheckpoints(cps.sort((a, b) => b.timestamp - a.timestamp));
      });
    }
  }, [activeSubTab]);

  const handleSaveConfig = () => {
    if (onSaveSettings) {
      onSaveSettings(localSettings);
      showToast('Configuration saved successfully');
    }
  };

  const allCohorts = useMemo(() => {
    return Array.from(new Set([...DEFAULT_COHORTS, ...students.map(s => s.cohort)])).sort();
  }, [students]);

  const allSections = useMemo(() => {
    if (settings && settings.sections) return Array.from(new Set(settings.sections)).sort();
    return Array.from(new Set([...DEFAULT_SECTIONS, ...topics.map(t => t.section)])).sort();
  }, [topics, settings]);

  // --- Roster Management State ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [cohort, setCohort] = useState<Cohort>(allCohorts[0] || '7a');
  const [rosterFilter, setRosterFilter] = useState<string>('ALL');
  const [isSavingRoster, setIsSavingRoster] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editCohort, setEditCohort] = useState<Cohort>(allCohorts[0] || '7a');

  // --- Data Management State ---
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    expectedText: string;
    action: () => Promise<void>;
  } | null>(null);
  const [confirmInput, setConfirmInput] = useState('');

  const [studentToDelete, setStudentToDelete] = useState<string>('');
  const [customQuarters, setCustomQuarters] = useState<string[]>([]);
  
  const allQuarters = useMemo(() => {
    if (settings?.gradingPeriods?.length) return settings.gradingPeriods;
    return Array.from(new Set([...DEFAULT_QUARTERS, ...topics.map(t => t.quarter)])).sort();
  }, [topics, settings]);

  const [topicQuarter, setTopicQuarter] = useState<Quarter>(allQuarters[0] || 'Q1');
  const [topicSection, setTopicSection] = useState<string>(allSections[0] || '7a Language');
  const [topicToDelete, setTopicToDelete] = useState<string>('');
  const [topicStudentToRemove, setTopicStudentToRemove] = useState<string>('');

  const [sessionTopicId, setSessionTopicId] = useState<string>('');
  const [sessionToDelete, setSessionToDelete] = useState<string>('');
  const [sessionStudentToRemove, setSessionStudentToRemove] = useState<string>('');

  const filteredTopics = useMemo(() => {
    return topics.filter(t => t.quarter === topicQuarter && t.section === topicSection);
  }, [topics, topicQuarter, topicSection]);

  const filteredSessions = useMemo(() => {
    if (!sessionTopicId) return [];
    return sessions.filter(s => s.topicId === sessionTopicId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sessions, sessionTopicId]);

  // --- Roster Handlers ---
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      showToast('Error: First and Last name are required.');
      return;
    }
    
    setIsSavingRoster(true);
    const newStudent: Student = {
      id: `temp-${Date.now()}`,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      cohort,
    };
    
    try {
      await onSaveStudents([...students, newStudent]);
      setFirstName('');
      setLastName('');
      showToast('Student added successfully!');
    } finally {
      setIsSavingRoster(false);
    }
  };

  const handleDeleteStudentRoster = async (id: string) => {
    if (confirm('Are you sure you want to delete this student?')) {
      setIsSavingRoster(true);
      try {
        await onSaveStudents(students.filter(s => s.id !== id));
        showToast('Student deleted.');
      } finally {
        setIsSavingRoster(false);
      }
    }
  };

  const startEditStudent = (student: Student) => {
    setEditingId(student.id);
    setEditFirstName(student.firstName);
    setEditLastName(student.lastName);
    setEditCohort(student.cohort);
  };

  const saveEditStudent = async () => {
    if (!editFirstName.trim() || !editLastName.trim()) {
      showToast('Error: Names cannot be empty.');
      return;
    }
    
    setIsSavingRoster(true);
    const updated = students.map(s => {
      if (s.id === editingId) {
        return { ...s, firstName: editFirstName.trim(), lastName: editLastName.trim(), cohort: editCohort };
      }
      return s;
    });
    
    try {
      await onSaveStudents(updated);
      setEditingId(null);
      showToast('Student updated successfully!');
    } finally {
      setIsSavingRoster(false);
    }
  };

  // --- Data Management Handlers ---
  const requestDeleteStudent = () => {
    if (!studentToDelete) return;
    const student = students.find(s => s.id === studentToDelete);
    setModalConfig({
      isOpen: true,
      title: 'Delete Student',
      message: `You are about to permanently delete ${student?.firstName} ${student?.lastName} from the database. This will remove them from the roster and all future grading.`,
      expectedText: 'DELETE',
      action: async () => {
        await onDeleteStudent(studentToDelete);
        setStudentToDelete('');
      }
    });
  };

  const requestDeleteTopic = () => {
    if (!topicToDelete) return;
    const topic = topics.find(t => t.id === topicToDelete);
    setModalConfig({
      isOpen: true,
      title: 'Delete Entire Topic',
      message: `You are about to permanently delete the topic "${topic?.title}". ALL sessions, grades, and records associated with this topic will be lost forever.`,
      expectedText: 'DELETE',
      action: async () => {
        await onDeleteTopic(topicToDelete);
        setTopicToDelete('');
      }
    });
  };

  const requestRemoveStudentFromTopic = () => {
    if (!topicToDelete || !topicStudentToRemove) return;
    const student = students.find(s => s.id === topicStudentToRemove);
    setModalConfig({
      isOpen: true,
      title: 'Remove Student from Topic',
      message: `You are about to remove ${student?.firstName} ${student?.lastName}'s records from this entire topic. Their grades for this topic will be erased.`,
      expectedText: 'REMOVE',
      action: async () => {
        await onRemoveStudentFromTopic(topicToDelete, topicStudentToRemove);
        setTopicStudentToRemove('');
      }
    });
  };

  const requestDeleteSession = () => {
    if (!sessionToDelete) return;
    const session = sessions.find(s => s.id === sessionToDelete);
    setModalConfig({
      isOpen: true,
      title: 'Delete Session',
      message: `You are about to delete the entire session from ${session?.date}. All student grades recorded on this specific day will be lost.`,
      expectedText: 'DELETE',
      action: async () => {
        await onDeleteSession(sessionToDelete);
        setSessionToDelete('');
      }
    });
  };

  const requestRemoveStudentFromSession = () => {
    if (!sessionToDelete || !sessionStudentToRemove) return;
    const student = students.find(s => s.id === sessionStudentToRemove);
    setModalConfig({
      isOpen: true,
      title: 'Remove Student from Session',
      message: `You are about to remove ${student?.firstName} ${student?.lastName}'s record from this specific session.`,
      expectedText: 'REMOVE',
      action: async () => {
        await onRemoveStudentFromSession(sessionToDelete, sessionStudentToRemove);
        setSessionStudentToRemove('');
      }
    });
  };

  const executeAction = async () => {
    if (!modalConfig) return;
    setIsDeleting(true);
    try {
      await modalConfig.action();
      closeModal();
      showToast('Action completed successfully.');
    } catch (e) {
      showToast('Error executing action.');
    } finally {
      setIsDeleting(false);
    }
  };

  const closeModal = () => {
    setModalConfig(null);
    setConfirmInput('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-5xl mx-auto relative">
      
      {/* Sub-tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200/50 pb-4">
        <button
          onClick={() => setActiveSubTab('general')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            activeSubTab === 'general' 
              ? 'bg-indigo-600 text-white shadow-md' 
              : 'bg-white/60 text-slate-600 hover:bg-white hover:text-indigo-600'
          }`}
        >
          <Settings size={16} /> General Settings
        </button>
        <button
          onClick={() => setActiveSubTab('roster')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            activeSubTab === 'roster' 
              ? 'bg-indigo-600 text-white shadow-md' 
              : 'bg-white/60 text-slate-600 hover:bg-white hover:text-indigo-600'
          }`}
        >
          <Users size={16} /> Roster Management
        </button>
        <button
          onClick={() => setActiveSubTab('data')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            activeSubTab === 'data' 
              ? 'bg-indigo-600 text-white shadow-md' 
              : 'bg-white/60 text-slate-600 hover:bg-white hover:text-indigo-600'
          }`}
        >
          <Database size={16} /> Data Management
        </button>
        <button
          onClick={() => setActiveSubTab('events')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            activeSubTab === 'events' 
              ? 'bg-indigo-600 text-white shadow-md' 
              : 'bg-white/60 text-slate-600 hover:bg-white hover:text-indigo-600'
          }`}
        >
          <FileText size={16} /> Events Log
        </button>
      </div>

      {/* --- General Settings --- */}
      {activeSubTab === 'general' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50">
            <h3 className="text-lg font-bold text-indigo-950 mb-4 flex items-center gap-2">
              <Settings className="text-indigo-500" size={20} />
              Platform Settings
            </h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Default Teacher Name</label>
                <p className="text-xs text-slate-500 mb-2">This name will be used as the default in reports and lesson plans.</p>
                <input
                  type="text"
                  value={localSettings.teacherName || ''}
                  onChange={e => setLocalSettings(prev => ({ ...prev, teacherName: e.target.value }))}
                  onBlur={() => {
                    if (localSettings.teacherName !== settings?.teacherName) {
                      handleSaveConfig();
                    }
                  }}
                  placeholder="e.g. Mr. Smith"
                  className="w-full max-w-md px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              <div className="pt-4 border-t border-white/50">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <label className="block text-sm font-medium text-indigo-950 mb-1">School Years</label>
                    <p className="text-xs text-slate-500">Manage available school years.</p>
                  </div>
                </div>
                <div className="flex gap-2 max-w-md mb-3">
                  <input
                    type="text"
                    value={newInput.schoolYear}
                    onChange={e => setNewInput({...newInput, schoolYear: e.target.value})}
                    placeholder="e.g. 2026-2027"
                    className="flex-1 px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  />
                  <button 
                    onClick={() => {
                      if (newInput.schoolYear.trim() && !localSettings.schoolYears.includes(newInput.schoolYear.trim())) {
                        setLocalSettings({
                          ...localSettings,
                          schoolYears: [...localSettings.schoolYears, newInput.schoolYear.trim()]
                        });
                        setNewInput({...newInput, schoolYear: ''});
                      }
                    }}
                    className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {localSettings.schoolYears.map(year => (
                    <span key={year} className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded-full text-sm text-slate-700 shadow-sm">
                      {year}
                      <button 
                        onClick={() => setLocalSettings({
                          ...localSettings,
                          schoolYears: localSettings.schoolYears.filter(y => y !== year)
                        })}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                  {localSettings.schoolYears.length === 0 && <span className="text-sm text-slate-400 italic">No school years added.</span>}
                </div>
              </div>

              <div className="pt-4 border-t border-white/50">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <label className="block text-sm font-medium text-indigo-950 mb-1">Grading Periods</label>
                    <p className="text-xs text-slate-500">Manage available grading periods (e.g., Quarters, Semesters).</p>
                  </div>
                </div>
                <div className="flex gap-2 max-w-md mb-3">
                  <input
                    type="text"
                    value={newInput.gradingPeriod}
                    onChange={e => setNewInput({...newInput, gradingPeriod: e.target.value})}
                    placeholder="e.g. Q1"
                    className="flex-1 px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  />
                  <button 
                    onClick={() => {
                      if (newInput.gradingPeriod.trim() && !localSettings.gradingPeriods.includes(newInput.gradingPeriod.trim())) {
                        setLocalSettings({
                          ...localSettings,
                          gradingPeriods: [...localSettings.gradingPeriods, newInput.gradingPeriod.trim()]
                        });
                        setNewInput({...newInput, gradingPeriod: ''});
                      }
                    }}
                    className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {localSettings.gradingPeriods.map(period => (
                    <span key={period} className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded-full text-sm text-slate-700 shadow-sm">
                      {period}
                      <button 
                        onClick={() => setLocalSettings({
                          ...localSettings,
                          gradingPeriods: localSettings.gradingPeriods.filter(p => p !== period)
                        })}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                  {localSettings.gradingPeriods.length === 0 && <span className="text-sm text-slate-400 italic">No grading periods added.</span>}
                </div>
              </div>

              <div className="pt-4 border-t border-white/50">
                <label className="block text-sm font-medium text-indigo-950 mb-1">Subjects</label>
                <p className="text-xs text-slate-500 mb-2">Manage available subjects.</p>
                <div className="flex gap-2 max-w-md mb-3">
                  <input
                    type="text"
                    value={newInput.subject}
                    onChange={e => setNewInput({...newInput, subject: e.target.value})}
                    placeholder="e.g. Math"
                    className="flex-1 px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  />
                  <button 
                    onClick={() => {
                      if (newInput.subject.trim() && !localSettings.subjects.includes(newInput.subject.trim())) {
                        setLocalSettings({
                          ...localSettings,
                          subjects: [...localSettings.subjects, newInput.subject.trim()]
                        });
                        setNewInput({...newInput, subject: ''});
                      }
                    }}
                    className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {localSettings.subjects.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded-full text-sm text-slate-700 shadow-sm">
                      {s}
                      <button 
                        onClick={() => setLocalSettings({
                          ...localSettings,
                          subjects: localSettings.subjects.filter(x => x !== s)
                        })}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                  {localSettings.subjects.length === 0 && <span className="text-sm text-slate-400 italic">No subjects added.</span>}
                </div>
              </div>

              <div className="pt-4 border-t border-white/50">
                <label className="block text-sm font-medium text-indigo-950 mb-1">Cohorts</label>
                <p className="text-xs text-slate-500 mb-2">Manage cohorts (e.g. 5a, 5b).</p>
                <div className="flex gap-2 max-w-md mb-3">
                  <input
                    type="text"
                    value={newInput.cohort}
                    onChange={e => setNewInput({...newInput, cohort: e.target.value})}
                    placeholder="e.g. 5a"
                    className="flex-1 px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  />
                  <button 
                    onClick={() => {
                      const coh = newInput.cohort.trim();
                      if (coh && !localSettings.cohorts?.includes(coh)) {
                        setLocalSettings({
                          ...localSettings,
                          cohorts: [...(localSettings.cohorts || []), coh],
                          cohortSubjects: {
                            ...(localSettings.cohortSubjects || {}),
                            [coh]: []
                          }
                        });
                        setNewInput({...newInput, cohort: ''});
                      }
                    }}
                    className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(localSettings.cohorts || []).map(c => (
                    <span key={c} className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded-full text-sm text-slate-700 shadow-sm">
                      {c}
                      <button 
                        onClick={() => {
                          const newCohortSubjects = { ...localSettings.cohortSubjects };
                          delete newCohortSubjects[c];
                          const remainingCohorts = localSettings.cohorts!.filter(x => x !== c);
                          
                          // Recalculate sections
                          const newSections = remainingCohorts.flatMap(coh => (newCohortSubjects[coh] || []).map(sub => `${coh} ${sub}`));
                          
                          setLocalSettings({
                            ...localSettings,
                            cohorts: remainingCohorts,
                            cohortSubjects: newCohortSubjects,
                            sections: newSections
                          });
                        }}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                  {!(localSettings.cohorts?.length) && <span className="text-sm text-slate-400 italic">No cohorts added.</span>}
                </div>
              </div>

              <div className="pt-4 border-t border-white/50">
                <label className="block text-sm font-medium text-indigo-950 mb-1">Class Structure & Session Codes</label>
                <p className="text-xs text-slate-500 mb-2">Assign subjects to cohorts to create Sections. Each section can have a 3 hex-digit session code.</p>
                <div className="space-y-4">
                  {(localSettings.cohorts || []).map(cohort => (
                    <div key={cohort} className="p-3 bg-white/50 rounded-lg border border-slate-200">
                      <div className="font-semibold text-slate-800 mb-2">{cohort}</div>
                      <div className="flex flex-wrap gap-2 mb-3">
                         {localSettings.subjects.map(subject => {
                            const isAssigned = localSettings.cohortSubjects?.[cohort]?.includes(subject);
                            return (
                              <button
                                key={subject}
                                onClick={() => {
                                   const currentAssigned = localSettings.cohortSubjects?.[cohort] || [];
                                   const newAssigned = isAssigned ? currentAssigned.filter(s => s !== subject) : [...currentAssigned, subject];
                                   
                                   const newCohortSubjects = {
                                      ...localSettings.cohortSubjects,
                                      [cohort]: newAssigned
                                   };
                                   
                                   const newSections = (localSettings.cohorts || []).flatMap(coh => (newCohortSubjects[coh] || []).map(sub => `${coh} ${sub}`));
                                   
                                   // Keep existing section codes if possible, auto-generate for new ones
                                   const newSectionCodes = { ...localSettings.sectionCodes };
                                   newSections.forEach(sec => {
                                      if (!newSectionCodes[sec]) {
                                          let hash = 0;
                                          for (let i = 0; i < sec.length; i++) {
                                            hash = ((hash << 5) - hash) + sec.charCodeAt(i);
                                            hash |= 0; 
                                          }
                                          newSectionCodes[sec] = ('000' + Math.abs(hash).toString(16).toUpperCase()).slice(-3);
                                      }
                                   });

                                   setLocalSettings({
                                     ...localSettings,
                                     cohortSubjects: newCohortSubjects,
                                     sections: newSections,
                                     sectionCodes: newSectionCodes
                                   });
                                }}
                                className={`px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${isAssigned ? 'bg-indigo-100 border-indigo-200 text-indigo-800' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                              >
                                {subject}
                              </button>
                            );
                         })}
                         {localSettings.subjects.length === 0 && <span className="text-xs text-slate-400 italic">Add subjects above to assign them.</span>}
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                         {(localSettings.cohortSubjects?.[cohort] || []).map(subject => {
                            const sec = `${cohort} ${subject}`;
                            const code = localSettings.sectionCodes?.[sec] || 'XXX';
                            return (
                              <div key={sec} className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded shadow-sm text-sm">
                                <span className="text-slate-700 font-medium truncate mr-2">{sec}</span>
                                <input
                                  type="text"
                                  value={code}
                                  maxLength={3}
                                  onChange={(e) => {
                                    const val = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
                                    setLocalSettings({
                                      ...localSettings,
                                      sectionCodes: {
                                        ...(localSettings.sectionCodes || {}),
                                        [sec]: val
                                      }
                                    });
                                  }}
                                  className="w-14 text-center px-1 py-1 text-xs font-mono font-bold border border-slate-300 rounded text-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              </div>
                            );
                         })}
                      </div>
                    </div>
                  ))}
                  {!(localSettings.cohorts?.length) && <span className="text-sm text-slate-400 italic">Add cohorts above to create classes.</span>}
                </div>
              </div>

              <div className="pt-4 border-t border-white/50">
                <h4 className="text-md font-bold text-indigo-950 mb-4 flex items-center gap-2">
                  <Sliders className="text-indigo-500" size={18} />
                  Grading Configuration
                </h4>
                <p className="text-xs text-slate-500 mb-6">Customize the weights and scales for each grading category. Set a category to "N/A" (disabled) to exclude it from calculations.</p>

                <div className="space-y-6">
                  {/* Classwork */}
                  <div className="bg-white/40 p-4 rounded-xl border border-white/60">
                    <div className="flex items-center justify-between mb-3">
                      <label className="font-semibold text-indigo-900">Classwork</label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">Enabled:</span>
                        <input 
                          type="checkbox" 
                          checked={localSettings.gradingConfig?.classwork.enabled}
                          onChange={(e) => setLocalSettings({
                            ...localSettings,
                            gradingConfig: {
                              ...(localSettings.gradingConfig || DEFAULT_GRADING_CONFIG),
                              classwork: { ...(localSettings.gradingConfig || DEFAULT_GRADING_CONFIG).classwork, enabled: e.target.checked }
                            }
                          })}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    {localSettings.gradingConfig?.classwork.enabled && (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Weight (Max Pts)</label>
                          <input type="number" value={localSettings.gradingConfig.classwork.weight} onChange={(e) => setLocalSettings({...localSettings, gradingConfig: {...localSettings.gradingConfig!, classwork: {...localSettings.gradingConfig!.classwork, weight: Number(e.target.value)}}})} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">A (%)</label>
                          <input type="number" value={localSettings.gradingConfig.classwork.letters.A} onChange={(e) => setLocalSettings({...localSettings, gradingConfig: {...localSettings.gradingConfig!, classwork: {...localSettings.gradingConfig!.classwork, letters: {...localSettings.gradingConfig!.classwork.letters, A: Number(e.target.value)}}}})} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">B (%)</label>
                          <input type="number" value={localSettings.gradingConfig.classwork.letters.B} onChange={(e) => setLocalSettings({...localSettings, gradingConfig: {...localSettings.gradingConfig!, classwork: {...localSettings.gradingConfig!.classwork, letters: {...localSettings.gradingConfig!.classwork.letters, B: Number(e.target.value)}}}})} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">C (%)</label>
                          <input type="number" value={localSettings.gradingConfig.classwork.letters.C} onChange={(e) => setLocalSettings({...localSettings, gradingConfig: {...localSettings.gradingConfig!, classwork: {...localSettings.gradingConfig!.classwork, letters: {...localSettings.gradingConfig!.classwork.letters, C: Number(e.target.value)}}}})} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">F (%)</label>
                          <input type="number" value={localSettings.gradingConfig.classwork.letters.F} onChange={(e) => setLocalSettings({...localSettings, gradingConfig: {...localSettings.gradingConfig!, classwork: {...localSettings.gradingConfig!.classwork, letters: {...localSettings.gradingConfig!.classwork.letters, F: Number(e.target.value)}}}})} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Homework */}
                  <div className="bg-white/40 p-4 rounded-xl border border-white/60">
                    <div className="flex items-center justify-between mb-3">
                      <label className="font-semibold text-indigo-900">Homework</label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">Enabled:</span>
                        <input 
                          type="checkbox" 
                          checked={localSettings.gradingConfig?.homework.enabled}
                          onChange={(e) => setLocalSettings({
                            ...localSettings,
                            gradingConfig: {
                              ...(localSettings.gradingConfig || DEFAULT_GRADING_CONFIG),
                              homework: { ...(localSettings.gradingConfig || DEFAULT_GRADING_CONFIG).homework, enabled: e.target.checked }
                            }
                          })}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    {localSettings.gradingConfig?.homework.enabled && (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Weight (Max Pts)</label>
                          <input type="number" value={localSettings.gradingConfig.homework.weight} onChange={(e) => setLocalSettings({...localSettings, gradingConfig: {...localSettings.gradingConfig!, homework: {...localSettings.gradingConfig!.homework, weight: Number(e.target.value)}}})} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Completed (%)</label>
                          <input type="number" value={localSettings.gradingConfig.homework.statuses.Completed} onChange={(e) => setLocalSettings({...localSettings, gradingConfig: {...localSettings.gradingConfig!, homework: {...localSettings.gradingConfig!.homework, statuses: {...localSettings.gradingConfig!.homework.statuses, Completed: Number(e.target.value)}}}})} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Late (%)</label>
                          <input type="number" value={localSettings.gradingConfig.homework.statuses.Late} onChange={(e) => setLocalSettings({...localSettings, gradingConfig: {...localSettings.gradingConfig!, homework: {...localSettings.gradingConfig!.homework, statuses: {...localSettings.gradingConfig!.homework.statuses, Late: Number(e.target.value)}}}})} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Incomplete (%)</label>
                          <input type="number" value={localSettings.gradingConfig.homework.statuses.Incomplete} onChange={(e) => setLocalSettings({...localSettings, gradingConfig: {...localSettings.gradingConfig!, homework: {...localSettings.gradingConfig!.homework, statuses: {...localSettings.gradingConfig!.homework.statuses, Incomplete: Number(e.target.value)}}}})} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Not Sub. (%)</label>
                          <input type="number" value={localSettings.gradingConfig.homework.statuses.NotSubmitted} onChange={(e) => setLocalSettings({...localSettings, gradingConfig: {...localSettings.gradingConfig!, homework: {...localSettings.gradingConfig!.homework, statuses: {...localSettings.gradingConfig!.homework.statuses, NotSubmitted: Number(e.target.value)}}}})} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Participation, Behavior, Quiz, Adjustments, Attendance */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {['participation', 'behavior', 'quiz', 'adjustments', 'attendance'].map((cat) => {
                      const category = cat as keyof Pick<GradingConfig, 'participation' | 'behavior' | 'quiz' | 'adjustments' | 'attendance'>;
                      return (
                        <div key={cat} className="bg-white/40 p-4 rounded-xl border border-white/60 flex items-center justify-between">
                          <div>
                            <label className="font-semibold text-indigo-900 capitalize">{cat}</label>
                            {localSettings.gradingConfig?.[category]?.enabled && (
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs text-slate-500">Weight:</span>
                                <input 
                                  type="number" 
                                  value={localSettings.gradingConfig[category]?.weight || 0} 
                                  onChange={(e) => setLocalSettings({
                                    ...localSettings, 
                                    gradingConfig: {
                                      ...localSettings.gradingConfig!, 
                                      [category]: { ...(localSettings.gradingConfig![category] || { enabled: true, weight: 0 }), weight: Number(e.target.value) }
                                    }
                                  })} 
                                  className="w-20 px-2 py-1 border border-slate-200 rounded text-sm" 
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-600">Enabled:</span>
                            <input 
                              type="checkbox" 
                              checked={localSettings.gradingConfig?.[category]?.enabled || false}
                              onChange={(e) => setLocalSettings({
                                ...localSettings,
                                gradingConfig: {
                                  ...(localSettings.gradingConfig || DEFAULT_GRADING_CONFIG),
                                  [category]: { ...(localSettings.gradingConfig?.[category] || DEFAULT_GRADING_CONFIG[category] || { enabled: false, weight: 0 }), enabled: e.target.checked }
                                }
                              })}
                              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/50 flex justify-end">
                <button
                  onClick={handleSaveConfig}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm"
                >
                  <Save size={18} />
                  Save Configuration
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* --- Roster Management --- */}
      {activeSubTab === 'roster' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50">
            <h2 className="text-xl font-semibold text-indigo-950 mb-4">Add New Student</h2>
            <form onSubmit={handleAddStudent} className="flex flex-col sm:flex-row gap-4 flex-wrap">
              <div className="flex-1 min-w-[150px]">
                <input
                  type="text"
                  placeholder="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <input
                  type="text"
                  placeholder="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <select
                  value={cohort}
                  onChange={(e) => {
                    if (e.target.value === 'NEW') {
                      const newC = prompt('Enter new Cohort (e.g., 10th):');
                      if (newC && newC.trim()) {
                        if (onSaveSettings) {
                          onSaveSettings({
                            ...localSettings,
                            sections: [...localSettings.sections, newC.trim()]
                          });
                        }
                        setCohort(newC.trim());
                      }
                    } else {
                      setCohort(e.target.value);
                    }
                  }}
                  className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {allCohorts.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option disabled>──────────</option>
                  <option value="NEW" className="font-semibold text-indigo-600">+ Add new ...</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={isSavingRoster}
                className="flex items-center justify-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {isSavingRoster ? <Loader2 className="animate-spin" size={20} /> : 'Add'}
              </button>
            </form>
          </div>

          <div className="bg-white/60 backdrop-blur-md rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50 overflow-hidden">
            <div className="p-4 border-b border-white/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/40">
              <h3 className="font-semibold text-indigo-950">Current Roster</h3>
              <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-slate-500" />
                  <span className="text-sm font-medium text-slate-600 sm:hidden">Filter:</span>
                </div>
                <select
                  value={rosterFilter}
                  onChange={e => setRosterFilter(e.target.value)}
                  className="flex-1 sm:flex-none px-3 py-1.5 border border-white/50 bg-white/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                >
                  <option value="ALL">All Cohorts</option>
                  {allCohorts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-indigo-50/50 border-b border-white/50">
                    <th className="px-6 py-4 font-semibold text-indigo-950">Last Name</th>
                    <th className="px-6 py-4 font-semibold text-indigo-950">First Name</th>
                    <th className="px-6 py-4 font-semibold text-indigo-950">Cohort</th>
                    <th className="px-6 py-4 font-semibold text-indigo-950 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/50">
                  {students.filter(s => rosterFilter === 'ALL' || s.cohort === rosterFilter).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                        No students found. Add one above to get started.
                      </td>
                    </tr>
                  ) : (
                    students.filter(s => rosterFilter === 'ALL' || s.cohort === rosterFilter).map((student) => (
                      <tr key={student.id} className="hover:bg-white/40 transition-colors">
                        {editingId === student.id ? (
                          <>
                            <td className="px-6 py-4">
                              <input
                                type="text"
                                value={editLastName}
                                onChange={e => setEditLastName(e.target.value)}
                                className="w-full px-3 py-1 border border-white/50 bg-white/50 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="text"
                                value={editFirstName}
                                onChange={e => setEditFirstName(e.target.value)}
                                className="w-full px-3 py-1 border border-white/50 bg-white/50 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <select
                                value={editCohort}
                                onChange={e => {
                                  if (e.target.value === 'NEW') {
                                    const newC = prompt('Enter new Cohort (e.g., 10th):');
                                    if (newC && newC.trim()) {
                                      if (onSaveSettings) {
                                        onSaveSettings({
                                          ...localSettings,
                                          sections: [...localSettings.sections, newC.trim()]
                                        });
                                      }
                                      setEditCohort(newC.trim());
                                    }
                                  } else {
                                    setEditCohort(e.target.value);
                                  }
                                }}
                                className="w-full px-3 py-1 border border-white/50 bg-white/50 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                {allCohorts.map(c => <option key={c} value={c}>{c}</option>)}
                                <option disabled>──────────</option>
                                <option value="NEW" className="font-semibold text-indigo-600">+ Add new ...</option>
                              </select>
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                              <button onClick={saveEditStudent} className="p-2 text-emerald-600 hover:bg-emerald-50/50 rounded-lg transition-colors" title="Save">
                                <Save size={18} />
                              </button>
                              <button onClick={() => setEditingId(null)} className="p-2 text-slate-400 hover:bg-white/50 rounded-lg transition-colors" title="Cancel">
                                <X size={18} />
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-6 py-4 text-slate-800">{student.lastName}</td>
                            <td className="px-6 py-4 text-slate-800">{student.firstName}</td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100/50 text-indigo-800 border border-indigo-200/50">
                                {student.cohort}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                              <button onClick={() => startEditStudent(student)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/50 rounded-lg transition-colors" title="Edit">
                                <Edit2 size={18} />
                              </button>
                              <button onClick={() => handleDeleteStudentRoster(student.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 rounded-lg transition-colors" title="Delete">
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-white/50">
              {students.filter(s => rosterFilter === 'ALL' || s.cohort === rosterFilter).length === 0 ? (
                <div className="px-6 py-8 text-center text-slate-500">
                  No students found. Add one above to get started.
                </div>
              ) : (
                students.filter(s => rosterFilter === 'ALL' || s.cohort === rosterFilter).map((student) => (
                  <div key={student.id} className="p-4 hover:bg-white/40 transition-colors">
                    {editingId === student.id ? (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-mono text-indigo-600 font-medium">{student.id}</span>
                          <div className="flex items-center gap-2">
                            <button onClick={saveEditStudent} className="p-2 text-emerald-600 bg-emerald-50/50 rounded-lg transition-colors" title="Save">
                              <Save size={18} />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-2 text-slate-400 bg-white/50 rounded-lg transition-colors" title="Cancel">
                              <X size={18} />
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={editLastName}
                          onChange={e => setEditLastName(e.target.value)}
                          placeholder="Last Name"
                          className="w-full px-3 py-2 border border-white/50 bg-white/50 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <input
                          type="text"
                          value={editFirstName}
                          onChange={e => setEditFirstName(e.target.value)}
                          placeholder="First Name"
                          className="w-full px-3 py-2 border border-white/50 bg-white/50 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <select
                          value={editCohort}
                          onChange={e => {
                            if (e.target.value === 'NEW') {
                              const newC = prompt('Enter new Cohort (e.g., 10th):');
                              if (newC && newC.trim()) {
                                if (onSaveSettings) {
                                  onSaveSettings({
                                    ...localSettings,
                                    sections: [...localSettings.sections, newC.trim()]
                                  });
                                }
                                setEditCohort(newC.trim());
                              }
                            } else {
                              setEditCohort(e.target.value);
                            }
                          }}
                          className="w-full px-3 py-2 border border-white/50 bg-white/50 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {allCohorts.map(c => <option key={c} value={c}>{c}</option>)}
                          <option disabled>──────────</option>
                          <option value="NEW" className="font-semibold text-indigo-600">+ Add new ...</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-slate-800 text-lg">{student.lastName}, {student.firstName}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm font-mono text-indigo-600">{student.id}</span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100/50 text-indigo-800 border border-indigo-200/50">
                              {student.cohort}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEditStudent(student)} className="p-2 text-slate-400 hover:text-indigo-600 bg-white/50 rounded-lg transition-colors" title="Edit">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleDeleteStudentRoster(student.id)} className="p-2 text-slate-400 hover:text-rose-600 bg-white/50 rounded-lg transition-colors" title="Delete">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- Data Management --- */}
      {activeSubTab === 'data' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Security Modal Overlay */}
          {modalConfig?.isOpen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 border border-white/50">
                <div className="bg-rose-50/80 p-6 flex flex-col items-center text-center border-b border-rose-100/50">
                  <div className="w-16 h-16 bg-rose-100/80 text-rose-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
                    <AlertOctagon size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-rose-900 mb-2">{modalConfig.title}</h2>
                  <p className="text-rose-700 text-sm">{modalConfig.message}</p>
                </div>
                
                <div className="p-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    To confirm, type <span className="font-bold text-indigo-950 select-all">{modalConfig.expectedText}</span> below:
                  </label>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={e => setConfirmInput(e.target.value)}
                    placeholder={modalConfig.expectedText}
                    className="w-full px-4 py-3 border border-slate-300/50 bg-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono text-center tracking-widest uppercase text-slate-800"
                    autoComplete="off"
                  />
                  
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={closeModal}
                      disabled={isDeleting}
                      className="flex-1 px-4 py-3 bg-slate-100/80 text-slate-700 rounded-xl hover:bg-slate-200/80 transition-colors font-medium shadow-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeAction}
                      disabled={confirmInput !== modalConfig.expectedText || isDeleting}
                      className="flex-1 px-4 py-3 bg-rose-600/90 text-white rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2 shadow-sm"
                    >
                      {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-rose-50/80 backdrop-blur-sm border border-rose-200/50 p-4 rounded-xl flex items-start gap-3 shadow-sm">
            <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="text-rose-800 font-bold">Danger Zone</h3>
              <p className="text-rose-600 text-sm mt-1">
                Actions taken here are permanent and cannot be undone. Data deleted from the database will be lost forever. Please proceed with caution.
              </p>
            </div>
          </div>

          {/* Checkpoint Restore */}
          <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50">
            <div className="flex items-center gap-2 mb-4">
              <Database className="text-slate-400" size={20} />
              <h3 className="text-lg font-bold text-indigo-950">Restore Checkpoint</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Restore your data to a previous state. The system automatically saves a checkpoint every day and keeps them for up to 14 days. 
              <strong> Warning: This will overwrite all your current data.</strong>
            </p>
            
            {checkpoints.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center text-slate-500 text-sm">
                No checkpoints available yet. Checkpoints are created automatically each day you use the app.
              </div>
            ) : (
              <div className="space-y-3">
                {checkpoints.map(cp => {
                  const date = new Date(cp.timestamp);
                  return (
                    <div key={cp.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <div>
                        <div className="font-semibold text-slate-800">{cp.id}</div>
                        <div className="text-xs text-slate-500">{date.toLocaleTimeString()}</div>
                      </div>
                      <button
                        onClick={() => {
                          if (onRestoreCheckpoint) {
                            setModalConfig({
                              isOpen: true,
                              title: 'Restore Checkpoint',
                              message: `Are you sure you want to restore the checkpoint from ${cp.id}? All current data will be permanently replaced.`,
                              expectedText: 'RESTORE',
                              action: async () => {
                                setIsRestoring(true);
                                await onRestoreCheckpoint(cp.id);
                                setIsRestoring(false);
                              }
                            });
                          }
                        }}
                        disabled={isRestoring}
                        className="px-4 py-2 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        {isRestoring ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                        Restore
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 1. Remove Student */}
          <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50">
            <div className="flex items-center gap-2 mb-4">
              <UserX className="text-slate-400" size={20} />
              <h3 className="text-lg font-bold text-indigo-950">Remove Student from Cohort</h3>
            </div>
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-indigo-950 mb-1">Select Student</label>
                <select
                  value={studentToDelete}
                  onChange={e => setStudentToDelete(e.target.value)}
                  className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-800"
                >
                  <option value="">-- Choose a student --</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.lastName}, {s.firstName} ({s.cohort})</option>
                  ))}
                </select>
              </div>
              <button
                onClick={requestDeleteStudent}
                disabled={!studentToDelete}
                className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-rose-600/90 text-white rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm shrink-0"
              >
                <Trash2 size={18} /> Delete Student
              </button>
            </div>
          </div>

          {/* 2. Remove Topic / Lesson */}
          <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50">
            <div className="flex items-center gap-2 mb-4">
              <FileX className="text-slate-400" size={20} />
              <h3 className="text-lg font-bold text-indigo-950">Remove Topic / Lesson</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Quarter</label>
                <select
                  value={topicQuarter}
                  onChange={e => {
                    if (e.target.value === 'NEW') {
                      const newQ = prompt('Enter new Quarter (e.g., Q5):');
                      if (newQ && newQ.trim()) {
                        setCustomQuarters(prev => [...prev, newQ.trim()]);
                        setTopicQuarter(newQ.trim() as Quarter);
                      }
                    } else {
                      setTopicQuarter(e.target.value as Quarter);
                    }
                  }}
                  className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                >
                  {allQuarters.map(q => <option key={q} value={q}>{q}</option>)}
                  <option disabled>──────────</option>
                  <option value="NEW" className="font-semibold text-indigo-600">+ Add new ...</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Section</label>
                <select
                  value={topicSection}
                  onChange={e => {
                    if (e.target.value === 'NEW') {
                      const newS = prompt('Enter new Section (e.g., 10th Math):');
                      if (newS && newS.trim()) {
                        if (onSaveSettings) {
                          onSaveSettings({
                            ...localSettings,
                            sections: [...localSettings.sections, newS.trim()]
                          });
                        }
                        setTopicSection(newS.trim());
                      }
                    } else {
                      setTopicSection(e.target.value);
                    }
                  }}
                  className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                >
                  {allSections.map(s => <option key={s} value={s}>{s}</option>)}
                  <option disabled>──────────</option>
                  <option value="NEW" className="font-semibold text-indigo-600">+ Add new ...</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Topic</label>
                <select
                  value={topicToDelete}
                  onChange={e => setTopicToDelete(e.target.value)}
                  className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                >
                  <option value="">-- Select Topic --</option>
                  {filteredTopics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-end pt-4 border-t border-white/50">
              <button
                onClick={requestDeleteTopic}
                disabled={!topicToDelete}
                className="w-full lg:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-rose-600/90 text-white rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm shrink-0"
              >
                <Trash2 size={18} /> Delete Entire Topic
              </button>

              <div className="flex-1 w-full flex flex-col sm:flex-row gap-4 items-end lg:ml-auto lg:max-w-md">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Or remove specific student's records:</label>
                  <select
                    value={topicStudentToRemove}
                    onChange={e => setTopicStudentToRemove(e.target.value)}
                    disabled={!topicToDelete}
                    className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-slate-800 disabled:opacity-50"
                  >
                    <option value="">-- Select Student --</option>
                    {students.filter(s => s.cohort === topicSection.split(' ')[0]).map(s => (
                      <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={requestRemoveStudentFromTopic}
                  disabled={!topicToDelete || !topicStudentToRemove}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-orange-100/80 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm shrink-0"
                >
                  Remove Student
                </button>
              </div>
            </div>
          </div>

          {/* 3. Remove Session */}
          <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50">
            <div className="flex items-center gap-2 mb-4">
              <CalendarX className="text-slate-400" size={20} />
              <h3 className="text-lg font-bold text-indigo-950">Remove Session</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Select Topic</label>
                <select
                  value={sessionTopicId}
                  onChange={e => setSessionTopicId(e.target.value)}
                  className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                >
                  <option value="">-- Select Topic --</option>
                  {topics.map(t => <option key={t.id} value={t.id}>{t.title} ({t.section})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Select Session Date</label>
                <select
                  value={sessionToDelete}
                  onChange={e => setSessionToDelete(e.target.value)}
                  disabled={!sessionTopicId}
                  className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 disabled:opacity-50"
                >
                  <option value="">-- Select Session --</option>
                  {filteredSessions.map(s => <option key={s.id} value={s.id}>{s.date}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-end pt-4 border-t border-white/50">
              <button
                onClick={requestDeleteSession}
                disabled={!sessionToDelete}
                className="w-full lg:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-rose-600/90 text-white rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm shrink-0"
              >
                <Trash2 size={18} /> Delete Entire Session
              </button>

              <div className="flex-1 w-full flex flex-col sm:flex-row gap-4 items-end lg:ml-auto lg:max-w-md">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Or remove specific student's record:</label>
                  <select
                    value={sessionStudentToRemove}
                    onChange={e => setSessionStudentToRemove(e.target.value)}
                    disabled={!sessionToDelete}
                    className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-slate-800 disabled:opacity-50"
                  >
                    <option value="">-- Select Student --</option>
                    {sessionToDelete && sessions.find(s => s.id === sessionToDelete)?.records.map(r => {
                      const student = students.find(s => s.id === r.studentId);
                      return student ? <option key={student.id} value={student.id}>{student.lastName}, {student.firstName}</option> : null;
                    })}
                  </select>
                </div>
                <button
                  onClick={requestRemoveStudentFromSession}
                  disabled={!sessionToDelete || !sessionStudentToRemove}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-orange-100/80 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm shrink-0"
                >
                  Remove Student
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Events Log --- */}
      {activeSubTab === 'events' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-white/50">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-indigo-950 flex items-center gap-2">
                <FileText className="text-indigo-500" size={20} />
                Events Log
              </h3>
              <button
                onClick={() => {
                  const events = JSON.parse(localStorage.getItem('app_events_log') || '[]');
                  const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `events_log_${new Date().toISOString().split('T')[0]}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors text-sm font-medium"
              >
                <Download size={16} /> Download Log
              </button>
            </div>
            
            <div className="bg-slate-50/80 rounded-xl border border-slate-200 overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto p-4">
                {(() => {
                  const events = JSON.parse(localStorage.getItem('app_events_log') || '[]');
                  if (events.length === 0) {
                    return <p className="text-slate-500 text-center py-8">No events recorded yet.</p>;
                  }
                  return (
                    <div className="space-y-3">
                      {events.slice().reverse().map((event: any, index: number) => (
                        <div key={index} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm text-sm">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-indigo-900">{event.type}</span>
                            <span className="text-xs text-slate-400">{new Date(event.timestamp).toLocaleString()}</span>
                          </div>
                          <p className="text-slate-600">{event.message}</p>
                          {event.details && (
                            <pre className="mt-2 text-xs bg-slate-50 p-2 rounded text-slate-500 overflow-x-auto">
                              {JSON.stringify(event.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
