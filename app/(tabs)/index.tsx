import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet, Text, TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useColorScheme,
  View
} from 'react-native';

const BACKEND_URL = 'https://note-enhancer-backend.vercel.app/api/enhance';
const MAX_USES = 100;
const MAX_CHARS = 3000;

type SavedNote = {
  id: string; title: string; notes: string;
  summary: any; flashcards: any[]; quiz: any[];
  date: string; subject?: string;
};

type ChatMessage = { role: 'user' | 'assistant'; content: string; };
type SortMode = 'subject' | 'newest' | 'oldest';

const SUBJECTS = ['📚 General','🔬 Science','📐 Math','📖 History','💻 CS','🗣️ Language','➕ Other'];
const MATH_SUBJECTS = ['📐 Math', '🔬 Science'];

const LOADING_MESSAGES_EN = [
  ['📖 Reading your notes...', 'Hang tight, this takes a few seconds'],
  ['🧠 Analysing content...', 'Finding the key concepts'],
  ['✍️ Generating flashcards...', 'Making them short and simple'],
  ['📝 Building your quiz...', 'Almost there!'],
  ['⚡ Almost done...', 'Just a few more seconds!'],
];

const LOADING_MESSAGES_JA = [
  ['📖 ノートを読み込んでいます...', 'しばらくお待ちください'],
  ['🧠 内容を分析中...', 'キーワードを見つけています'],
  ['✍️ フラッシュカードを生成中...', 'シンプルにまとめています'],
  ['📝 クイズを作成中...', 'もう少しです！'],
  ['⚡ もうすぐ完了...', 'あと数秒です！'],
];

