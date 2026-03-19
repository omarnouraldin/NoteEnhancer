import { registerRootComponent } from 'expo';
import { useState } from 'react';
import {
    ActivityIndicator, SafeAreaView,
    ScrollView,
    StyleSheet, Text, TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const ANTHROPIC_API_KEY = 'YOUR_API_KEY_HERE';

export default function App() {
  const [notes, setNotes] = useState('');
  const [summary, setSummary] = useState(null);
  const [flashcards, setFlashcards] = useState([]);
  const [quiz, setQuiz] = useState([]);
  const [flipped, setFlipped] = useState({});
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [modes, setModes] = useState({ summary: true, flashcards: true, quiz: true });

  function toggleMode(m) {
    setModes(prev => ({ ...prev, [m]: !prev[m] }));
  }

  async function enhance() {
    if (!notes.trim()) return;
    setLoading(true);
    setSummary(null); setFlashcards([]); setQuiz([]); setFlipped({}); setAnswers({});

    const modeInstructions = [];
    if (modes.summary) modeInstructions.push(`A "summary" object with: "text" (3-5 sentence summary), "concepts" (array of 4-6 key concept strings).`);
    if (modes.flashcards) modeInstructions.push(`A "flashcards" array of 5 objects, each with "term" and "definition".`);
    if (modes.quiz) modeInstructions.push(`A "quiz" array of 3 objects, each with "question", "options" (array of 4 strings), "answer" (0-indexed integer).`);

    const prompt = `You are a study assistant. Given the following notes, generate ONLY a JSON object (no markdown, no explanation) with these fields:\n${modeInstructions.join('\n')}\n\nNotes:\n${notes}`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await res.json();
      const text = data.content.map(b => b.text || '').join('');
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      if (parsed.summary) setSummary(parsed.summary);
      if (parsed.flashcards) setFlashcards(parsed.flashcards);
      if (parsed.quiz) setQuiz(parsed.quiz);
    } catch (e) {
      alert('Something went wrong. Please try again.');
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.container}>
        <Text style={s.title}>Note <Text style={s.titleAccent}>Enhancer</Text></Text>

        <View style={s.card}>
          <Text style={s.label}>PASTE YOUR NOTES</Text>
          <TextInput
            style={s.input} multiline placeholder="Paste lecture notes or study material here..."
            placeholderTextColor="#aaa" value={notes} onChangeText={setNotes}
          />
          <View style={s.row}>
            {['summary','flashcards','quiz'].map(m => (
              <TouchableOpacity key={m} style={[s.modeBtn, modes[m] && s.modeBtnActive]} onPress={() => toggleMode(m)}>
                <Text style={[s.modeBtnText, modes[m] && s.modeBtnTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.enhanceBtn} onPress={enhance} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.enhanceBtnText}>Enhance notes →</Text>}
          </TouchableOpacity>
        </View>

        {summary && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Summary</Text>
            <Text style={s.bodyText}>{summary.text}</Text>
            <View style={s.tagsRow}>
              {summary.concepts.map((c, i) => <View key={i} style={s.tag}><Text style={s.tagText}>{c}</Text></View>)}
            </View>
          </View>
        )}

        {flashcards.length > 0 && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Flashcards</Text>
            <Text style={s.hint}>Tap a card to flip it</Text>
            {flashcards.map((fc, i) => (
              <TouchableOpacity key={i} style={[s.flashcard, flipped[i] && s.flashcardFlipped]}
                onPress={() => setFlipped(prev => ({ ...prev, [i]: !prev[i] }))}>
                <Text style={[s.flashcardText, flipped[i] && s.flashcardTextFlipped]}>
                  {flipped[i] ? fc.definition : fc.term}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {quiz.length > 0 && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Quiz</Text>
            {quiz.map((q, qi) => (
              <View key={qi} style={s.quizQ}>
                <Text style={s.quizQText}>{qi + 1}. {q.question}</Text>
                {q.options.map((opt, oi) => {
                  const answered = answers[qi] !== undefined;
                  const isCorrect = oi === q.answer;
                  const isChosen = answers[qi] === oi;
                  return (
                    <TouchableOpacity key={oi} disabled={answered}
                      style={[s.quizOpt, answered && isCorrect && s.correct, answered && isChosen && !isCorrect && s.wrong]}
                      onPress={() => setAnswers(prev => ({ ...prev, [qi]: oi }))}>
                      <Text style={s.quizOptText}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f5' },
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 20, color: '#1a1a1a' },
  titleAccent: { color: '#1D9E75', fontStyle: 'italic' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 0.5, borderColor: '#e0e0e0' },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1, color: '#999', marginBottom: 8 },
  input: { minHeight: 120, fontSize: 14, color: '#1a1a1a', backgroundColor: '#f7f7f5', borderRadius: 10, padding: 12, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5, borderColor: '#ccc' },
  modeBtnActive: { backgroundColor: '#E1F5EE', borderColor: '#5DCAA5' },
  modeBtnText: { fontSize: 13, color: '#888', textTransform: 'capitalize' },
  modeBtnTextActive: { color: '#0F6E56' },
  enhanceBtn: { backgroundColor: '#1D9E75', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  enhanceBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 10, color: '#1a1a1a' },
  bodyText: { fontSize: 14, lineHeight: 22, color: '#333' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { backgroundColor: '#E1F5EE', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  tagText: { fontSize: 12, color: '#0F6E56' },
  hint: { fontSize: 12, color: '#aaa', marginBottom: 8 },
  flashcard: { backgroundColor: '#EEEDFE', borderRadius: 10, padding: 16, marginBottom: 8, alignItems: 'center' },
  flashcardFlipped: { backgroundColor: '#f7f7f5', borderWidth: 0.5, borderColor: '#e0e0e0' },
  flashcardText: { fontSize: 14, fontWeight: '500', color: '#3C3489', textAlign: 'center' },
  flashcardTextFlipped: { color: '#555', fontWeight: '400' },
  quizQ: { marginBottom: 16 },
  quizQText: { fontSize: 14, fontWeight: '500', color: '#1a1a1a', marginBottom: 8 },
  quizOpt: { padding: 10, borderRadius: 8, borderWidth: 0.5, borderColor: '#e0e0e0', marginBottom: 6, backgroundColor: '#fff' },
  correct: { backgroundColor: '#E1F5EE', borderColor: '#5DCAA5' },
  wrong: { backgroundColor: '#FCEBEB', borderColor: '#F09595' },
  quizOptText: { fontSize: 13, color: '#333' },
});
registerRootComponent(App);
