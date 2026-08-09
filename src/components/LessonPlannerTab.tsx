import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, FileText, Trash2, Edit, Printer, Sparkles, Loader2, X, Folder, ArrowLeft, Upload, Cloud, FolderPlus, Search, Settings, ChevronDown, MoreVertical, Copy, Save } from 'lucide-react';
import { Topic, LessonPlan, LessonPlanActivity, DEFAULT_SECTIONS, TeacherSettings } from '../types';
import { GoogleGenAI, Type } from '@google/genai';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as mammoth from 'mammoth';
import useDrivePicker from 'react-google-drive-picker';
import { ConfirmModal } from './ConfirmModal';

const DebouncedTextarea = ({ 
  value, 
  onChange, 
  placeholder, 
  className,
  rows
}: { 
  value: string; 
  onChange: (val: string) => void; 
  placeholder?: string; 
  className?: string; 
  rows?: number;
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
      rows={rows}
    />
  );
};

const DebouncedInput = ({ 
  value, 
  onChange, 
  placeholder, 
  className,
  type = "text",
  maxLength,
  min,
  max,
  autoFocus
}: { 
  value: string | number; 
  onChange: (val: any) => void; 
  placeholder?: string; 
  className?: string; 
  type?: string;
  maxLength?: number;
  min?: string | number;
  max?: string | number;
  autoFocus?: boolean;
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
    setLocalValue(type === 'number' ? Number(e.target.value) : e.target.value);
  };

  const handleBlur = () => {
    isFocused.current = false;
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  return (
    <input
      type={type}
      value={localValue}
      onChange={handleChange}
      onFocus={() => isFocused.current = true}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      maxLength={maxLength}
      min={min}
      max={max}
      autoFocus={autoFocus}
    />
  );
};

interface Props {
  topics: Topic[];
  lessonPlans: LessonPlan[];
  onSaveLessonPlan: (plan: LessonPlan, silent?: boolean) => Promise<void>;
  onDeleteLessonPlan: (id: string) => Promise<void>;
  onDeleteTopic?: (id: string) => Promise<void>;
  activePeriod: string;
  onInternalBackChange?: (handler: (() => void) | null) => void;
  settings?: TeacherSettings | null;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

export default function LessonPlannerTab({ topics, lessonPlans, onSaveLessonPlan, onDeleteLessonPlan, onDeleteTopic, activePeriod, onInternalBackChange, settings }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => {
    if (isEditing && onInternalBackChange) {
      onInternalBackChange(() => () => setIsEditing(false));
    } else if (onInternalBackChange) {
      onInternalBackChange(null);
    }
    return () => {
      if (onInternalBackChange) onInternalBackChange(null);
    };
  }, [isEditing, onInternalBackChange]);

  const [currentPlan, setCurrentPlan] = useState<Partial<LessonPlan> | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const autosaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastSavedPlanStrRef = React.useRef<{ id: string, str: string } | null>(null);

  useEffect(() => {
    if (isEditing && currentPlan && currentPlan.id) {
      const currentPlanStr = JSON.stringify(currentPlan);
      
      if (lastSavedPlanStrRef.current?.id !== currentPlan.id) {
         lastSavedPlanStrRef.current = { id: currentPlan.id, str: currentPlanStr };
         return;
      }

      if (lastSavedPlanStrRef.current.str === currentPlanStr) {
        return; // No changes
      }

      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = setTimeout(async () => {
        setIsAutosaving(true);
        try {
          await onSaveLessonPlan(currentPlan as LessonPlan, true);
          lastSavedPlanStrRef.current = { id: currentPlan.id!, str: currentPlanStr };
        } catch (error) {
          console.error("Autosave failed", error);
        } finally {
          setIsAutosaving(false);
        }
      }, 1500);
    }
    
    return () => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    };
  }, [currentPlan, isEditing, onSaveLessonPlan]);

  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [customInputs, setCustomInputs] = useState<{ [key: string]: boolean }>({});
  const [selectedSection, setSelectedSection] = useState<string | null>(() => {
    const saved = localStorage.getItem('lessonPlanner_selectedSection');
    return saved || null;
  });

  useEffect(() => {
    if (selectedSection) {
      localStorage.setItem('lessonPlanner_selectedSection', selectedSection);
    } else {
      localStorage.removeItem('lessonPlanner_selectedSection');
    }
  }, [selectedSection]);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean; title: string; message: string; onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});
  const [groupBy, setGroupBy] = useState<'section' | 'subject' | 'cohort'>('section');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openPicker, authResponse] = useDrivePicker();
  const authResponseRef = useRef(authResponse);

  const [customFolders, setCustomFolders] = useState<string[]>(() => {
    const saved = localStorage.getItem('lessonPlanner_customFolders');
    return saved ? JSON.parse(saved) : [];
  });
  const [hiddenFolders, setHiddenFolders] = useState<string[]>(() => {
    const saved = localStorage.getItem('lessonPlanner_hiddenFolders');
    return saved ? JSON.parse(saved) : [];
  });
  const [subjectInitialsMap, setSubjectInitialsMap] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('lessonPlanner_subjectInitials');
    return saved ? JSON.parse(saved) : {
      'Language': 'LA',
      'Math': 'MA',
      'Science': 'SC',
      'Social Studies': 'SS',
      'History': 'HI',
      'Art': 'AR',
      'Music': 'MU',
      'Physical Education': 'PE'
    };
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [planToCopy, setPlanToCopy] = useState<LessonPlan | null>(null);
  const [selectedFoldersToCopy, setSelectedFoldersToCopy] = useState<string[]>([]);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isImportMenuOpen && !(event.target as Element).closest('.import-dropdown')) {
        setIsImportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isImportMenuOpen]);

  useEffect(() => {
    localStorage.setItem('lessonPlanner_customFolders', JSON.stringify(customFolders));
  }, [customFolders]);

  useEffect(() => {
    localStorage.setItem('lessonPlanner_hiddenFolders', JSON.stringify(hiddenFolders));
  }, [hiddenFolders]);

  useEffect(() => {
    localStorage.setItem('lessonPlanner_subjectInitials', JSON.stringify(subjectInitialsMap));
  }, [subjectInitialsMap]);

  useEffect(() => {
    authResponseRef.current = authResponse;
  }, [authResponse]);

  const uniqueTeachers = useMemo(() => {
    const teachers = new Set(lessonPlans.map(p => p.teacher).filter(Boolean));
    return Array.from(teachers);
  }, [lessonPlans]);

  const getCohort = (sectionName: string) => {
    const words = sectionName.split(' ').filter(w => w.length > 0);
    if (words.length > 0) {
      return words[0];
    }
    return 'Unassigned';
  };

  const getFolderInitial = (folderName: string) => {
    if (groupBy === 'cohort') {
      return folderName.substring(0, 3).toUpperCase();
    }
    
    // 1. Check against subjectInitialsMap
    for (const [subject, initial] of Object.entries(subjectInitialsMap)) {
      if (folderName.toLowerCase().includes(subject.toLowerCase())) {
        return initial;
      }
    }
    
    // 2. If not found, try to find a word that looks like a subject (skip words with numbers like "7a", "8th")
    const words = folderName.split(' ').filter(w => w.length > 0);
    const subjectWord = words.find(w => !/\d/.test(w));
    
    if (subjectWord) {
      return subjectWord.substring(0, 2).toUpperCase();
    }
    
    // 3. Fallback to first two characters
    return folderName.substring(0, 2).toUpperCase();
  };

  const getLessonPlanCode = (plan: LessonPlan) => {
    let initial = plan.subjectInitial;
    if (!initial && plan.subject) {
      initial = subjectInitialsMap[plan.subject] || plan.subject.substring(0, 2).toUpperCase();
    } else if (!initial) {
      initial = 'LA';
    }
    const sectionStr = plan.section ? plan.section.replace(/[^a-zA-Z0-9]/g, '').substring(0, 2).toUpperCase() : 'XX';
    
    let yy = '00', mm = '00', dd = '00';
    if (plan.date) {
      const parts = plan.date.split('-');
      if (parts.length === 3) {
        yy = parts[0].slice(-2);
        mm = parts[1];
        dd = parts[2];
      } else {
        const date = new Date(plan.date);
        yy = date.getFullYear().toString().slice(-2);
        mm = (date.getMonth() + 1).toString().padStart(2, '0');
        dd = date.getDate().toString().padStart(2, '0');
      }
    } else {
      const date = new Date();
      yy = date.getFullYear().toString().slice(-2);
      mm = (date.getMonth() + 1).toString().padStart(2, '0');
      dd = date.getDate().toString().padStart(2, '0');
    }
    
    return `${initial}${sectionStr}${yy}${mm}${dd}`.replace(/\s+/g, '').toUpperCase();
  };

  const sectionsWithPlans = useMemo(() => {
    const grouped: Record<string, LessonPlan[]> = {};
    
    if (groupBy === 'section') {
      const plansSections = lessonPlans.map(p => p.section).filter(Boolean);
      
      const defaultSections = settings ? settings.sections : DEFAULT_SECTIONS;
      
      // Initialize with all known sections to ensure they appear even if empty
      const allKnownSections = Array.from(new Set([
        ...defaultSections,
        ...topics.map(t => t.section),
        ...plansSections,
        ...customFolders
      ])).filter(Boolean).filter(s => {
        if (plansSections.includes(s)) return true;
        return !hiddenFolders.includes(s);
      }).sort();

      allKnownSections.forEach(section => {
        grouped[section] = [];
      });

      // Also handle "Unassigned" if there are plans without a section
      grouped['Unassigned'] = [];

      // Populate with plans
      lessonPlans.forEach(plan => {
        const section = plan.section || 'Unassigned';
        if (!grouped[section]) {
          // In case a plan has a section not in our known list (e.g. custom typed)
          grouped[section] = [];
        }
        
        const query = searchQuery.toLowerCase();
        const planCode = getLessonPlanCode(plan).toLowerCase();
        const matchesSearch = !query || 
          (plan.subject && plan.subject.toLowerCase().includes(query)) ||
          (plan.week && plan.week.toLowerCase().includes(query)) ||
          (plan.chapterUnit && plan.chapterUnit.toLowerCase().includes(query)) ||
          (plan.sectionLesson && plan.sectionLesson.toLowerCase().includes(query)) ||
          planCode.includes(query);

        if (matchesSearch) {
          grouped[section].push(plan);
        }
      });
    } else if (groupBy === 'subject') {
      const plansSubjects = lessonPlans.map(p => p.subject).filter(Boolean);
      const allKnownSubjects = Array.from(new Set(plansSubjects)).sort();
      
      allKnownSubjects.forEach(subject => {
        grouped[subject] = [];
      });
      grouped['Unassigned'] = [];

      lessonPlans.forEach(plan => {
        const subject = plan.subject || 'Unassigned';
        if (!grouped[subject]) {
          grouped[subject] = [];
        }
        
        const query = searchQuery.toLowerCase();
        const planCode = getLessonPlanCode(plan).toLowerCase();
        const matchesSearch = !query || 
          (plan.subject && plan.subject.toLowerCase().includes(query)) ||
          (plan.week && plan.week.toLowerCase().includes(query)) ||
          (plan.chapterUnit && plan.chapterUnit.toLowerCase().includes(query)) ||
          (plan.sectionLesson && plan.sectionLesson.toLowerCase().includes(query)) ||
          planCode.includes(query);

        if (matchesSearch) {
          grouped[subject].push(plan);
        }
      });
    } else if (groupBy === 'cohort') {
      const plansCohorts = lessonPlans.map(p => p.section ? getCohort(p.section) : '').filter(Boolean);
      const allKnownCohorts = Array.from(new Set(plansCohorts)).sort();

      allKnownCohorts.forEach(cohort => {
        grouped[cohort] = [];
      });
      grouped['Unassigned'] = [];

      lessonPlans.forEach(plan => {
        const cohort = plan.section ? getCohort(plan.section) : 'Unassigned';
        if (!grouped[cohort]) {
          grouped[cohort] = [];
        }
        
        const query = searchQuery.toLowerCase();
        const planCode = getLessonPlanCode(plan).toLowerCase();
        const matchesSearch = !query || 
          (plan.subject && plan.subject.toLowerCase().includes(query)) ||
          (plan.week && plan.week.toLowerCase().includes(query)) ||
          (plan.chapterUnit && plan.chapterUnit.toLowerCase().includes(query)) ||
          (plan.sectionLesson && plan.sectionLesson.toLowerCase().includes(query)) ||
          planCode.includes(query);

        if (matchesSearch) {
          grouped[cohort].push(plan);
        }
      });
    }

    // Remove Unassigned if empty
    if (grouped['Unassigned']?.length === 0) {
      delete grouped['Unassigned'];
    }

    // Remove empty groups if not grouping by section (custom folders only make sense for sections)
    if (groupBy !== 'section') {
      Object.keys(grouped).forEach(key => {
        if (grouped[key].length === 0) {
          delete grouped[key];
        }
      });
    }

    return grouped;
  }, [lessonPlans, topics, customFolders, hiddenFolders, searchQuery, groupBy]);

  const handleAddFolder = () => {
    const folderName = window.prompt("Enter new folder name:");
    if (folderName && folderName.trim()) {
      const name = folderName.trim();
      if (hiddenFolders.includes(name)) {
        setHiddenFolders(prev => prev.filter(f => f !== name));
      }
      const defaultSections = settings ? settings.sections : DEFAULT_SECTIONS;
      if (!customFolders.includes(name) && !defaultSections.includes(name)) {
        setCustomFolders(prev => [...prev, name]);
      }
    }
  };

  const handleDeleteFolder = async (folderName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const plansInFolder = lessonPlans.filter(p => p.section === folderName);
    
    const doDelete = async () => {
      if (plansInFolder.length > 0) {
        await Promise.all(plansInFolder.map(plan => onDeleteLessonPlan(plan.id)));
      }
      if (customFolders.includes(folderName)) {
        setCustomFolders(prev => prev.filter(f => f !== folderName));
      }
      if (!hiddenFolders.includes(folderName)) {
        setHiddenFolders(prev => [...prev, folderName]);
      }
      if (selectedSection === folderName) {
        setSelectedSection(null);
      }
    };

    if (plansInFolder.length > 0) {
      setConfirmModal({
        isOpen: true,
        title: 'Delete Folder',
        message: `Are you sure you want to delete the folder "${folderName}" and all ${plansInFolder.length} lesson plans inside it?`,
        onConfirm: doDelete
      });
    } else {
      setConfirmModal({
        isOpen: true,
        title: 'Delete Folder',
        message: `Are you sure you want to delete the folder "${folderName}"?`,
        onConfirm: doDelete
      });
    }
  };

  const handleCreateNew = () => {
    const defaultTeacher = settings?.teacherName || (uniqueTeachers.length > 0 ? uniqueTeachers[0] : '');
    
    // Auto-fill fields based on the most recent lesson plan in the selected section
    let defaultSubject = '';
    let defaultChapterUnit = '';
    let defaultWeek = '';
    let defaultQuarter: string | undefined = undefined;
    let defaultClassesPerWeek = 5;
    let defaultActivities: any = {
      monday: null,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
    };

    if (selectedSection && selectedSection !== 'Unassigned') {
      const sectionPlans = lessonPlans
        .filter(p => p.section === selectedSection)
        .sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA; // Sort descending by date
        });

      if (sectionPlans.length > 0) {
        const lastPlan = sectionPlans[0];
        defaultSubject = lastPlan.subject || '';
        defaultChapterUnit = lastPlan.chapterUnit || '';
        defaultQuarter = lastPlan.quarter;
        defaultClassesPerWeek = lastPlan.classesPerWeek || 5;
        
        // Pre-fill active days based on the last plan
        if (lastPlan.activities) {
          DAYS.forEach(day => {
            if (lastPlan.activities[day] !== null) {
              defaultActivities[day] = { warmUp: '', development: '', wrapUp: '', hw: '' };
            }
          });
        }
        
        // Try to increment the week automatically
        if (lastPlan.week) {
          const weekMatch = lastPlan.week.match(/(\d+)/);
          if (weekMatch) {
            const currentWeekNum = parseInt(weekMatch[1], 10);
            defaultWeek = lastPlan.week.replace(currentWeekNum.toString(), (currentWeekNum + 1).toString());
          } else {
            defaultWeek = lastPlan.week;
          }
        }
      }
    }

    setCurrentPlan({
      id: `LP_${Date.now()}`,
      teacher: defaultTeacher,
      section: selectedSection && selectedSection !== 'Unassigned' ? selectedSection : '',
      date: new Date().toISOString().split('T')[0],
      subject: defaultSubject,
      week: defaultWeek,
      quarter: defaultQuarter,
      classTime: '45 minutes',
      classesPerWeek: defaultClassesPerWeek,
      chapterUnit: defaultChapterUnit,
      sectionLesson: '',
      standards: '',
      activities: defaultActivities,
      period: activePeriod
    });
    setIsEditing(true);
  };

  const handleEdit = (plan: LessonPlan) => {
    setCurrentPlan(plan);
    setCustomInputs({});
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (currentPlan && currentPlan.id) {
      await onSaveLessonPlan(currentPlan as LessonPlan);
      setIsEditing(false);
      setCurrentPlan(null);
    }
  };

  const handleGenerateAI = async () => {
    if (!currentPlan?.chapterUnit || !currentPlan?.classesPerWeek) {
      alert("Please fill in Chapter/Unit and Classes per Week before generating.");
      return;
    }

    const activeDays = DAYS.filter(day => currentPlan.activities?.[day] !== null);
    if (activeDays.length === 0) {
      alert("Please select at least one day with 'Has Class' checked.");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress('Starting AI generation...');
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
      
      const ai = new GoogleGenAI({ apiKey });

      const fetchAi = async (promptMsg: string, schema: any) => {
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          let timeoutId: NodeJS.Timeout;
          try {
            const apiPromise = ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: promptMsg,
              config: {
                responseMimeType: 'application/json',
                responseSchema: schema
              }
            });
            
            const timeoutPromise = new Promise((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error("Request timed out.")), 60000);
            });

            const response = await Promise.race([apiPromise, timeoutPromise]) as any;
            clearTimeout(timeoutId!);
            if (response.text) return JSON.parse(response.text);
            throw new Error("Empty response");
          } catch (err: any) {
            if (timeoutId!) clearTimeout(timeoutId);
            const isTransient = err?.message?.includes("503") || err?.status === 'UNAVAILABLE' || err?.message?.includes("429") || err?.message?.includes("timed out");
            if (isTransient) {
              if (attempt === maxRetries) throw err;
              setGenerationProgress(prev => `${prev} (Retrying due to high demand...)`);
              await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
            } else {
              throw err;
            }
          }
        }
      };

      setGenerationProgress('Generating Standards & Suggestions...');
      
      const metaPrompt = `You are an expert educational assistant. Your task is to provide standards and teaching suggestions for a lesson plan.
      Teacher: ${currentPlan.teacher || 'Not specified'}
      Section: ${currentPlan.section || 'Not specified'}
      Subject: ${currentPlan.subject || 'Not specified'}
      Chapter/Unit: ${currentPlan.chapterUnit}
      Section/Lesson: ${currentPlan.sectionLesson || 'Not specified'}
      Current Standards: ${currentPlan.standards || 'Not specified'}

      1. If the "Current Standards" are empty or "Not specified", research and generate appropriate Common Core or Next Generation Standards.
      2. Provide 'teachingSuggestions' with strategies, methodologies, and resources.
      `;

      const metaSchema = {
          type: Type.OBJECT,
          properties: {
             standards: { type: Type.STRING },
             teachingSuggestions: { type: Type.STRING }
          }
      };

      const metaResult = await fetchAi(metaPrompt, metaSchema);
      setCurrentPlan(prev => prev ? ({
          ...prev, 
          standards: metaResult.standards || prev.standards, 
          teachingSuggestions: metaResult.teachingSuggestions || prev.teachingSuggestions
      }) : prev);

      for (const day of activeDays) {
          setGenerationProgress(`Generating activities for ${day.charAt(0).toUpperCase() + day.slice(1)}...`);
          
          const act = currentPlan.activities?.[day];
          const dayNotes = act && (act.warmUp || act.development || act.wrapUp || act.hw) ? `Teacher's existing notes for ${day.toUpperCase()}:\nWarm Up: ${act.warmUp || 'Empty'}\nDevelopment: ${act.development || 'Empty'}\nWrap Up: ${act.wrapUp || 'Empty'}\nHomework: ${act.hw || 'Empty'}` : `No existing notes for ${day.toUpperCase()}.`;
          
          const dayPrompt = `You are an expert educational assistant completing a weekly lesson plan.
          Subject: ${currentPlan.subject || 'Not specified'}
          Chapter/Unit: ${currentPlan.chapterUnit}
          Section/Lesson: ${currentPlan.sectionLesson || 'Not specified'}
          Standards: ${metaResult.standards || currentPlan.standards || 'Not specified'}
          
          ${dayNotes}

          1. EXPAND on the teacher's notes, make it professional, and fill in Warm Up, Development, Wrap Up, and Homework for ${day.toUpperCase()}.
          2. If a field is well-written, improve phrasing but keep the core idea.
          3. If the existing notes are empty, generate a full engaging lesson that fits the Chapter/Unit and Standards.
          `;

          const daySchema = {
              type: Type.OBJECT,
              properties: {
                  warmUp: { type: Type.STRING },
                  development: { type: Type.STRING },
                  wrapUp: { type: Type.STRING },
                  hw: { type: Type.STRING }
              }
          };

          const dayResult = await fetchAi(dayPrompt, daySchema);

          setCurrentPlan(prev => {
             if (!prev) return prev;
             return {
                 ...prev,
                 activities: {
                     ...(prev.activities as LessonPlan['activities']),
                     [day]: dayResult
                 } as LessonPlan['activities']
             };
          });
      }

      setGenerationProgress('Completed successfully!');
      setTimeout(() => setGenerationProgress(''), 3000);
    } catch (error: any) {
      console.error("Error generating lesson plan:", error);
      alert(`Failed to generate lesson plan after multiple retries: ${error.message || "Unknown error"}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const processImportedFile = async (arrayBuffer: ArrayBuffer, fileName: string, mimeType: string) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
    
    const ai = new GoogleGenAI({ apiKey });
    let prompt = `Extract the lesson plan details from the provided document and format it into the requested JSON structure.
    If some fields are missing, try to infer them or leave them empty.
    Ensure the activities are mapped to the correct days (monday, tuesday, wednesday, thursday, friday).
    Each day's activity must have: warmUp, development, wrapUp, and hw (homework). If a day has no class, return null for that day.
    `;

    let contents: any;

    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      const base64 = btoa(
        new Uint8Array(arrayBuffer)
          .reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      contents = {
        parts: [
          { inlineData: { data: base64, mimeType: 'application/pdf' } },
          { text: prompt }
        ]
      };
    } else if (fileName.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ arrayBuffer });
      contents = {
        parts: [
          { text: `Document content:\n${result.value}\n\n${prompt}` }
        ]
      };
    } else {
      throw new Error("Unsupported file format. Please upload a PDF or DOCX file.");
    }

    let maxRetries = 3;
    let response: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let timeoutId: NodeJS.Timeout;
      try {
        const apiPromise = ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                teacher: { type: Type.STRING },
                section: { type: Type.STRING },
                subject: { type: Type.STRING },
                chapterUnit: { type: Type.STRING },
                sectionLesson: { type: Type.STRING },
                standards: { type: Type.STRING },
                teachingSuggestions: { type: Type.STRING },
                classTime: { type: Type.STRING },
                classesPerWeek: { type: Type.INTEGER },
                week: { type: Type.STRING },
                monday: { type: Type.OBJECT, nullable: true, properties: { warmUp: { type: Type.STRING }, development: { type: Type.STRING }, wrapUp: { type: Type.STRING }, hw: { type: Type.STRING } } },
                tuesday: { type: Type.OBJECT, nullable: true, properties: { warmUp: { type: Type.STRING }, development: { type: Type.STRING }, wrapUp: { type: Type.STRING }, hw: { type: Type.STRING } } },
                wednesday: { type: Type.OBJECT, nullable: true, properties: { warmUp: { type: Type.STRING }, development: { type: Type.STRING }, wrapUp: { type: Type.STRING }, hw: { type: Type.STRING } } },
                thursday: { type: Type.OBJECT, nullable: true, properties: { warmUp: { type: Type.STRING }, development: { type: Type.STRING }, wrapUp: { type: Type.STRING }, hw: { type: Type.STRING } } },
                friday: { type: Type.OBJECT, nullable: true, properties: { warmUp: { type: Type.STRING }, development: { type: Type.STRING }, wrapUp: { type: Type.STRING }, hw: { type: Type.STRING } } },
              }
            }
          }
        });

        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Request timed out. The AI is taking longer than expected. Please try again.")), 180000);
        });

        response = await Promise.race([apiPromise, timeoutPromise]) as any;
        clearTimeout(timeoutId!);
        break; // break the retry loop if successful
      } catch (err: any) {
        if (timeoutId!) clearTimeout(timeoutId);
        const isTransient = err?.message?.includes("503") || err?.status === 'UNAVAILABLE' || err?.message?.includes("429") || err?.message?.includes("timed out");
        if (isTransient) {
          if (attempt === maxRetries) throw err;
          await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
        } else {
          throw err;
        }
      }
    }

    const resultText = response.text;
    if (resultText) {
      const data = JSON.parse(resultText);
      setCurrentPlan({
        id: `LP_${Date.now()}`,
        teacher: data.teacher || '',
        section: data.section || selectedSection || '',
        date: new Date().toISOString().split('T')[0],
        subject: data.subject || '',
        week: data.week || '',
        classTime: data.classTime || '45 minutes',
        classesPerWeek: data.classesPerWeek || 5,
        chapterUnit: data.chapterUnit || '',
        sectionLesson: data.sectionLesson || '',
        standards: data.standards || '',
        teachingSuggestions: data.teachingSuggestions || '',
        activities: {
          monday: data.monday || null,
          tuesday: data.tuesday || null,
          wednesday: data.wednesday || null,
          thursday: data.thursday || null,
          friday: data.friday || null,
        },
        period: activePeriod
      });
      setIsEditing(true);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      await processImportedFile(arrayBuffer, file.name, file.type);
    } catch (error: any) {
      console.error("Error importing lesson plan:", error);
      alert(`Failed to import lesson plan: ${error.message || "Unknown error"}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDriveImport = () => {
    const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
    const developerKey = process.env.VITE_GOOGLE_API_KEY;

    if (!clientId || !developerKey) {
      alert("Google Drive API credentials are not configured. Please add VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_API_KEY to your .env file.");
      return;
    }

    openPicker({
      clientId,
      developerKey,
      viewId: "DOCS",
      showUploadView: true,
      showUploadFolders: true,
      supportDrives: true,
      multiselect: false,
      callbackFunction: async (data) => {
        if (data.action === 'picked') {
          const file = data.docs[0];
          const fileId = file.id;
          const oauthToken = authResponseRef.current?.access_token || (data as any).oauthToken;
          
          if (!oauthToken) {
            alert("Failed to get Google Drive authentication token.");
            return;
          }

          setIsImporting(true);
          try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
              headers: {
                Authorization: `Bearer ${oauthToken}`,
              },
            });

            if (!response.ok) {
              throw new Error("Failed to download file from Google Drive");
            }

            const arrayBuffer = await response.arrayBuffer();
            await processImportedFile(arrayBuffer, file.name, file.mimeType);

          } catch (error: any) {
            console.error("Error importing from Google Drive:", error);
            alert(`Failed to import from Google Drive: ${error.message || "Unknown error"}`);
          } finally {
            setIsImporting(false);
          }
        }
      },
    });
  };

  const handleCopy = async () => {
    if (!planToCopy || selectedFoldersToCopy.length === 0) return;

    try {
      await Promise.all(selectedFoldersToCopy.map(async (folder) => {
        const newPlan: LessonPlan = {
          ...planToCopy,
          id: `LP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          section: folder
        };
        await onSaveLessonPlan(newPlan);
      }));
      
      setIsCopyModalOpen(false);
      setPlanToCopy(null);
      setSelectedFoldersToCopy([]);
      alert(`Successfully copied lesson plan to ${selectedFoldersToCopy.length} folder(s).`);
    } catch (error) {
      console.error("Error copying lesson plan:", error);
      alert("Failed to copy lesson plan.");
    }
  };

  const handlePrint = (plan: LessonPlan) => {
    const doc = new jsPDF();
    
    const headerBody: any[] = [
      [
        `Teacher: ${plan.teacher}\nSection: ${plan.section}\nCode: ${getLessonPlanCode(plan)}\nDate: ${plan.date}\nSubject: ${plan.subject}\nWeek: ${plan.week}\nClass time: ${plan.classTime}\nClasses per Week: ${plan.classesPerWeek}`,
        `CHAPTER/UNIT:\n${plan.chapterUnit}\n\nSECTION/LESSON:\n${plan.sectionLesson}`
      ],
      [{ content: `STANDARDS FOR THIS WEEK\n1. ${plan.standards}`, colSpan: 2 }]
    ];

    if (plan.teachingSuggestions) {
      headerBody.push([{ content: `LESSON INSIGHTS\n${plan.teachingSuggestions}`, colSpan: 2 }]);
    }

    // Header Table
    autoTable(doc, {
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1 },
      head: [[{ content: 'THE UNIT CONTINUES', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fontSize: 12 } }]],
      body: headerBody,
      margin: { top: 20 }
    });

    // Activities Table
    const activitiesBody: any[] = [];
    
    DAYS.forEach(day => {
      activitiesBody.push([{ content: day.toUpperCase(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
      const activity = plan.activities[day];
      if (activity) {
        activitiesBody.push([
          `Warm up: ${activity.warmUp}\nDevelopment: ${activity.development}\nWrap up: ${activity.wrapUp}\nHW: ${activity.hw}`
        ]);
      } else {
        activitiesBody.push(['No class']);
      }
    });

    autoTable(doc, {
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.1 },
      head: [[{ content: 'ACTIVITIES', styles: { halign: 'center', fontStyle: 'bold' } }]],
      body: activitiesBody,
      startY: (doc as any).lastAutoTable.finalY + 5
    });

    const planCode = getLessonPlanCode(plan);
    doc.save(`${planCode} [${plan.week}] ${plan.section}.pdf`);
  };

  if (isEditing && currentPlan) {
    const uniqueChapterUnits = Array.from(new Set(
      lessonPlans
        .filter(p => p.section === currentPlan.section && p.chapterUnit)
        .map(p => p.chapterUnit)
    )).sort();

    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/60 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-white/50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsEditing(false)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              title="Back to Lesson Planner"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-2xl font-bold text-indigo-950">Edit Lesson Plan</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => handlePrint(currentPlan as LessonPlan)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors font-medium shadow-sm"
              title="Download PDF"
            >
              <Printer size={18} /> <span className="hidden sm:inline">PDF</span>
            </button>
            <button
              onClick={handleGenerateAI}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:opacity-90 transition-opacity font-medium shadow-sm disabled:opacity-50 whitespace-nowrap"
            >
              {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              <span className="hidden sm:inline">{isGenerating ? 'Generating...' : 'Generate AI'}</span>
            </button>
            {generationProgress && (
              <span className="text-sm font-medium text-indigo-600 animate-pulse hidden md:inline-block max-w-[200px] truncate" title={generationProgress}>
                {generationProgress}
              </span>
            )}
            <div className="h-6 w-px bg-slate-200 hidden md:block mx-1"></div>
            {isAutosaving && (
              <span className="text-sm font-medium text-slate-400 flex items-center gap-1.5 mx-2">
                <Loader2 size={14} className="animate-spin" /> Saving...
              </span>
            )}
            {currentPlan.id && (
              <button
                onClick={() => {
                  setConfirmModal({
                    isOpen: true,
                    title: 'Delete Lesson Plan',
                    message: 'Are you sure you want to delete this lesson plan?',
                    onConfirm: async () => {
                      await onDeleteLessonPlan(currentPlan.id!);
                      setIsEditing(false);
                    }
                  });
                }}
                className="flex items-center justify-center p-2.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors border border-rose-200 bg-white shadow-sm"
                title="Delete Lesson Plan"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm ml-1"
            >
              <Save size={18} /> Save & Close
            </button>
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-white/50">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Column 1: Basic Info */}
            <div className="space-y-4">
              <h3 className="font-bold text-indigo-900 border-b border-indigo-100 pb-2 mb-4">Basic Info</h3>
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Teacher</label>
                {customInputs.teacher ? (
                  <div className="flex gap-2">
                    <DebouncedInput value={currentPlan.teacher || ''} onChange={val => setCurrentPlan({...currentPlan, teacher: val})} className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Enter teacher name" />
                    <button onClick={() => setCustomInputs(prev => ({...prev, teacher: false}))} className="px-3 py-2 text-slate-500 hover:text-slate-700">✕</button>
                  </div>
                ) : (
                  <select 
                    value={currentPlan.teacher || ''} 
                    onChange={e => {
                      if (e.target.value === 'NEW') {
                        setCustomInputs(prev => ({...prev, teacher: true}));
                        setCurrentPlan(prev => ({...(prev || {}), teacher: ''}));
                      } else {
                        setCurrentPlan(prev => ({...(prev || {}), teacher: e.target.value}));
                      }
                    }} 
                    className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select Teacher</option>
                    {Array.from(new Set([...uniqueTeachers, currentPlan.teacher].filter(Boolean))).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    <option disabled>──────────</option>
                    <option value="NEW">+ Add another</option>
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Section</label>
                {customInputs.section ? (
                  <div className="flex gap-2">
                    <DebouncedInput value={currentPlan.section || ''} onChange={val => setCurrentPlan({...currentPlan, section: val})} className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Enter section" />
                    <button onClick={() => setCustomInputs(prev => ({...prev, section: false}))} className="px-3 py-2 text-slate-500 hover:text-slate-700">✕</button>
                  </div>
                ) : (
                  <select 
                    value={currentPlan.section || ''} 
                    onChange={e => {
                      if (e.target.value === 'NEW') {
                        setCustomInputs(prev => ({...prev, section: true}));
                        setCurrentPlan(prev => ({...(prev || {}), section: ''}));
                      } else {
                        setCurrentPlan(prev => ({...(prev || {}), section: e.target.value}));
                      }
                    }} 
                    className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select Section</option>
                    {Array.from(new Set([...(settings ? settings.sections : DEFAULT_SECTIONS), ...topics.map(t => t.section), currentPlan.section].filter(Boolean))).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                    <option disabled>──────────</option>
                    <option value="NEW">+ Add Custom</option>
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Date</label>
                <input type="date" value={currentPlan.date || ''} onChange={e => setCurrentPlan({...currentPlan, date: e.target.value})} className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Quarter</label>
                <select value={currentPlan.quarter || ''} onChange={e => setCurrentPlan({...currentPlan, quarter: e.target.value})} className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select Quarter</option>
                  <option value="Q1">Q1</option>
                  <option value="Q2">Q2</option>
                  <option value="Q3">Q3</option>
                  <option value="Q4">Q4</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Week</label>
                <DebouncedInput value={currentPlan.week || ''} onChange={val => setCurrentPlan({...currentPlan, week: val})} className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            {/* Column 2: Subject & Content */}
            <div className="space-y-4">
              <h3 className="font-bold text-indigo-900 border-b border-indigo-100 pb-2 mb-4">Subject & Content</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-indigo-950 mb-1">Subject</label>
                  <DebouncedInput value={currentPlan.subject || ''} onChange={val => setCurrentPlan({...currentPlan, subject: val})} className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-indigo-950 mb-1">Subject Initial</label>
                  <DebouncedInput maxLength={2} value={currentPlan.subjectInitial || ''} onChange={val => setCurrentPlan({...currentPlan, subjectInitial: (val as string).toUpperCase()})} className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Auto" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Chapter/Unit</label>
                <input 
                  type="text" 
                  list="chapter-units"
                  value={currentPlan.chapterUnit || ''} 
                  onChange={e => setCurrentPlan({...currentPlan, chapterUnit: e.target.value})} 
                  className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                />
                <datalist id="chapter-units">
                  {uniqueChapterUnits.map(unit => (
                    <option key={unit} value={unit} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Section/Lesson</label>
                {customInputs.sectionLesson ? (
                  <div className="flex gap-2">
                    <DebouncedInput value={currentPlan.sectionLesson || ''} onChange={val => setCurrentPlan({...currentPlan, sectionLesson: val})} className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Enter topic/lesson" />
                    <button onClick={() => setCustomInputs(prev => ({...prev, sectionLesson: false}))} className="px-3 py-2 text-slate-500 hover:text-slate-700">✕</button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <select 
                      value={currentPlan.sectionLesson || ''} 
                      onChange={e => {
                        if (e.target.value === 'NEW') {
                          setCustomInputs(prev => ({...prev, sectionLesson: true}));
                          setCurrentPlan(prev => ({...(prev || {}), sectionLesson: ''}));
                        } else {
                          setCurrentPlan(prev => ({...(prev || {}), sectionLesson: e.target.value}));
                        }
                      }} 
                      className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select Topic/Lesson</option>
                      {Array.from(new Set([...topics.filter(t => !currentPlan.section || t.section === currentPlan.section).map(t => t.title), currentPlan.sectionLesson].filter(Boolean))).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                      <option disabled>──────────</option>
                      <option value="NEW">+ Add Custom</option>
                    </select>
                    {onDeleteTopic && currentPlan.sectionLesson && currentPlan.section && topics.find(t => t.title === currentPlan.sectionLesson && t.section === currentPlan.section) && (
                      <button
                        onClick={() => {
                          const matchingTopic = topics.find(t => t.title === currentPlan.sectionLesson && t.section === currentPlan.section);
                          if (matchingTopic) {
                            setConfirmModal({
                              isOpen: true,
                              title: 'Remove Topic',
                              message: 'Are you sure you want to permanently delete this topic from the Section? All its sessions and grades will be lost forever.',
                              onConfirm: async () => {
                                await onDeleteTopic(matchingTopic.id);
                                setCurrentPlan({...currentPlan, sectionLesson: ''});
                              }
                            });
                          }
                        }}
                        className="shrink-0 p-2 text-rose-400 hover:text-white hover:bg-rose-500 rounded-lg transition-all border border-transparent hover:border-rose-600 shadow-sm"
                        title="Remove Topic"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Column 3: Schedule & Standards */}
            <div className="space-y-4">
              <h3 className="font-bold text-indigo-900 border-b border-indigo-100 pb-2 mb-4">Schedule & Standards</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-indigo-950 mb-1">Class Time</label>
                  {customInputs.classTime ? (
                    <div className="flex gap-2">
                      <DebouncedInput value={currentPlan.classTime || ''} onChange={val => setCurrentPlan({...currentPlan, classTime: val})} className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Enter class time" />
                      <button onClick={() => setCustomInputs(prev => ({...prev, classTime: false}))} className="px-3 py-2 text-slate-500 hover:text-slate-700">✕</button>
                    </div>
                  ) : (
                    <select 
                      value={currentPlan.classTime || ''} 
                      onChange={e => {
                        if (e.target.value === 'NEW') {
                          setCustomInputs(prev => ({...prev, classTime: true}));
                          setCurrentPlan(prev => ({...(prev || {}), classTime: ''}));
                        } else {
                          setCurrentPlan(prev => ({...(prev || {}), classTime: e.target.value}));
                        }
                      }} 
                      className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select Class Time</option>
                      {Array.from(new Set(['45 minutes', '60 minutes', '90 minutes', currentPlan.classTime].filter(Boolean))).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                      <option disabled>──────────</option>
                      <option value="NEW">+ Add Custom</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-indigo-950 mb-1">Classes/Week</label>
                  <input type="number" min="1" max="5" value={currentPlan.classesPerWeek || 5} onChange={e => setCurrentPlan({...currentPlan, classesPerWeek: parseInt(e.target.value)})} className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-indigo-950 mb-1">Standards for this week</label>
                <DebouncedTextarea value={currentPlan.standards || ''} onChange={val => setCurrentPlan({...currentPlan, standards: val})} rows={6} className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>
              {currentPlan.teachingSuggestions && (
                <div>
                  <label className="block text-sm font-medium text-indigo-950 mb-1 flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-500" />
                    Lesson Insights
                  </label>
                  <DebouncedTextarea value={currentPlan.teachingSuggestions || ''} onChange={val => setCurrentPlan({...currentPlan, teachingSuggestions: val})} rows={4} className="w-full px-4 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Strategies, methodologies, resources, or ideas for teaching..." />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-bold text-indigo-950">Activities</h3>
          {DAYS.map(day => {
            const activity = currentPlan.activities?.[day];
            const hasClass = activity !== null;
            
            return (
              <div key={day} className="bg-white/60 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-white/50">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-lg font-bold text-indigo-900 capitalize">{day}</h4>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                    <input 
                      type="checkbox" 
                      checked={hasClass}
                      onChange={(e) => {
                        setCurrentPlan(prev => {
                          if (!prev) return prev;
                          const newActivities = {
                            ...prev.activities,
                            [day]: e.target.checked ? { warmUp: '', development: '', wrapUp: '', hw: '' } : null
                          };
                          const newClassesPerWeek = Object.values(newActivities).filter(a => a !== null).length;
                          return {
                            ...prev,
                            activities: newActivities,
                            classesPerWeek: newClassesPerWeek
                          };
                        });
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    Has Class
                  </label>
                </div>
                
                {hasClass ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">Warm up</label>
                      <DebouncedTextarea value={activity.warmUp} onChange={val => setCurrentPlan(prev => ({...prev!, activities: {...prev!.activities!, [day]: {...activity, warmUp: val}}}))} rows={2} className="w-full px-3 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">Development</label>
                      <DebouncedTextarea value={activity.development} onChange={val => setCurrentPlan(prev => ({...prev!, activities: {...prev!.activities!, [day]: {...activity, development: val}}}))} rows={2} className="w-full px-3 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">Wrap up</label>
                      <DebouncedTextarea value={activity.wrapUp} onChange={val => setCurrentPlan(prev => ({...prev!, activities: {...prev!.activities!, [day]: {...activity, wrapUp: val}}}))} rows={2} className="w-full px-3 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">HW</label>
                      <DebouncedTextarea value={activity.hw} onChange={val => setCurrentPlan(prev => ({...prev!, activities: {...prev!.activities!, [day]: {...activity, hw: val}}}))} rows={2} className="w-full px-3 py-2 border border-white/50 bg-white/50 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm" />
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400 italic text-sm py-4 text-center bg-white/30 rounded-lg">No class scheduled for this day.</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-indigo-950 tracking-tight">Lesson Planner</h2>
          <p className="text-slate-500 mt-1">
            {selectedSection ? `Managing plans for ${selectedSection}` : 'Manage and generate your weekly lesson plans.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <input 
            type="file" 
            accept=".pdf,.docx" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleImport} 
          />
          
          <div className="relative import-dropdown">
            <button
              onClick={() => setIsImportMenuOpen(!isImportMenuOpen)}
              disabled={isImporting}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors font-medium shadow-sm disabled:opacity-50"
            >
              {isImporting ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
              Import <ChevronDown size={16} />
            </button>
            
            {isImportMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-10">
                <button 
                  onClick={() => { handleDriveImport(); setIsImportMenuOpen(false); }} 
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3 text-slate-700 font-medium transition-colors"
                >
                  <Cloud size={18} className="text-indigo-500" /> Google Drive
                </button>
                <button 
                  onClick={() => { fileInputRef.current?.click(); setIsImportMenuOpen(false); }} 
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3 text-slate-700 font-medium transition-colors"
                >
                  <FileText size={18} className="text-indigo-500" /> Local File
                </button>
              </div>
            )}
          </div>

          {!selectedSection && (
            <button
              onClick={handleAddFolder}
              className="flex items-center justify-center w-11 h-11 bg-white text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors shadow-sm"
              title="New Folder"
            >
              <FolderPlus size={20} />
            </button>
          )}
          {!selectedSection && (
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center w-11 h-11 bg-white text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors shadow-sm"
              title="Settings"
            >
              <Settings size={20} />
            </button>
          )}
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm shadow-indigo-200"
          >
            <Plus size={20} /> New Plan
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-indigo-950">Default Subject Initials</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
              <p className="text-sm text-slate-500 mb-4">
                Set default initials for your subjects. These will be used automatically when generating lesson plan codes.
              </p>
              {Object.entries(subjectInitialsMap).map(([subject, initial]) => (
                <div key={subject} className="flex gap-4 items-center">
                  <input 
                    type="text" 
                    value={subject} 
                    readOnly 
                    className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium" 
                  />
                  <input 
                    type="text" 
                    maxLength={2} 
                    value={initial} 
                    onChange={(e) => {
                      const newMap = { ...subjectInitialsMap };
                      newMap[subject] = e.target.value.toUpperCase();
                      setSubjectInitialsMap(newMap);
                    }} 
                    className="w-20 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 text-center uppercase" 
                  />
                  <button 
                    onClick={() => {
                      const newMap = { ...subjectInitialsMap };
                      delete newMap[subject];
                      setSubjectInitialsMap(newMap);
                    }}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-sm font-bold text-indigo-900 mb-2">Add New Subject</h4>
                <div className="flex gap-4 items-center">
                  <input 
                    type="text" 
                    id="newSubjectName"
                    placeholder="Subject Name"
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                  />
                  <input 
                    type="text" 
                    id="newSubjectInitial"
                    maxLength={2} 
                    placeholder="Initial"
                    className="w-20 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 text-center uppercase" 
                  />
                  <button 
                    onClick={() => {
                      const nameInput = document.getElementById('newSubjectName') as HTMLInputElement;
                      const initialInput = document.getElementById('newSubjectInitial') as HTMLInputElement;
                      if (nameInput.value && initialInput.value) {
                        setSubjectInitialsMap({
                          ...subjectInitialsMap,
                          [nameInput.value]: initialInput.value.toUpperCase()
                        });
                        nameInput.value = '';
                        initialInput.value = '';
                      }
                    }}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar & Grouping */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search by subject, week, chapter, or plan code (e.g. LAXX240301)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white/60 backdrop-blur-md border border-white/50 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-indigo-950 placeholder-slate-400"
          />
        </div>
        {!selectedSection && (
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
            className="w-full sm:w-auto px-4 py-3 bg-white/60 backdrop-blur-md border border-white/50 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-indigo-950 font-medium cursor-pointer"
          >
            <option value="section">Group by Section</option>
            <option value="subject">Group by Subject</option>
            <option value="cohort">Group by Cohort</option>
          </select>
        )}
      </div>

      {!selectedSection ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(sectionsWithPlans).map(([sectionName, plans]) => (
            <div 
              key={sectionName} 
              onClick={() => setSelectedSection(sectionName)}
              className="bg-white/70 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-white/50 hover:shadow-md transition-all cursor-pointer group hover:bg-white/90 relative"
            >
              <button 
                onClick={(e) => handleDeleteFolder(sectionName, e)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                title="Delete Folder"
              >
                <Trash2 size={18} />
              </button>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                  <span className="text-indigo-600 font-bold text-xl tracking-wider">
                    {getFolderInitial(sectionName)}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-indigo-950">{sectionName}</h3>
                  <p className="text-sm text-slate-500">{plans.length} Lesson Plan{plans.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full rounded-full" 
                  style={{ width: `${Math.min(plans.length * 10, 100)}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <button 
            onClick={() => setSelectedSection(null)}
            className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors font-medium"
          >
            <ArrowLeft size={18} /> Back to Folders
          </button>

          {!sectionsWithPlans[selectedSection] || sectionsWithPlans[selectedSection].length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white/40 backdrop-blur-sm rounded-3xl border border-white/50 shadow-sm">
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                <FileText size={32} className="text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-indigo-950 mb-2">No lesson plans for {selectedSection}</h3>
              <p className="text-slate-500 text-center max-w-md mb-6">
                Create your first weekly lesson plan for this section manually or use AI to generate one instantly.
              </p>
              <div className="flex flex-wrap gap-3 w-full md:w-auto">
                <div className="relative import-dropdown">
                  <button
                    onClick={() => setIsImportMenuOpen(!isImportMenuOpen)}
                    disabled={isImporting}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors font-medium shadow-sm disabled:opacity-50"
                  >
                    {isImporting ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                    Import <ChevronDown size={16} />
                  </button>
                  
                  {isImportMenuOpen && (
                    <div className="absolute left-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-10">
                      <button 
                        onClick={() => { handleDriveImport(); setIsImportMenuOpen(false); }} 
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3 text-slate-700 font-medium transition-colors"
                      >
                        <Cloud size={18} className="text-indigo-500" /> Google Drive
                      </button>
                      <button 
                        onClick={() => { fileInputRef.current?.click(); setIsImportMenuOpen(false); }} 
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3 text-slate-700 font-medium transition-colors"
                      >
                        <FileText size={18} className="text-indigo-500" /> Local File
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleCreateNew}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white border border-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm"
                >
                  <Plus size={20} /> Create Lesson Plan
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {(() => {
                const baseQuarters = settings?.gradingPeriods?.length ? settings.gradingPeriods : ['Q1', 'Q2', 'Q3', 'Q4'];
                const dynamicQuarters = Array.from(new Set((sectionsWithPlans[selectedSection] || []).map(p => p.quarter || 'Unassigned Quarter')));
                const quartersToUse = Array.from(new Set([...baseQuarters, ...dynamicQuarters])).sort((a, b) => {
                  if (a === 'Unassigned Quarter') return 1;
                  if (b === 'Unassigned Quarter') return -1;
                  return a.localeCompare(b);
                });

                return quartersToUse.map(quarter => {
                  const plansInQuarter = (sectionsWithPlans[selectedSection] || []).filter(p => 
                    (quarter === 'Unassigned Quarter' && !p.quarter) || p.quarter === quarter
                  ).sort((a, b) => {
                    const weekA = a.week || '';
                    const weekB = b.week || '';
                    
                    // Fallback to date sorting if weeks are identical or both empty
                    if (weekA === weekB) {
                      const dateA = a.date ? new Date(a.date).getTime() : 0;
                      const dateB = b.date ? new Date(b.date).getTime() : 0;
                      return dateA - dateB; // Ascending by date as fallback
                    }

                    return weekA.localeCompare(weekB, undefined, { numeric: true, sensitivity: 'base' });
                  });

                  return (
                    <div key={quarter} className="space-y-4 mb-8">
                      <h3 className="text-xl font-bold text-indigo-950 border-b border-indigo-100 pb-2">{quarter}</h3>
                      {plansInQuarter.length === 0 ? (
                        <div className="flex items-center justify-center p-8 border-2 border-dashed border-indigo-100 rounded-2xl bg-white/30 text-indigo-400">
                          <p className="text-sm font-medium">No lesson plans for {quarter}</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {plansInQuarter.map(plan => (
                            <div 
                            key={plan.id} 
                          onClick={() => handleEdit(plan)}
                          className="bg-white/70 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-white/50 hover:shadow-md transition-shadow group relative overflow-hidden cursor-pointer flex flex-col h-full"
                        >
                          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-md">
                                  {getLessonPlanCode(plan)}
                                </span>
                                {plan.date && (
                                  <span className="text-xs text-slate-500 font-medium">
                                    {new Date(plan.date).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              <h3 className="text-lg font-bold text-indigo-950 line-clamp-1">{plan.subject || 'Untitled Subject'}</h3>
                              <p className="text-sm text-slate-500 font-medium">Week: {plan.week || 'N/A'}</p>
                            </div>
                          </div>
                          
                          <div className="space-y-2 text-sm text-slate-600 flex-grow">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Section:</span>
                              <span className="font-medium text-slate-800">{plan.section || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Code:</span>
                              <span className="font-medium text-slate-800">{getLessonPlanCode(plan)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Unit:</span>
                              <span className="font-medium text-slate-800 line-clamp-1 text-right ml-4">{plan.chapterUnit || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Classes:</span>
                              <span className="font-medium text-slate-800">{plan.classesPerWeek || 0}/week</span>
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end gap-2">
                            <button onClick={(e) => { e.stopPropagation(); setPlanToCopy(plan); setIsCopyModalOpen(true); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Copy to">
                              <Copy size={18} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handlePrint(plan); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Print PDF">
                              <Printer size={18} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleEdit(plan); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit">
                              <Edit size={18} />
                            </button>
                            <button onClick={(e) => { 
                              e.stopPropagation();
                              setConfirmModal({
                                isOpen: true,
                                title: 'Delete Lesson Plan',
                                message: 'Are you sure you want to delete this lesson plan?',
                                onConfirm: () => onDeleteLessonPlan(plan.id)
                              });
                            }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
            </div>
          )}
        </div>
      )}

      {/* Copy Modal */}
      {isCopyModalOpen && planToCopy && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-indigo-950">Copy Lesson Plan</h3>
              <button 
                onClick={() => {
                  setIsCopyModalOpen(false);
                  setPlanToCopy(null);
                  setSelectedFoldersToCopy([]);
                }} 
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
              <p className="text-sm text-slate-500 mb-4">
                Select the folders (sections) where you want to copy this lesson plan. The section of the copied lesson plan will automatically be updated to match the target folder.
              </p>
              
              <div className="space-y-2">
                {Object.keys(sectionsWithPlans)
                  .filter(section => section !== planToCopy.section && section !== 'Unassigned')
                  .sort()
                  .map(section => (
                    <label key={section} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                      <input 
                        type="checkbox"
                        checked={selectedFoldersToCopy.includes(section)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedFoldersToCopy(prev => [...prev, section]);
                          } else {
                            setSelectedFoldersToCopy(prev => prev.filter(f => f !== section));
                          }
                        }}
                        className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-medium text-slate-700">{section}</span>
                    </label>
                  ))
                }
                
                {Object.keys(sectionsWithPlans).filter(section => section !== planToCopy.section && section !== 'Unassigned').length === 0 && (
                  <div className="text-center py-4 text-slate-500 italic">
                    No other folders available to copy to.
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setIsCopyModalOpen(false);
                  setPlanToCopy(null);
                  setSelectedFoldersToCopy([]);
                }}
                className="px-6 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={handleCopy}
                disabled={selectedFoldersToCopy.length === 0}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Copy to {selectedFoldersToCopy.length} Folder{selectedFoldersToCopy.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
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