export default function App() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const t = {
    bg: isDark ? '#0F0F0F' : '#F7F7F5',
    surface: isDark ? '#1A1A1A' : '#FFFFFF',
    surfaceAlt: isDark ? '#222222' : '#F0F0ED',
    border: isDark ? '#2E2E2E' : '#E8E8E4',
    text: isDark ? '#F0F0ED' : '#1A1A1A',
    textSecondary: isDark ? '#AAAAAA' : '#4A4A4A',
    textMuted: isDark ? '#555555' : '#999999',
    accent: '#1D9E75',
    accentLight: isDark ? '#0D2E22' : '#E1F5EE',
    accentText: isDark ? '#4ECDA4' : '#0F6E56',
    danger: isDark ? '#E05555' : '#A32D2D',
    dangerLight: isDark ? '#2E1111' : '#FCEBEB',
    purple: isDark ? '#9F9BE8' : '#3C3489',
    purpleLight: isDark ? '#1E1C3A' : '#EEEDFE',
    amber: isDark ? '#F0B429' : '#E5A020',
    amberLight: isDark ? '#2D2000' : '#FAEEDA',
  };

  const [screen, setScreen] = useState<'home' | 'enhance' | 'saved'>('home');
  const [lang, setLang] = useState<'en' | 'ja'>('en');
  const [notes, setNotes] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [quiz, setQuiz] = useState<any[]>([]);
  const [flipped, setFlipped] = useState<any>({});
  const [answers, setAnswers] = useState<any>({});
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modes, setModes] = useState({ summary: true, flashcards: true, quiz: true });
  const [fcCount, setFcCount] = useState(3);
  const [qzCount, setQzCount] = useState(5);
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [activeNote, setActiveNote] = useState<SavedNote | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [showLimit, setShowLimit] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState('📚 General');
  const [customSubject, setCustomSubject] = useState('');
  const [showCustomSubject, setShowCustomSubject] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const chatScrollRef = useRef<ScrollView>(null);
  const loadingInterval = useRef<any>(null);
  const messageAnims = useRef<Animated.Value[]>([]).current;

  const confettiAnims = useRef(Array.from({ length: 40 }, () => ({
    x: new Animated.Value(Math.random() * 400 - 200),
    y: new Animated.Value(-100),
    opacity: new Animated.Value(1),
    rotate: new Animated.Value(0),
    scale: new Animated.Value(Math.random() * 0.8 + 0.6),
  }))).current;

  useEffect(() => {
    const browserLang = 'en';
    setLang(browserLang);
    loadData();
  }, []);

  async function loadData() {
    try {
      const [raw, usage] = await Promise.all([
        AsyncStorage.getItem('saved_notes'),
        AsyncStorage.getItem('usage_count'),
      ]);
      if (raw) setSavedNotes(JSON.parse(raw));
      if (usage) setUsageCount(parseInt(usage));
    } catch (e) {}
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  function getSortedNotes(): SavedNote[] | { subject: string; notes: SavedNote[] }[] {
    if (sortMode === 'newest') return [...savedNotes].sort((a, b) => parseInt(b.id) - parseInt(a.id));
    if (sortMode === 'oldest') return [...savedNotes].sort((a, b) => parseInt(a.id) - parseInt(b.id));
    if (sortMode === 'subject') {
      const groups: { [key: string]: SavedNote[] } = {};
      savedNotes.forEach(note => {
        const subj = note.subject || '📚 General';
        if (!groups[subj]) groups[subj] = [];
        groups[subj].push(note);
      });
      return Object.entries(groups).map(([subject, notes]) => ({ subject, notes }));
    }
    return savedNotes;
  }

  function toggleMode(m: string) {
    setModes(prev => ({ ...prev, [m]: !prev[m as keyof typeof prev] }));
  }

  function startLoadingMessages() {
    setLoadingStep(0);
    progressAnim.setValue(0);
    Animated.timing(progressAnim, { toValue: 1, duration: 9000, useNativeDriver: false }).start();
    const msgs = lang === 'ja' ? LOADING_MESSAGES_JA : LOADING_MESSAGES_EN;
    loadingInterval.current = setInterval(() => {
      setLoadingStep(prev => (prev + 1) % msgs.length);
    }, 2000);
  }

  function stopLoadingMessages() {
    clearInterval(loadingInterval.current);
    Animated.timing(progressAnim, { toValue: 1, duration: 300, useNativeDriver: false }).start();
  }

  function triggerShake() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }

  function triggerConfetti() {
    setConfetti(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    confettiAnims.forEach(anim => {
      anim.x.setValue(Math.random() * 400 - 200);
      anim.y.setValue(-100);
      anim.opacity.setValue(1);
      anim.rotate.setValue(0);
      anim.scale.setValue(Math.random() * 0.8 + 0.6);
      Animated.parallel([
        Animated.timing(anim.y, { toValue: 900, duration: 3000 + Math.random() * 1000, useNativeDriver: true }),
        Animated.timing(anim.opacity, { toValue: 0, duration: 3000, useNativeDriver: true }),
        Animated.timing(anim.rotate, { toValue: Math.random() > 0.5 ? 15 : -15, duration: 3000, useNativeDriver: true }),
      ]).start();
    });
    setTimeout(() => setConfetti(false), 4000);
  }

  function addMessageAnim() {
    const anim = new Animated.Value(0);
    messageAnims.push(anim);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }).start();
    return anim;
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { alert('Please allow photo access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].base64 ? `data:image/jpeg;base64,${result.assets[0].base64}` : null);
      setNotes('');
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { alert('Please allow camera access.'); return; }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].base64 ? `data:image/jpeg;base64,${result.assets[0].base64}` : null);
      setNotes('');
    }
  }

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/plain'] });
      if (result.canceled) return;
      const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
      setNotes(content); setImage(null);
    } catch (e) { alert('Could not read file. Try a .txt file.'); }
  }

  function getMathInstruction() {
    const isMath = MATH_SUBJECTS.includes(selectedSubject);
    if (!isMath) return '';
    return `\nSPECIAL INSTRUCTIONS (Math/Science mode):
- In summaries: include key formulas (e.g. F = ma). Use numbered steps for processes.
- In flashcards: term = formula name, definition = formula + one line explanation.
- In quiz: include calculation-based questions where students apply formulas.`;
  }

  async function enhance() {
    if (!notes.trim() && !image) { alert(lang === 'ja' ? 'ノートか画像を追加してください！' : 'Please add notes or an image first!'); return; }
    if (usageCount >= MAX_USES) { setShowLimit(true); return; }
    const activeModes = Object.entries(modes).filter(([, v]) => v).map(([k]) => k);
    if (!activeModes.length) { alert('Select at least one output type.'); return; }

    setLoading(true);
    setSummary(null); setFlashcards([]); setQuiz([]); setFlipped({}); setAnswers({}); setQuizScore(null);
    setChatMessages([]); messageAnims.length = 0;
    Keyboard.dismiss();
    startLoadingMessages();

    const modeInstructions = [];
    if (modes.summary) modeInstructions.push(`A "summary" object with: "text" (3-5 sentence summary), "concepts" (array of 4-6 short key concept strings, max 3 words each).`);
    if (modes.flashcards) modeInstructions.push(`A "flashcards" array of exactly ${fcCount} objects. Each with "term" (1-4 words max) and "definition" (one simple sentence, max 12 words). Keep both extremely short and simple.`);
    if (modes.quiz) modeInstructions.push(`A "quiz" array of exactly ${qzCount} objects, each with "question", "options" (array of 4 strings), "answer" (0-indexed integer), "explanation" (one short simple sentence max 15 words explaining why the correct answer is right).`);

    const langInstruction = lang === 'ja' ? '\nIMPORTANT: Generate ALL text content in Japanese.' : '';
    const instruction = `You are a study assistant. Generate ONLY a JSON object (no markdown) with:\n${modeInstructions.join('\n')}${getMathInstruction()}${langInstruction}`;

    try {
      const messageContent: any[] = image
        ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.replace(/^data:image\/\w+;base64,/, '') } }, { type: 'text', text: instruction }]
        : [{ type: 'text', text: `${instruction}\n\nNotes:\n${notes}` }];

      const res = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages: [{ role: 'user', content: messageContent }] })
      });

      const data = await res.json();
      const text = (data.content || []).map((b: any) => b.text || '').join('');
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

      const newUsage = usageCount + 1;
      setUsageCount(newUsage);
      await AsyncStorage.setItem('usage_count', newUsage.toString());

      stopLoadingMessages();
      if (parsed.summary) setSummary(parsed.summary);
      if (parsed.flashcards) setFlashcards(parsed.flashcards);
      if (parsed.quiz) setQuiz(parsed.quiz);
    } catch (e) {
      stopLoadingMessages();
      alert('Something went wrong: ' + String(e));
    }
    setLoading(false);
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: chatInput };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    addMessageAnim();
    setChatInput('');
    setChatLoading(true);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const historyMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
      let contextParts = [];
      if (notes) contextParts.push(`Original notes:\n${notes}`);
      if (summary) contextParts.push(`Summary:\n${summary.text}\nConcepts: ${summary.concepts?.join(', ')}`);
      if (flashcards.length > 0) contextParts.push(`Flashcards:\n${flashcards.map((fc, i) => `${i + 1}. ${fc.term}: ${fc.definition}`).join('\n')}`);
      if (quiz.length > 0) contextParts.push(`Quiz:\n${quiz.map((q, i) => `${i + 1}. ${q.question} (answer: ${q.options[q.answer]})`).join('\n')}`);

      const systemPrompt = `You are a helpful study assistant. Answer clearly and simply in ${lang === 'ja' ? 'Japanese' : 'English'}. Keep answers concise — 2-4 sentences unless more is needed.\n\n${contextParts.join('\n\n')}`;

      let messagesWithImage = historyMessages;
      if (image && newMessages.length === 1) {
        const base64 = image.replace(/^data:image\/\w+;base64,/, '');
        messagesWithImage = [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } }, { type: 'text', text: chatInput }] as any }];
      }

      const res = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 600, system: systemPrompt, messages: messagesWithImage })
      });

      const data = await res.json();
      const reply = (data.content || []).map((b: any) => b.text || '').join('');
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      addMessageAnim();
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
      addMessageAnim();
    }
    setChatLoading(false);
  }

  async function saveNote() {
    if (!summary && flashcards.length === 0 && quiz.length === 0) { alert('Enhance your notes first!'); return; }
    setSaving(true);
    const subject = selectedSubject === '➕ Other' && customSubject ? `📝 ${customSubject}` : selectedSubject;
    const newNote: SavedNote = {
      id: Date.now().toString(),
      title: notes.trim().split('\n')[0].slice(0, 40) || 'Image note',
      notes, summary, flashcards, quiz, subject,
      date: new Date().toLocaleDateString(),
    };
    const updated = [newNote, ...savedNotes];
    setSavedNotes(updated);
    await AsyncStorage.setItem('saved_notes', JSON.stringify(updated));
    setSaving(false);
    Alert.alert(lang === 'ja' ? '保存しました！' : 'Saved!', lang === 'ja' ? 'ノートが保存されました。' : 'Your note has been saved.');
  }

  async function deleteNote(id: string) {
    Alert.alert(
      lang === 'ja' ? '削除' : 'Delete',
      lang === 'ja' ? 'このノートを削除しますか？' : 'Delete this note?',
      [
        { text: lang === 'ja' ? 'キャンセル' : 'Cancel', style: 'cancel' },
        { text: lang === 'ja' ? '削除' : 'Delete', style: 'destructive', onPress: async () => {
          const updated = savedNotes.filter(n => n.id !== id);
          setSavedNotes(updated);
          await AsyncStorage.setItem('saved_notes', JSON.stringify(updated));
          if (activeNote?.id === id) { setActiveNote(null); setScreen('saved'); }
        }}
      ]
    );
  }

  function openNote(note: SavedNote) {
    setActiveNote(note); setNotes(note.notes || ''); setSummary(note.summary);
    setFlashcards(note.flashcards || []); setQuiz(note.quiz || []);
    setFlipped({}); setAnswers({}); setQuizScore(null); setImage(null);
    setChatMessages([]); messageAnims.length = 0;
    if (note.subject) setSelectedSubject(note.subject);
    setScreen('enhance');
  }

  function newNote() {
    setActiveNote(null); setNotes(''); setSummary(null);
    setFlashcards([]); setQuiz([]); setFlipped({}); setAnswers({});
    setQuizScore(null); setImage(null); setChatMessages([]); messageAnims.length = 0;
    setChatInput(''); setSelectedSubject('📚 General'); setCustomSubject('');
    setShowCustomSubject(false); setScreen('enhance');
  }

  function answerQuiz(qi: number, oi: number, correct: number) {
    if (answers[qi] !== undefined) return;
    const isCorrect = oi === correct;
    if (isCorrect) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      triggerShake();
    }
    const newAnswers = { ...answers, [qi]: oi };
    setAnswers(newAnswers);
    if (Object.keys(newAnswers).length === quiz.length) {
      const score = Object.entries(newAnswers).filter(([qi, oi]) => Number(oi) === quiz[parseInt(qi)].answer).length;
      setQuizScore(score);
      if (score === quiz.length) triggerConfetti();
    }
  }

  async function copySummary() {
    if (summary) {
      await Clipboard.setStringAsync(summary.text);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    }
  }

  const remaining = Math.max(0, MAX_USES - usageCount);
  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const LOADING_MESSAGES = lang === 'ja' ? LOADING_MESSAGES_JA : LOADING_MESSAGES_EN;

  function SwipeableNote({ note }: { note: SavedNote }) {
    const translateX = useRef(new Animated.Value(0)).current;
    const panResponder = useRef(PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
      onPanResponderMove: (_, g) => { if (g.dx < 0) translateX.setValue(g.dx); },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -80) {
          Animated.timing(translateX, { toValue: -100, duration: 200, useNativeDriver: true }).start(() => deleteNote(note.id));
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      }
    })).current;

    return (
      <View style={{ marginBottom: 10, borderRadius: 14, overflow: 'hidden' }}>
        <View style={[s.deleteBackground, { backgroundColor: t.danger }]}>
          <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>🗑️ {lang === 'ja' ? '削除' : 'Delete'}</Text>
        </View>
        <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
          <TouchableOpacity style={[s.savedCard, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => openNote(note)}>
            <Text style={s.savedIcon}>{note.subject?.split(' ')[0] || '📚'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.savedTitle, { color: t.text }]} numberOfLines={2}>{note.title}</Text>
              <Text style={[s.savedMeta, { color: t.textMuted }]}>{note.subject ? `${note.subject} · ` : ''}{note.date}</Text>
            </View>
            <TouchableOpacity onPress={() => deleteNote(note.id)} style={[s.deleteBtn, { backgroundColor: t.dangerLight }]}>
              <Text style={[s.deleteBtnText, { color: t.danger }]}>{lang === 'ja' ? '削除' : 'Delete'}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // LIMIT SCREEN
  if (showLimit) return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={s.limitContainer}>
        <Text style={s.limitIcon}>🔒</Text>
        <Text style={[s.limitTitle, { color: t.text }]}>{lang === 'ja' ? '無料使用回数を使い切りました' : "You've reached your limit"}</Text>
        <Text style={[s.limitSubtitle, { color: t.textSecondary }]}>{lang === 'ja' ? 'ウェイトリストに登録して早期アクセスを！' : 'Join the waitlist to get early access when we launch!'}</Text>
        <TouchableOpacity style={[s.limitBtn, { backgroundColor: t.accent }]} onPress={() => Alert.alert('Waitlist', 'Email us at omarnourelden3@gmail.com to join!')}>
          <Text style={s.limitBtnText}>{lang === 'ja' ? 'ウェイトリストに登録 →' : 'Join Waitlist →'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.limitBtn, { backgroundColor: t.surfaceAlt, marginTop: 10 }]} onPress={() => setShowLimit(false)}>
          <Text style={[s.limitBtnText, { color: t.text }]}>{lang === 'ja' ? '戻る' : 'Go back'}</Text>
        </TouchableOpacity>
        <View style={[s.feedbackCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[s.feedbackTitle, { color: t.text }]}>{lang === 'ja' ? 'フィードバックを送る' : 'Send Feedback'}</Text>
          <Text style={[s.feedbackSub, { color: t.textMuted }]}>{lang === 'ja' ? 'アイデア・バグ・提案' : 'Ideas, bugs, or suggestions'}</Text>
          <TouchableOpacity style={[s.limitBtn, { backgroundColor: t.accentLight, marginTop: 12 }]} onPress={() => Alert.alert('Feedback', 'Email omarnourelden3@gmail.com')}>
            <Text style={[s.limitBtnText, { color: t.accentText }]}>{lang === 'ja' ? 'フィードバックを送る' : 'Send Feedback'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  // SAVED SCREEN
  if (screen === 'saved') {
    const sorted = getSortedNotes();
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: t.bg }]}>
        <View style={[s.header, { borderBottomColor: t.border }]}>
          <TouchableOpacity onPress={() => setScreen('home')}><Text style={[s.navBtn, { color: t.accent }]}>← {lang === 'ja' ? 'ホーム' : 'Home'}</Text></TouchableOpacity>
          <Text style={[s.headerTitle, { color: t.text }]}>{lang === 'ja' ? '保存済みノート' : 'Saved Notes'}</Text>
          <TouchableOpacity onPress={() => setLang(lang === 'en' ? 'ja' : 'en')}>
            <Text style={[s.langToggle, { color: t.accent, borderColor: t.border, backgroundColor: t.surface }]}>EN | JP</Text>
          </TouchableOpacity>
        </View>

        {/* Sort buttons */}
        <View style={[s.sortRow, { borderBottomColor: t.border }]}>
          {(['newest', 'oldest', 'subject'] as SortMode[]).map(mode => (
            <TouchableOpacity key={mode} style={[s.sortBtn, sortMode === mode && { backgroundColor: t.accentLight, borderColor: t.accent }]} onPress={() => setSortMode(mode)}>
              <Text style={[s.sortBtnText, { color: sortMode === mode ? t.accentText : t.textMuted }]}>
                {mode === 'newest' ? (lang === 'ja' ? '新しい順' : 'Newest') : mode === 'oldest' ? (lang === 'ja' ? '古い順' : 'Oldest') : (lang === 'ja' ? '科目別' : 'By Subject')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />}>
          {savedNotes.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={[s.emptyText, { color: t.text }]}>{lang === 'ja' ? 'まだ保存されたノートがありません。' : 'No saved notes yet.'}</Text>
              <Text style={[s.emptySubText, { color: t.textMuted }]}>{lang === 'ja' ? 'ノートを強化して保存してください！' : 'Enhance some notes and tap Save!'}</Text>
            </View>
          ) : sortMode === 'subject' ? (
            (sorted as { subject: string; notes: SavedNote[] }[]).map(group => (
              <View key={group.subject} style={{ marginBottom: 20 }}>
                <View style={[s.subjectGroupHeader, { backgroundColor: t.amberLight, borderColor: t.amber }]}>
                  <Text style={[s.subjectGroupTitle, { color: t.amber }]}>{group.subject}</Text>
                  <Text style={[s.subjectGroupCount, { color: t.amber }]}>{group.notes.length}</Text>
                </View>
                {group.notes.map(note => <SwipeableNote key={note.id} note={note} />)}
              </View>
            ))
          ) : (
            (sorted as SavedNote[]).map(note => <SwipeableNote key={note.id} note={note} />)
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // HOME SCREEN
  if (screen === 'home') return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={s.homeContainer}>
        <View style={s.homeTopBar}>
          <View style={[s.homeBadge, { backgroundColor: t.accentLight }]}>
            <Text style={[s.homeBadgeText, { color: t.accentText }]}>{lang === 'ja' ? 'AI搭載の学習ツール' : 'AI-powered study tool'}</Text>
          </View>
          <TouchableOpacity onPress={() => setLang(lang === 'en' ? 'ja' : 'en')}>
            <Text style={[s.langToggle, { color: t.accent, borderColor: t.border, backgroundColor: t.surface }]}>EN | JP</Text>
          </TouchableOpacity>
        </View>

        <Text style={[s.homeTitle, { color: t.text }]}>Note{'\n'}<Text style={{ color: t.accent }}>Enhancer</Text></Text>
        <Text style={[s.homeSubtitle, { color: t.textSecondary }]}>{lang === 'ja' ? 'ノートを要約・フラッシュカード・クイズに瞬時に変換します。' : 'Transform lecture notes into summaries, flashcards & quizzes — instantly.'}</Text>

        <View style={s.featureRow}>
          {[['🖼️', lang === 'ja' ? '写真' : 'Photos'], ['📄', lang === 'ja' ? 'ファイル' : 'Files'], ['✍️', lang === 'ja' ? 'テキスト' : 'Text'], ['💬', 'Ask AI']].map(([icon, label]) => (
            <View key={label} style={[s.featureChip, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={s.featureIcon}>{icon}</Text>
              <Text style={[s.featureLabel, { color: t.textSecondary }]}>{label}</Text>
            </View>
          ))}
        </View>

        {savedNotes.length > 0 && (
          <View style={{ marginBottom: 28 }}>
            <Text style={[s.recentTitle, { color: t.textMuted }]}>{lang === 'ja' ? '最近使用' : 'Recently Used'}</Text>
            {savedNotes.slice(0, 3).map(note => (
              <TouchableOpacity key={note.id} style={[s.recentCard, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => openNote(note)}>
                <Text style={s.recentIcon}>{note.subject?.split(' ')[0] || '📚'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.recentName, { color: t.text }]} numberOfLines={2}>{note.title}</Text>
                  <Text style={[s.recentSub, { color: t.textMuted }]}>{note.subject ? `${note.subject} · ` : ''}{note.date}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity style={[s.primaryBtn, { backgroundColor: t.accent }]} onPress={newNote}>
          <Text style={s.primaryBtnText}>{lang === 'ja' ? '+ 新しいノート' : '+ New Note'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.secondaryBtn, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => setScreen('saved')}>
          <Text style={[s.secondaryBtnText, { color: t.text }]}>{lang === 'ja' ? 'すべてのノートを見る' : 'View All Notes'} ({savedNotes.length})</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // ENHANCE SCREEN
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.bg }]}>
      {confetti && (
        <View style={s.confettiContainer} pointerEvents="none">
          {confettiAnims.map((anim, i) => (
            <Animated.Text key={i} style={[s.confettiPiece, {
              transform: [
                { translateX: anim.x }, { translateY: anim.y },
                { rotate: anim.rotate.interpolate({ inputRange: [-15, 15], outputRange: ['-360deg', '360deg'] }) },
                { scale: anim.scale },
              ],
              opacity: anim.opacity, left: '50%',
            }]}>
              {['🎉','⭐','✨','🌟','💫','🎊','🏆','🔥'][i % 8]}
            </Animated.Text>
          ))}
        </View>
      )}

      <View style={[s.header, { borderBottomColor: t.border }]}>
        <TouchableOpacity onPress={() => setScreen('home')}><Text style={[s.navBtn, { color: t.accent }]}>← {lang === 'ja' ? 'ホーム' : 'Home'}</Text></TouchableOpacity>
        <Text style={[s.headerTitle, { color: t.text }]}>{activeNote ? (lang === 'ja' ? 'ノートを表示' : 'Viewing') : (lang === 'ja' ? '新しいノート' : 'New Note')}</Text>
        <TouchableOpacity onPress={saveNote} disabled={saving}>
          <Text style={[s.navBtn, { color: t.accent, textAlign: 'right', fontWeight: '600' }]}>{saving ? '...' : (lang === 'ja' ? '保存' : 'Save')}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">

            <View style={s.usageWrap}>
              <View style={s.usageTop}>
                <Text style={[s.usageLabel, { color: t.textMuted }]}>{lang === 'ja' ? '残り無料使用回数' : 'Free uses remaining'}</Text>
                <Text style={[s.usageCount, { color: t.accent }]}>{remaining}/{MAX_USES}</Text>
              </View>
              <View style={[s.usageBar, { backgroundColor: t.surfaceAlt }]}>
                <View style={[s.usageFill, { backgroundColor: t.accent, width: `${(remaining / MAX_USES) * 100}%` as any }]} />
              </View>
            </View>

            <View style={s.inputTypeRow}>
              {[['📷', lang === 'ja' ? 'カメラ' : 'Camera', takePhoto], ['🖼️', lang === 'ja' ? '写真' : 'Photo', pickImage], ['📄', lang === 'ja' ? 'ファイル' : 'File', pickFile]].map(([icon, label, fn]) => (
                <TouchableOpacity key={label as string} style={[s.inputTypeBtn, { backgroundColor: t.surface, borderColor: t.border }]} onPress={fn as () => void}>
                  <Text style={s.inputTypeIcon}>{icon as string}</Text>
                  <Text style={[s.inputTypeText, { color: t.textSecondary }]}>{label as string}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[s.label, { color: t.textMuted }]}>{lang === 'ja' ? 'ノート' : 'YOUR NOTES'}</Text>
              {image && (
                <View>
                  <Image source={{ uri: image }} style={s.previewImage} resizeMode="cover" />
                  <TouchableOpacity style={s.clearImageBtn} onPress={() => setImage(null)}>
                    <Text style={[s.clearImageText, { color: t.danger }]}>✕ {lang === 'ja' ? '画像を削除' : 'Remove image'}</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TextInput
                style={[s.input, { backgroundColor: t.surfaceAlt, color: t.text, fontSize: 16 }]}
                multiline
                placeholder={lang === 'ja' ? 'ノートをここに貼り付けてください...' : 'Paste notes here, or use Camera / Photo / File above...'}
                placeholderTextColor={t.textMuted}
                value={notes}
                onChangeText={setNotes}
              />
              <View style={s.notesMeta}>
                <Text style={[s.wordCount, { color: notes.length > MAX_CHARS * 0.9 ? t.danger : t.textMuted }]}>
                  {notes.trim().split(/\s+/).filter((w: string) => w).length} {lang === 'ja' ? '語' : 'words'}
                </Text>
                {notes.length > MAX_CHARS * 0.9 && (
                  <Text style={[s.charWarning, { color: t.danger }]}>
                    {lang === 'ja' ? `文字数制限に近づいています (${notes.length}/${MAX_CHARS})` : `Approaching limit (${notes.length}/${MAX_CHARS})`}
                  </Text>
                )}
              </View>

              <Text style={[s.label, { color: t.textMuted, marginTop: 16 }]}>{lang === 'ja' ? '科目（任意）' : 'SUBJECT (OPTIONAL)'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={s.subjectRow}>
                  {SUBJECTS.map(sub => (
                    <TouchableOpacity key={sub}
                      style={[s.subjectBtn, { borderColor: t.border, backgroundColor: selectedSubject === sub ? t.amberLight : t.surface }, selectedSubject === sub && { borderColor: t.amber }]}
                      onPress={() => { setSelectedSubject(sub); setShowCustomSubject(sub === '➕ Other'); }}>
                      <Text style={[s.subjectBtnText, { color: selectedSubject === sub ? t.amber : t.textMuted }]}>{sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              {showCustomSubject && (
                <TextInput
                  style={[s.customSubjectInput, { backgroundColor: t.surfaceAlt, color: t.text, borderColor: t.border, fontSize: 16 }]}
                  placeholder={lang === 'ja' ? '科目名を入力...' : 'Enter subject name...'}
                  placeholderTextColor={t.textMuted}
                  value={customSubject}
                  onChangeText={setCustomSubject}
                />
              )}

              {MATH_SUBJECTS.includes(selectedSubject) && (
                <View style={[s.mathBadge, { backgroundColor: t.purpleLight, borderColor: t.purple }]}>
                  <Text style={[s.mathBadgeText, { color: t.purple }]}>📐 {lang === 'ja' ? '数学モード：数式とステップを含めます' : 'Math mode: formulas & steps included'}</Text>
                </View>
              )}

              <View style={s.modesRow}>
                {['summary', 'flashcards', 'quiz'].map(m => (
                  <TouchableOpacity key={m}
                    style={[s.modeBtn, { borderColor: t.border }, modes[m as keyof typeof modes] && { backgroundColor: t.accentLight, borderColor: t.accent }]}
                    onPress={() => toggleMode(m)}>
                    <Text style={[s.modeBtnText, { color: t.textMuted }, modes[m as keyof typeof modes] && { color: t.accentText }]}>
                      {lang === 'ja' ? ({ summary: '要約', flashcards: 'フラッシュカード', quiz: 'クイズ' } as any)[m] : m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {modes.flashcards && (
                <View style={s.countRow}>
                  <Text style={[s.countLabel, { color: t.textMuted }]}>{lang === 'ja' ? 'カード枚数' : 'Flashcards'}</Text>
                  {[3, 5, 10].map(n => (
                    <TouchableOpacity key={n} style={[s.countBtn, { borderColor: t.border }, fcCount === n && { backgroundColor: t.purpleLight, borderColor: t.purple }]} onPress={() => setFcCount(n)}>
                      <Text style={[s.countBtnText, { color: fcCount === n ? t.purple : t.textMuted }]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {modes.quiz && (
                <View style={s.countRow}>
                  <Text style={[s.countLabel, { color: t.textMuted }]}>{lang === 'ja' ? '問題数' : 'Questions'}</Text>
                  {[5, 10, 20].map(n => (
                    <TouchableOpacity key={n} style={[s.countBtn, { borderColor: t.border }, qzCount === n && { backgroundColor: t.purpleLight, borderColor: t.purple }]} onPress={() => setQzCount(n)}>
                      <Text style={[s.countBtnText, { color: qzCount === n ? t.purple : t.textMuted }]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity style={[s.enhanceBtn, { backgroundColor: t.accent }]} onPress={enhance} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.enhanceBtnText}>{lang === 'ja' ? 'ノートを強化する →' : 'Enhance Notes →'}</Text>}
              </TouchableOpacity>
            </View>

            {loading && (
              <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border, alignItems: 'center', paddingVertical: 32 }]}>
                <View style={[s.progressBarWrap, { backgroundColor: t.surfaceAlt }]}>
                  <Animated.View style={[s.progressBarFill, { backgroundColor: t.accent, width: progressWidth }]} />
                </View>
                <Text style={[s.loadingMsg, { color: t.text }]}>{LOADING_MESSAGES[loadingStep][0]}</Text>
                <Text style={[s.loadingSub, { color: t.textMuted }]}>{LOADING_MESSAGES[loadingStep][1]}</Text>
              </View>
            )}

            {summary && (
              <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
                <View style={[s.sectionHeader, { borderLeftColor: t.accent }]}>
                  <Text style={[s.sectionTitle, { color: t.text }]}>{lang === 'ja' ? '要約' : 'Summary'}</Text>
                </View>
                <Text style={[s.bodyText, { color: t.textSecondary }]}>{summary.text}</Text>
                <View style={s.tagsRow}>
                  {summary.concepts.map((c: string, i: number) => (
                    <View key={i} style={[s.tag, { backgroundColor: t.accentLight }]}>
                      <Text style={[s.tagText, { color: t.accentText }]}>{c}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={[s.copyBtn, { backgroundColor: t.surfaceAlt, borderColor: t.border }]} onPress={copySummary}>
                  <Text style={[s.copyBtnText, { color: t.textSecondary }]}>{copiedSummary ? (lang === 'ja' ? '✅ コピーしました！' : '✅ Copied!') : (lang === 'ja' ? '📋 要約をコピー' : '📋 Copy Summary')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {flashcards.length > 0 && (
              <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
                <View style={[s.sectionHeader, { borderLeftColor: t.purple }]}>
                  <Text style={[s.sectionTitle, { color: t.text }]}>{lang === 'ja' ? 'フラッシュカード' : 'Flashcards'}</Text>
                </View>
                <Text style={[s.hint, { color: t.textMuted }]}>{lang === 'ja' ? 'カードをタップして裏返す' : 'Tap a card to flip it'}</Text>
                {flashcards.map((fc, i) => (
                  <TouchableOpacity key={i}
                    style={[s.flashcard, { backgroundColor: flipped[i] ? t.surfaceAlt : t.purpleLight, borderColor: t.border }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFlipped((prev: any) => ({ ...prev, [i]: !prev[i] })); }}>
                    <Text style={[s.flashcardText, { color: flipped[i] ? t.textSecondary : t.purple }]}>
                      {flipped[i] ? fc.definition : fc.term}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {quiz.length > 0 && (
              <Animated.View style={[s.card, { backgroundColor: t.surface, borderColor: t.border, transform: [{ translateX: shakeAnim }] }]}>
                <View style={[s.sectionHeader, { borderLeftColor: t.amber }]}>
                  <Text style={[s.sectionTitle, { color: t.text }]}>{lang === 'ja' ? 'クイズ' : 'Quiz'}</Text>
                </View>
                {quiz.map((q, qi) => (
                  <View key={qi} style={s.quizQ}>
                    <Text style={[s.quizQText, { color: t.text }]}>{qi + 1}. {q.question}</Text>
                    {q.options.map((opt: string, oi: number) => {
                      const answered = answers[qi] !== undefined;
                      const isCorrect = oi === q.answer;
                      const isChosen = answers[qi] === oi;
                      return (
                        <TouchableOpacity key={oi} disabled={answered}
                          style={[s.quizOpt, { borderColor: t.border, backgroundColor: t.surface },
                            answered && isCorrect && { backgroundColor: t.accentLight, borderColor: t.accent },
                            answered && isChosen && !isCorrect && { backgroundColor: t.dangerLight, borderColor: t.danger }]}
                          onPress={() => answerQuiz(qi, oi, q.answer)}>
                          <Text style={[s.quizOptText, { color: t.textSecondary }]}>{opt}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {answers[qi] !== undefined && q.explanation && (
                      <View style={[s.explanationCard, { backgroundColor: t.accentLight, borderColor: t.accent }]}>
                        <Text style={[s.explanationText, { color: t.accentText }]}>💡 {q.explanation}</Text>
                      </View>
                    )}
                  </View>
                ))}
                {quizScore !== null && (
                  <View style={[s.quizScore, { backgroundColor: t.accentLight, borderColor: t.accent }]}>
                    <Text style={[s.quizScoreText, { color: t.accentText }]}>
                      {quizScore === quiz.length
                        ? (lang === 'ja' ? '🎉 満点！完璧です！' : '🎉 Perfect score!')
                        : quizScore >= quiz.length / 2
                          ? (lang === 'ja' ? `👍 ${quiz.length}問中${quizScore}問正解！` : `👍 ${quizScore}/${quiz.length} correct! Good job!`)
                          : (lang === 'ja' ? `📖 ${quiz.length}問中${quizScore}問正解。もっと勉強しよう！` : `📖 ${quizScore}/${quiz.length} correct. Keep studying!`)}
                    </Text>
                  </View>
                )}
              </Animated.View>
            )}

            {(summary || flashcards.length > 0 || quiz.length > 0) && (
              <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
                <View style={[s.sectionHeader, { borderLeftColor: t.amber }]}>
                  <Text style={[s.sectionTitle, { color: t.text }]}>{lang === 'ja' ? '💬 AIチャット' : '💬 Chat with AI'}</Text>
                </View>
                <ScrollView ref={chatScrollRef} style={s.chatScroll} contentContainerStyle={s.chatContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {chatMessages.length === 0 && (
                    <Text style={[s.chatPlaceholder, { color: t.textMuted }]}>
                      {lang === 'ja' ? 'ノートについて何でも聞いてください！' : 'Ask me anything about your notes!'}
                    </Text>
                  )}
                  {chatMessages.map((msg, i) => {
                    const anim = messageAnims[i] || new Animated.Value(1);
                    return (
                      <Animated.View key={i} style={[
                        s.chatBubbleWrap,
                        { justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' },
                        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }
                      ]}>
                        <View style={[s.chatBubble,
                          msg.role === 'user'
                            ? { backgroundColor: t.accent, borderBottomRightRadius: 4 }
                            : { backgroundColor: t.surfaceAlt, borderBottomLeftRadius: 4 }
                        ]}>
                          <Text style={[s.chatBubbleText, { color: msg.role === 'user' ? '#fff' : t.text }]}>{msg.content}</Text>
                        </View>
                      </Animated.View>
                    );
                  })}
                  {chatLoading && (
                    <View style={[s.chatBubbleWrap, { justifyContent: 'flex-start' }]}>
                      <View style={[s.chatBubble, { backgroundColor: t.surfaceAlt, borderBottomLeftRadius: 4 }]}>
                        <ActivityIndicator size="small" color={t.accent} />
                      </View>
                    </View>
                  )}
                </ScrollView>
                <View style={s.chatInputRow}>
                  <TextInput
                    style={[s.chatInput, { backgroundColor: t.surfaceAlt, color: t.text, borderColor: t.border, fontSize: 16 }]}
                    placeholder={lang === 'ja' ? 'メッセージを入力...' : 'Type a message...'}
                    placeholderTextColor={t.textMuted}
                    value={chatInput}
                    onChangeText={setChatInput}
                    onSubmitEditing={sendChat}
                    returnKeyType="send"
                  />
                  <TouchableOpacity style={[s.chatSendBtn, { backgroundColor: chatInput.trim() ? t.accent : t.surfaceAlt }]} onPress={sendChat} disabled={chatLoading || !chatInput.trim()}>
                    <Text style={[s.chatSendBtnText, { color: chatInput.trim() ? '#fff' : t.textMuted }]}>↑</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 20, paddingBottom: 60 },
  homeContainer: { padding: 28, paddingBottom: 60 },
  homeTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  homeBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  homeBadgeText: { fontSize: 12, fontWeight: '600' },
  langToggle: { fontSize: 13, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 0.5, overflow: 'hidden' },
  homeTitle: { fontSize: 52, fontWeight: '700', lineHeight: 60, letterSpacing: -1, marginBottom: 16 },
  homeSubtitle: { fontSize: 16, lineHeight: 26, marginBottom: 32 },
  featureRow: { flexDirection: 'row', gap: 10, marginBottom: 36 },
  featureChip: { flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: 14, borderWidth: 0.5 },
  featureIcon: { fontSize: 20, marginBottom: 6 },
  featureLabel: { fontSize: 11, fontWeight: '500' },
  recentTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  recentCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 0.5 },
  recentIcon: { fontSize: 24 },
  recentName: { fontSize: 14, fontWeight: '600', marginBottom: 3, lineHeight: 20 },
  recentSub: { fontSize: 12 },
  primaryBtn: { borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  secondaryBtn: { borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 0.5, marginBottom: 12 },
  secondaryBtnText: { fontWeight: '500', fontSize: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5 },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  navBtn: { fontSize: 15, width: 70 },
  sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 0.5 },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5, borderColor: 'transparent' },
  sortBtnText: { fontSize: 13, fontWeight: '500' },
  subjectGroupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 10, borderWidth: 0.5 },
  subjectGroupTitle: { fontSize: 14, fontWeight: '700' },
  subjectGroupCount: { fontSize: 13, fontWeight: '600' },
  usageWrap: { marginBottom: 16 },
  usageTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  usageLabel: { fontSize: 12 },
  usageCount: { fontSize: 12, fontWeight: '600' },
  usageBar: { height: 4, borderRadius: 4, overflow: 'hidden' },
  usageFill: { height: '100%', borderRadius: 4 },
  inputTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  inputTypeBtn: { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 0.5 },
  inputTypeIcon: { fontSize: 22, marginBottom: 6 },
  inputTypeText: { fontSize: 12, fontWeight: '500' },
  card: { borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 0.5 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 10 },
  input: { minHeight: 130, borderRadius: 12, padding: 14, textAlignVertical: 'top', lineHeight: 24 },
  notesMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, flexWrap: 'wrap' },
  wordCount: { fontSize: 11 },
  charWarning: { fontSize: 11, fontWeight: '500' },
  previewImage: { width: '100%', height: 220, borderRadius: 12, marginBottom: 10 },
  clearImageBtn: { alignItems: 'center', paddingVertical: 8 },
  clearImageText: { fontSize: 13 },
  subjectRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  subjectBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5 },
  subjectBtnText: { fontSize: 13, fontWeight: '500' },
  customSubjectInput: { borderRadius: 10, padding: 12, borderWidth: 0.5, marginTop: 10 },
  mathBadge: { borderRadius: 10, padding: 10, borderWidth: 0.5, marginTop: 12 },
  mathBadgeText: { fontSize: 12, fontWeight: '500' },
  modesRow: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  modeBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 0.5 },
  modeBtnText: { fontSize: 13, textTransform: 'capitalize' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  countLabel: { fontSize: 12, width: 80 },
  countBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5 },
  countBtnText: { fontSize: 13, fontWeight: '500' },
  enhanceBtn: { borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  enhanceBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  progressBarWrap: { width: '100%', height: 4, borderRadius: 4, overflow: 'hidden', marginBottom: 20 },
  progressBarFill: { height: '100%', borderRadius: 4 },
  loadingMsg: { fontSize: 17, fontWeight: '600', marginBottom: 6, textAlign: 'center' },
  loadingSub: { fontSize: 13, textAlign: 'center' },
  sectionHeader: { borderLeftWidth: 3, paddingLeft: 10, marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  bodyText: { fontSize: 14, lineHeight: 24 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tag: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  tagText: { fontSize: 12, fontWeight: '500' },
  copyBtn: { borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 14, borderWidth: 0.5 },
  copyBtnText: { fontSize: 13 },
  hint: { fontSize: 12, marginBottom: 12 },
  flashcard: { borderRadius: 14, padding: 20, marginBottom: 10, alignItems: 'center', borderWidth: 0.5, minHeight: 80, justifyContent: 'center' },
  flashcardText: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 22 },
  quizQ: { marginBottom: 20 },
  quizQText: { fontSize: 14, fontWeight: '600', marginBottom: 10, lineHeight: 22 },
  quizOpt: { padding: 14, borderRadius: 12, borderWidth: 0.5, marginBottom: 8 },
  quizOptText: { fontSize: 13, lineHeight: 20 },
  explanationCard: { borderRadius: 10, padding: 12, marginTop: 4, borderWidth: 0.5 },
  explanationText: { fontSize: 13, lineHeight: 20 },
  quizScore: { borderRadius: 14, padding: 16, marginTop: 10, borderWidth: 0.5, alignItems: 'center' },
  quizScoreText: { fontSize: 15, fontWeight: '600' },
  chatScroll: { maxHeight: 320 },
  chatContent: { paddingVertical: 8, gap: 10 },
  chatPlaceholder: { textAlign: 'center', fontSize: 13, paddingVertical: 20 },
  chatBubbleWrap: { flexDirection: 'row', paddingHorizontal: 4 },
  chatBubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  chatBubbleText: { fontSize: 14, lineHeight: 22 },
  chatInputRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chatInput: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 0.5 },
  chatSendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  chatSendBtnText: { fontSize: 18, fontWeight: '700' },
  savedCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 18, borderWidth: 0.5 },
  savedIcon: { fontSize: 24 },
  savedTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4, lineHeight: 22 },
  savedMeta: { fontSize: 12 },
  deleteBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  deleteBtnText: { fontSize: 12, fontWeight: '500' },
  deleteBackground: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 100, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySubText: { fontSize: 14 },
  limitContainer: { padding: 28, paddingTop: 60, alignItems: 'center' },
  limitIcon: { fontSize: 60, marginBottom: 20 },
  limitTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  limitSubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 28 },
  limitBtn: { borderRadius: 14, padding: 18, alignItems: 'center', width: '100%' },
  limitBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  feedbackCard: { borderRadius: 18, padding: 20, marginTop: 24, borderWidth: 0.5, width: '100%' },
  feedbackTitle: { fontSize: 17, fontWeight: '600', marginBottom: 6 },
  feedbackSub: { fontSize: 13 },
  confettiContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 },
  confettiPiece: { position: 'absolute', fontSize: 28 },
});